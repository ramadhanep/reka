#!/usr/bin/env bash
#
# agent-reka-runner.sh — REKA Autonomous Engineering System runner.
#
# The single entrypoint intended to be invoked by cron:
#
#   0 20 * * * /path/to/reka/agent-reka-runner.sh
#
# It is safe against overlapping executions, Raspberry Pi reboots, OpenCode
# crashes, provider/model failures and partial work. The filesystem state under
# .reka-agent/ is the source of truth; OpenCode session history is not.
#
# Usage:
#   agent-reka-runner.sh              run one autonomous session
#   agent-reka-runner.sh --dry-run    inspect the decision; run no agent, commit or push
#   agent-reka-runner.sh --status     print current engineering state
#   agent-reka-runner.sh --pause      create the PAUSE kill switch
#   agent-reka-runner.sh --unpause    remove the PAUSE kill switch
#   agent-reka-runner.sh --resume     clear a BLOCKED phase, then run
#   agent-reka-runner.sh --help
#
set -uo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

STATE_DIR="$REPO_ROOT/.reka-agent"
PLANS_DIR="$STATE_DIR/plans"
DEBT_DIR="$STATE_DIR/debt"
REVIEWS_DIR="$STATE_DIR/reviews"
RUNS_DIR="$STATE_DIR/runs"
LOGS_DIR="$STATE_DIR/logs"
LOCK_DIR="$STATE_DIR/lock"
STATE_FILE="$STATE_DIR/state.json"
CONFIG_FILE="$STATE_DIR/config.env"
PAUSE_FILE="$STATE_DIR/PAUSE"
JSON_HELPER="$REPO_ROOT/scripts/autonomous/agent-json.py"

PY="${PYTHON:-python3}"

# ---------------------------------------------------------------------------
# Configuration defaults (overridden by environment, then config.env)
# ---------------------------------------------------------------------------

: "${REKA_MODEL_PLANNER:=}"
: "${REKA_MODEL_EXECUTOR:=}"
: "${REKA_MODEL_REVIEWER:=}"
: "${REKA_MODEL_FIXER:=}"
: "${REKA_DAILY_BUDGET_SESSIONS:=6}"
: "${REKA_DAILY_BUDGET_TOKENS:=0}"
: "${REKA_MAX_RUN_TIME:=1800}"
: "${REKA_MAX_EXECUTION_SESSIONS:=2}"
: "${REKA_MAX_REVIEW_LOOPS:=2}"
: "${REKA_MAX_TASKS_PER_RUN:=1}"
: "${REKA_BRANCH:=main}"
: "${REKA_PUSH:=1}"
: "${REKA_PRECOMMIT_VERIFY:=}"
: "${REKA_OPENCODE_BIN:=opencode}"
: "${REKA_OPENCODE_EXTRA_ARGS:=}"
: "${REKA_PLAN_TIMEOUT:=600}"
: "${REKA_EXECUTE_TIMEOUT:=900}"
: "${REKA_REVIEW_TIMEOUT:=600}"
: "${REKA_FIX_TIMEOUT:=600}"
: "${REKA_PRUNE_DAYS:=30}"
: "${REKA_KEEP_RUNS:=50}"

# ---------------------------------------------------------------------------
# Modes and globals
# ---------------------------------------------------------------------------

MODE="run"
DRY_RUN=0
RESUME=0
START_EPOCH="$(date +%s)"
RUN_ID=""
RUN_DIR=""
RUN_JSON=""
PLAN_ID=""
PLAN_DIR=""
PLAN_JSON=""
LOCK_HELD=0
TASKS_COMPLETED=0
REVIEW_STATUS=""
PRE_RUN_SHA=""

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log() {
  local message="[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*"
  printf '%s\n' "$message"
  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$LOGS_DIR"
    printf '%s\n' "$message" >>"$LOGS_DIR/runner-$(date +%F).log"
  fi
}

die() {
  log "ERROR: $*"
  exit 1
}

# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

jget() { "$PY" "$JSON_HELPER" get "$1" "$2" 2>/dev/null; }
jgetjson() { "$PY" "$JSON_HELPER" getjson "$1" "$2" 2>/dev/null; }
jexists() { [ "$("$PY" "$JSON_HELPER" exists "$1" "$2" 2>/dev/null)" = "true" ]; }
jlen() { "$PY" "$JSON_HELPER" length "$1" "$2" 2>/dev/null; }
jvalidate() { "$PY" "$JSON_HELPER" validate "$1" >/dev/null 2>&1; }
jsetstr() { "$PY" "$JSON_HELPER" setstr "$1" "$2" "$3" >/dev/null; }
jsetint() { "$PY" "$JSON_HELPER" setint "$1" "$2" "$3" >/dev/null; }
jset() { "$PY" "$JSON_HELPER" set "$1" "$2" "$3" >/dev/null; }
jappend() { "$PY" "$JSON_HELPER" append "$1" "$2" "$3" >/dev/null; }
jaddnum() { "$PY" "$JSON_HELPER" addnum "$1" "$2" "$3" >/dev/null; }

# ---------------------------------------------------------------------------
# Layout / state
# ---------------------------------------------------------------------------

ensure_layout() {
  mkdir -p "$PLANS_DIR" "$DEBT_DIR" "$REVIEWS_DIR" "$RUNS_DIR" "$LOGS_DIR"
  [ -f "$CONFIG_FILE" ] || log "WARN: $CONFIG_FILE is missing; using built-in defaults"
  if [ ! -f "$STATE_FILE" ]; then
    cat >"$STATE_FILE" <<'JSON'
{
  "version": 1,
  "phase": "IDLE",
  "activePlanId": null,
  "activePlanDir": null,
  "planStatus": null,
  "blockedReason": null,
  "reviewLoop": 0,
  "consecutiveFailures": 0,
  "budget": {
    "date": null,
    "sessions": 0,
    "executionSessions": 0,
    "tokens": 0,
    "cost": 0
  },
  "lastRunId": null,
  "lastRunAt": null,
  "updatedAt": null
}
JSON
  fi
}

load_config() {
  if [ -f "$CONFIG_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
    set +a
  fi
}

state_get() { jget "$STATE_FILE" "$1"; }
state_phase() { state_get phase; }
state_set_phase() {
  jsetstr "$STATE_FILE" phase "$1"
  jsetstr "$STATE_FILE" updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
state_set_blocked() {
  jsetstr "$STATE_FILE" blockedReason "$1"
  state_set_phase BLOCKED
}
state_set_active_plan() {
  jsetstr "$STATE_FILE" activePlanId "$1"
  jsetstr "$STATE_FILE" activePlanDir "$2"
  jsetstr "$STATE_FILE" planStatus "${3:-ACTIVE}"
}
state_clear_active_plan() {
  jset "$STATE_FILE" activePlanId null
  jset "$STATE_FILE" activePlanDir null
  jset "$STATE_FILE" planStatus null
}
state_set_review_loop() { jsetint "$STATE_FILE" reviewLoop "$1"; }
state_review_loop() { state_get reviewLoop; }

has_active_plan() { [ -n "$(state_get activePlanId)" ]; }

load_active_plan() {
  PLAN_ID="$(state_get activePlanId)"
  PLAN_DIR="$(state_get activePlanDir)"
  if [ -n "$PLAN_DIR" ]; then
    PLAN_JSON="$PLAN_DIR/plan.json"
  else
    PLAN_JSON=""
  fi
}

# Planner success is determined by the presence and validity of the plan
# artifact, not by the planner process exit code (which may be 124 after the
# planner timed out post-write, or a non-zero exit from a crash or model error).
plan_is_valid() {
  [ -n "$PLAN_JSON" ] && [ -f "$PLAN_JSON" ] || return 1
  "$PY" "$JSON_HELPER" plan-validate "$PLAN_JSON" "$PLAN_ID" "$PLAN_DIR" >/dev/null 2>&1
}

budget_reset_if_new_day() {
  local today current
  today="$(date +%F)"
  current="$(state_get budget.date)"
  if [ "$current" != "$today" ]; then
    jsetstr "$STATE_FILE" budget.date "$today"
    jsetint "$STATE_FILE" budget.sessions 0
    jsetint "$STATE_FILE" budget.executionSessions 0
    jsetint "$STATE_FILE" budget.tokens 0
    jset "$STATE_FILE" budget.cost 0
    log "budget reset for $today"
  fi
}

bump_session_budget() {
  local tokens="$1" cost="$2" execution="$3"
  local sessions
  sessions="$(state_get budget.sessions)"
  jsetint "$STATE_FILE" budget.sessions "$((sessions + 1))"
  jaddnum "$STATE_FILE" budget.tokens "${tokens:-0}"
  jaddnum "$STATE_FILE" budget.cost "${cost:-0}"
  if [ "$execution" = "1" ]; then
    local execs
    execs="$(state_get budget.executionSessions)"
    jsetint "$STATE_FILE" budget.executionSessions "$((execs + 1))"
  fi
}

# ---------------------------------------------------------------------------
# Debt
# ---------------------------------------------------------------------------

list_open_debt() { "$PY" "$JSON_HELPER" debt-scan "$DEBT_DIR" 2>/dev/null; }

debt_count_open() {
  local count=0
  while IFS= read -r line; do
    [ -n "$line" ] && count=$((count + 1))
  done < <(list_open_debt)
  printf '%s' "$count"
}

debt_count_matching() {
  local field="$1" value="$2" count=0 severity requires type
  while IFS=$'\t' read -r _id severity requires type _title; do
    [ -z "${_id:-}" ] && continue
    case "$field:$value" in
      severity:critical) [ "$severity" = "critical" ] && count=$((count + 1)) ;;
      requiresHuman:true) [ "$requires" = "true" ] && count=$((count + 1)) ;;
      type:decision) [ "$type" = "decision" ] && count=$((count + 1)) ;;
    esac
  done < <(list_open_debt)
  printf '%s' "$count"
}

materialize_debt_from_result() {
  local result_file="$1" source_plan="$2" title="$3" reason="$4" requires_human="${5:-false}"
  if [ ! -f "$result_file" ]; then
    log "WARN: result file $result_file missing; creating generic debt"
    printf '{}' >"$result_file"
  fi
  local created
  created="$("$PY" "$JSON_HELPER" materialize-debt "$result_file" "$DEBT_DIR" "$source_plan" "$title" "$reason" "$requires_human" 2>/dev/null)"
  if [ -n "$created" ]; then
    log "debt recorded: $(printf '%s' "$created" | tr '\n' ' ')"
    while IFS= read -r debt_id; do
      [ -n "$debt_id" ] && jappend "$RUN_JSON" debt "\"$debt_id\""
    done <<<"$created"
  fi
}

# ---------------------------------------------------------------------------
# Locking
# ---------------------------------------------------------------------------

acquire_lock() {
  local attempt pid created age now
  for attempt in 1 2; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s\n' "$$" >"$LOCK_DIR/pid"
      date +%s >"$LOCK_DIR/created"
      LOCK_HELD=1
      return 0
    fi
    pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "another autonomous run is active (pid $pid); exiting safely"
      return 1
    fi
    now="$(date +%s)"
    created="$(cat "$LOCK_DIR/created" 2>/dev/null || echo 0)"
    age=$((now - created))
    if [ "$age" -gt $((REKA_MAX_RUN_TIME * 2)) ]; then
      log "removing stale lock (age ${age}s, pid ${pid:-unknown})"
      rm -rf "$LOCK_DIR"
      continue
    fi
    log "lock exists but holder is gone; removing stale lock"
    rm -rf "$LOCK_DIR"
  done
  log "unable to acquire lock"
  return 1
}

release_lock() {
  if [ "${LOCK_HELD:-0}" -eq 1 ]; then
    rm -rf "$LOCK_DIR"
    LOCK_HELD=0
  fi
}

# ---------------------------------------------------------------------------
# Git safety
# ---------------------------------------------------------------------------

current_branch() { git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null; }

has_work() {
  [ -n "$(state_get activePlanId)" ] && return 0
  [ "$(debt_count_open)" -gt 0 ] && return 0
  return 1
}

# Returns 0 when it is safe to proceed, 1 when a human change was detected.
check_git_safety() {
  if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "STOP: not a git repository"
    return 1
  fi

  local branch
  branch="$(current_branch)"
  if [ -n "$REKA_BRANCH" ] && [ "$branch" != "$REKA_BRANCH" ]; then
    log "STOP: on branch '$branch' but expected '$REKA_BRANCH'"
    return 1
  fi

  local dirty
  dirty="$(git -C "$REPO_ROOT" status --porcelain)"
  if [ -z "$dirty" ]; then
    return 0
  fi

  local phase expected=1
  phase="$(state_phase)"
  case "$phase" in
    EXECUTING | FIXING | REVIEWING | BLOCKED) expected=0 ;;
  esac
  if has_work; then
    expected=0
  fi

  if [ "$expected" -eq 1 ]; then
    log "STOP: unexpected changes in the working tree (human work detected)"
    printf '%s\n' "$dirty" | sed 's/^/    /'
    return 1
  fi

  if [ -z "$(state_get activePlanId)" ] && [ "$(debt_count_open)" -eq 0 ]; then
    log "STOP: dirty working tree with no active work to recover"
    printf '%s\n' "$dirty" | sed 's/^/    /'
    return 1
  fi

  log "recovery: adopting a dirty working tree from an interrupted phase ($phase)"
  return 0
}

# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------

budget_ok() {
  local sessions tokens budget_tokens
  sessions="$(state_get budget.sessions)"
  if [ "${REKA_DAILY_BUDGET_SESSIONS:-0}" -gt 0 ] && [ "$sessions" -ge "$REKA_DAILY_BUDGET_SESSIONS" ]; then
    log "daily session budget reached ($sessions/$REKA_DAILY_BUDGET_SESSIONS)"
    return 1
  fi
  if [ "${REKA_DAILY_BUDGET_TOKENS:-0}" -gt 0 ]; then
    tokens="$(state_get budget.tokens)"
    budget_tokens="$REKA_DAILY_BUDGET_TOKENS"
    if [ "${tokens%.*}" -ge "$budget_tokens" ]; then
      log "daily token budget reached ($tokens/$budget_tokens)"
      return 1
    fi
  fi
  return 0
}

execution_budget_ok() {
  local execs
  execs="$(state_get budget.executionSessions)"
  if [ "${REKA_MAX_EXECUTION_SESSIONS:-0}" -gt 0 ] && [ "$execs" -ge "$REKA_MAX_EXECUTION_SESSIONS" ]; then
    log "max execution sessions reached for this run ($execs/$REKA_MAX_EXECUTION_SESSIONS)"
    return 1
  fi
  return 0
}

remaining_time() {
  printf '%s' "$((REKA_MAX_RUN_TIME - ($(date +%s) - START_EPOCH)))"
}

run_time_exhausted() {
  [ "$(remaining_time)" -lt 60 ]
}

phase_timeout() {
  local configured="$1" remaining
  remaining="$(remaining_time)"
  if [ "$remaining" -lt 1 ]; then
    printf '1'
  elif [ "$configured" -lt "$remaining" ]; then
    printf '%s' "$configured"
  else
    printf '%s' "$remaining"
  fi
}

# ---------------------------------------------------------------------------
# OpenCode invocation
# ---------------------------------------------------------------------------

invoke_phase() {
  local agent="$1" model="$2" prompt="$3" outfile="$4" timeout_s="$5"
  local -a args=(run --format json --auto --agent "$agent" --title "$RUN_ID-$agent")
  [ -n "$model" ] && args+=(-m "$model")
  if [ -n "$REKA_OPENCODE_EXTRA_ARGS" ]; then
    # shellcheck disable=SC2206
    local -a extra=($REKA_OPENCODE_EXTRA_ARGS)
    args+=("${extra[@]}")
  fi
  log "invoking agent '$agent' (timeout ${timeout_s}s)"
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM "$timeout_s" "$REKA_OPENCODE_BIN" "${args[@]}" "$prompt" \
      >"$outfile" 2>"$outfile.err"
    return $?
  fi
  "$REKA_OPENCODE_BIN" "${args[@]}" "$prompt" >"$outfile" 2>"$outfile.err"
  return $?
}

read_phase_stats() {
  local outfile="$1" line
  line="$("$PY" "$JSON_HELPER" events-stats "$outfile" 2>/dev/null || printf '0\t0\t')"
  PHASE_TOKENS="$(printf '%s' "$line" | cut -f1)"
  PHASE_COST="$(printf '%s' "$line" | cut -f2)"
  PHASE_SESSION="$(printf '%s' "$line" | cut -f3)"
  : "${PHASE_TOKENS:=0}"
  : "${PHASE_COST:=0}"
}

record_phase() {
  local phase="$1" agent="$2" model="$3" exit_code="$4" timed_out="$5" note="$6"
  local obj
  obj="$(cat <<JSON
{"phase":"$phase","agent":"$agent","model":"$model","exitCode":$exit_code,"timedOut":$timed_out,"tokens":${PHASE_TOKENS:-0},"cost":${PHASE_COST:-0},"sessionId":"${PHASE_SESSION:-}","note":"$note","at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON
)"
  jappend "$RUN_JSON" phases "$obj"
}

phase_failed() {
  local code="$1"
  [ "$code" -eq 124 ] && return 0
  [ "$code" -ne 0 ] && return 0
  return 1
}

# ---------------------------------------------------------------------------
# Run record
# ---------------------------------------------------------------------------

new_run_id() { printf 'RUN-%s-%s' "$(date +%Y%m%d-%H%M%S)" "$$"; }

run_new() {
  local previous
  previous="$(state_get lastRunId)"
  if [ -n "$previous" ] && [ -f "$RUNS_DIR/$previous/run.json" ]; then
    if [ "$(jget "$RUNS_DIR/$previous/run.json" status)" = "RUNNING" ]; then
      jsetstr "$RUNS_DIR/$previous/run.json" status INTERRUPTED
      log "marked interrupted run $previous as INTERRUPTED"
    fi
  fi

  RUN_ID="$(new_run_id)"
  RUN_DIR="$RUNS_DIR/$RUN_ID"
  RUN_JSON="$RUN_DIR/run.json"
  mkdir -p "$RUN_DIR"
  cat >"$RUN_JSON" <<JSON
{
  "runId": "$RUN_ID",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "endedAt": null,
  "status": "RUNNING",
  "phase": null,
  "planId": null,
  "phases": [],
  "commit": null,
  "pushed": false,
  "review": null,
  "debt": [],
  "failureReason": null,
  "notes": []
}
JSON
  jsetstr "$STATE_FILE" lastRunId "$RUN_ID"
  jsetstr "$STATE_FILE" lastRunAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

run_note() {
  [ -f "$RUN_JSON" ] || return 0
  jappend "$RUN_JSON" notes "\"$1\""
}

run_finalize() {
  local status="$1"
  jsetstr "$RUN_JSON" endedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jsetstr "$RUN_JSON" status "$status"
  jsetstr "$RUN_JSON" phase "$(state_phase)"
  local plan
  plan="$(state_get activePlanId)"
  [ -n "$plan" ] && jsetstr "$RUN_JSON" planId "$plan"
  "$PY" "$JSON_HELPER" run-md "$RUN_JSON" "$RUN_DIR/summary.md" >/dev/null 2>&1
  log "run $RUN_ID finished with status $status"
}

# ---------------------------------------------------------------------------
# Decision tree / state machine
# ---------------------------------------------------------------------------

determine_phase() {
  local human_count
  human_count="$(debt_count_matching requiresHuman true)"
  if [ "$human_count" -gt 0 ]; then
    printf 'BLOCKED'
    return
  fi

  local phase
  phase="$(state_phase)"
  case "$phase" in
    PLANNING)
      # Crash/restart recovery: the planner may have written a valid plan and
      # been killed (timeout or process death) before the state was flipped to
      # EXECUTING. Resume that plan; never regenerate it.
      if plan_is_valid; then
        printf 'EXECUTING'
      else
        printf 'PLANNING'
      fi
      return
      ;;
    BLOCKED | EXECUTING | REVIEWING | FIXING)
      printf '%s' "$phase"
      return
      ;;
  esac

  local open_count
  open_count="$(debt_count_open)"
  if [ "$open_count" -gt 0 ]; then
    printf 'EXECUTING'
    return
  fi
  if has_active_plan; then
    printf 'EXECUTING'
    return
  fi
  printf 'PLANNING'
}

# ---------------------------------------------------------------------------
# Phase: PLANNING
# ---------------------------------------------------------------------------

prompt_plan() {
  cat <<EOF
REKA AUTONOMOUS ENGINEERING - PHASE: PLANNING
Repository root: $REPO_ROOT
Run ID: $RUN_ID
Plan ID: $PLAN_ID
Output file (required): $PLAN_JSON

Read your agent instructions and the project documents first. Inspect the
repository, .reka-agent/state.json, open debt and recent runs.

Produce exactly one bounded plan and write it as JSON to the output file above,
matching the schema in your instructions. Write the plan file, THEN STOP
immediately. Do not run tests, do not implement code, do not inspect more
files, and do not revise the plan once it is written. The plan file being
present and valid is the finish line; the runner may end your session right
after it. Do not write any other file.
EOF
}

# Adopt an already-valid plan: persist it as the active plan and move to
# EXECUTING without invoking the planner again.
adopt_plan() {
  local pid="$1" pdir="$2"
  PLAN_ID="$pid"
  PLAN_DIR="$pdir"
  PLAN_JSON="$pdir/plan.json"
  jsetint "$STATE_FILE" consecutiveFailures 0
  state_set_active_plan "$PLAN_ID" "$PLAN_DIR" ACTIVE
  state_set_review_loop 0
  state_set_phase EXECUTING
  jsetstr "$RUN_JSON" planId "$PLAN_ID"
  run_note "resumed existing plan $PLAN_ID"
  log "plan resumed: $PLAN_ID - $(jget "$PLAN_JSON" goal)"
}

do_plan() {
  local reuse=0
  if [ -n "$(state_get activePlanId)" ]; then
    load_active_plan
    if plan_is_valid; then
      log "reusing existing valid plan $PLAN_ID (interrupted after plan write)"
      adopt_plan "$PLAN_ID" "$PLAN_DIR"
      return 0
    fi
    reuse=1
  fi

  if [ "$reuse" -eq 0 ]; then
    # Discover plan: a previous planner process may have timed out or crashed
    # after writing a valid ACTIVE plan that was never adopted. Resume it
    # instead of creating a duplicate.
    local candidate
    candidate="$("$PY" "$JSON_HELPER" plan-scan "$PLANS_DIR" 2>/dev/null)"
    if [ -n "$candidate" ]; then
      log "adopting an existing active plan left by an interrupted planner: $candidate"
      adopt_plan "$(basename "$candidate")" "$candidate"
      return 0
    fi
    PLAN_ID="PLAN-$(date +%Y%m%d-%H%M%S)-$$"
    PLAN_DIR="$PLANS_DIR/$PLAN_ID"
    PLAN_JSON="$PLAN_DIR/plan.json"
  else
    log "reusing plan directory $PLAN_DIR for a fresh planner session"
  fi
  mkdir -p "$PLAN_DIR"
  rm -f "$PLAN_JSON"

  # Persist the in-flight planning position before invoking the planner so a
  # crash mid-planning can resume instead of creating a duplicate plan.
  state_set_active_plan "$PLAN_ID" "$PLAN_DIR" PENDING
  state_set_review_loop 0
  state_set_phase PLANNING

  local outfile="$LOGS_DIR/$RUN_ID-plan.jsonl"
  local code timeout_s
  timeout_s="$(phase_timeout "$REKA_PLAN_TIMEOUT")"
  invoke_phase reka-planner "$REKA_MODEL_PLANNER" "$(prompt_plan)" "$outfile" "$timeout_s"
  code=$?
  read_phase_stats "$outfile"
  local timed_out=false
  [ "$code" -eq 124 ] && timed_out=true
  bump_session_budget "$PHASE_TOKENS" "$PHASE_COST" 0
  record_phase PLANNING reka-planner "$REKA_MODEL_PLANNER" "$code" "$timed_out" "plan $PLAN_ID"

  if plan_is_valid; then
    # CASE A/B/D: a valid plan artifact wins regardless of the process exit
    # code. The planner may have kept exploring and timed out after writing the
    # plan (exit 124), or crashed with a valid plan on disk; the plan is kept.
    if [ "$code" -ne 0 ]; then
      run_note "planner exited $code${timed_out:+ (timed out)} after writing a valid plan; plan preserved"
      log "planner exited $code after writing a valid plan; treating planning as successful"
    fi
    jsetint "$STATE_FILE" consecutiveFailures 0
    jsetstr "$PLAN_JSON" id "$PLAN_ID"
    jsetstr "$PLAN_JSON" status ACTIVE
    "$PY" "$JSON_HELPER" plan-md "$PLAN_JSON" "$PLAN_DIR/plan.md" >/dev/null 2>&1

    if [ "$(jget "$PLAN_JSON" requiresHumanDecision)" = "true" ]; then
      local decision
      decision="$(jget "$PLAN_JSON" humanDecision)"
      materialize_debt_from_result "$PLAN_JSON" "$PLAN_ID" "Human decision required" "$decision" "true"
      state_set_active_plan "$PLAN_ID" "$PLAN_DIR" ACTIVE
      state_set_blocked "planning requires a human decision"
      run_note "planning blocked on a human decision"
      return 1
    fi

    state_set_active_plan "$PLAN_ID" "$PLAN_DIR" ACTIVE
    state_set_review_loop 0
    state_set_phase EXECUTING
    jsetstr "$RUN_JSON" planId "$PLAN_ID"
    log "plan created: $PLAN_ID - $(jget "$PLAN_JSON" goal)"
    return 0
  fi

  # CASE C: no valid plan exists. A non-zero/timeout exit is a genuine planning
  # failure. Clear the in-flight plan position so the next run plans fresh.
  log "planner exited $code without a valid plan at $PLAN_JSON; planning failed"
  rm -rf "$PLAN_DIR"
  state_clear_active_plan
  state_set_phase IDLE
  local failures
  failures="$(state_get consecutiveFailures)"
  jsetint "$STATE_FILE" consecutiveFailures "$((failures + 1))"
  [ "$((failures + 1))" -ge 3 ] && state_set_blocked "planner produced no valid plan 3 times"
  return 1
}

# ---------------------------------------------------------------------------
# Phase: EXECUTING
# ---------------------------------------------------------------------------

debt_summary() {
  local output=""
  while IFS=$'\t' read -r id severity requires type title; do
    [ -z "${id:-}" ] && continue
    output+="  - $id [$severity/$type] $title"$'\n'
  done < <(list_open_debt)
  [ -n "$output" ] && printf '%s' "$output" || printf '  (none)\n'
}

prompt_execute() {
  local result_file="$1"
  cat <<EOF
REKA AUTONOMOUS ENGINEERING - PHASE: EXECUTION
Repository root: $REPO_ROOT
Run ID: $RUN_ID
Plan ID: $PLAN_ID
Plan directory: $PLAN_DIR
Result file (required): $result_file

Open debt:
$(debt_summary)
Continue from the current filesystem state. A previous session may have
completed part of the work. Read the plan, the state and the repository, then
implement the plan, test it and update documentation.

Do NOT commit. Do NOT push. Write your result as JSON to the result file above
matching the schema in your instructions. If you cannot finish, report PARTIAL
and describe exactly what remains.
EOF
}

do_execute() {
  local execution=1
  if ! execution_budget_ok; then
    return 1
  fi

  local result_file="$RUN_DIR/executor-result.json"
  rm -f "$result_file"
  local outfile="$LOGS_DIR/$RUN_ID-execute.jsonl"
  local code timeout_s
  timeout_s="$(phase_timeout "$REKA_EXECUTE_TIMEOUT")"
  invoke_phase reka-executor "$REKA_MODEL_EXECUTOR" "$(prompt_execute "$result_file")" "$outfile" "$timeout_s"
  code=$?
  read_phase_stats "$outfile"
  local timed_out=false
  [ "$code" -eq 124 ] && timed_out=true
  bump_session_budget "$PHASE_TOKENS" "$PHASE_COST" "$execution"
  record_phase EXECUTING reka-executor "$REKA_MODEL_EXECUTOR" "$code" "$timed_out" "plan $PLAN_ID"

  if phase_failed "$code"; then
    materialize_debt_from_result "$result_file" "$PLAN_ID" "Execution interrupted" "execution session ended with exit $code"
    state_set_phase EXECUTING
    jsetstr "$RUN_JSON" failureReason "executor exited $code"
    return 1
  fi

  if ! jvalidate "$result_file"; then
    materialize_debt_from_result "$result_file" "$PLAN_ID" "Executor produced no valid result" "invalid or missing executor-result.json"
    state_set_phase EXECUTING
    return 1
  fi

  local status
  status="$(jget "$result_file" status)"
  case "$status" in
    COMPLETE)
      state_set_phase REVIEWING
      log "executor reports COMPLETE; moving to review"
      return 0
      ;;
    PARTIAL)
      materialize_debt_from_result "$result_file" "$PLAN_ID" "Unfinished plan work" "executor reported PARTIAL"
      state_set_phase EXECUTING
      log "executor reports PARTIAL; progress saved as debt"
      return 0
      ;;
    BLOCKED)
      materialize_debt_from_result "$result_file" "$PLAN_ID" "Execution blocked" "executor reported BLOCKED"
      state_set_blocked "executor reported BLOCKED"
      return 1
      ;;
    *)
      materialize_debt_from_result "$result_file" "$PLAN_ID" "Unknown executor status" "unrecognized status: $status"
      state_set_phase EXECUTING
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Phase: REVIEWING
# ---------------------------------------------------------------------------

review_path() {
  local index="${1:-$(state_review_loop)}"
  printf '%s/REV-%s-%s.json' "$REVIEWS_DIR" "$RUN_ID" "$index"
}

latest_review_path() {
  local loop index
  loop="$(state_review_loop)"
  index=$((loop - 1))
  [ "$index" -lt 0 ] && index=0
  review_path "$index"
}

commit_message_for_plan() {
  local message=""
  if [ -n "$PLAN_JSON" ] && [ -f "$PLAN_JSON" ]; then
    message="$(jget "$PLAN_JSON" goal)"
  fi
  local from_result
  from_result="$(jget "$RUN_DIR/executor-result.json" commitMessage)"
  if [ -n "$from_result" ] && [ "$from_result" != "null" ]; then
    message="$from_result"
  fi
  [ -n "$message" ] && [ "$message" != "null" ] || message="chore(agent): autonomous engineering update"
  printf '%s' "$message"
}

prompt_review() {
  local review_file="$1"
  cat <<EOF
REKA AUTONOMOUS ENGINEERING - PHASE: REVIEW
Repository root: $REPO_ROOT
Run ID: $RUN_ID
Plan ID: $PLAN_ID
Plan directory: $PLAN_DIR
Review output file (required): $review_file

Review the uncommitted changes produced by the executor. Inspect the real
files, run the tests when practical, and verify correctness, architecture,
security, multi-tenancy, auditability, tests, UX and documentation.

Do NOT edit files. Do NOT commit. Write your review as JSON to the output file
above matching the schema in your instructions.
EOF
}

do_review() {
  local review_file
  review_file="$(review_path)"
  rm -f "$review_file"
  local outfile="$LOGS_DIR/$RUN_ID-review-$(state_review_loop).jsonl"
  local code timeout_s
  timeout_s="$(phase_timeout "$REKA_REVIEW_TIMEOUT")"
  invoke_phase reka-reviewer "$REKA_MODEL_REVIEWER" "$(prompt_review "$review_file")" "$outfile" "$timeout_s"
  code=$?
  read_phase_stats "$outfile"
  local timed_out=false
  [ "$code" -eq 124 ] && timed_out=true
  bump_session_budget "$PHASE_TOKENS" "$PHASE_COST" 0
  record_phase REVIEWING reka-reviewer "$REKA_MODEL_REVIEWER" "$code" "$timed_out" "review $(state_review_loop)"

  if phase_failed "$code" || ! jvalidate "$review_file"; then
    log "review session failed or produced invalid output"
    review_retry_or_block "reviewer did not produce a valid review"
    return $?
  fi

  local status
  status="$(jget "$review_file" status)"
  jsetstr "$RUN_JSON" review.status "$status"
  jsetstr "$RUN_JSON" review.path "$review_file"

  if [ "$status" = "PASS" ]; then
    if [ "$(jlen "$review_file" blockingIssues)" -gt 0 ]; then
      log "reviewer status PASS with blocking issues; treating as FAIL"
      status=FAIL
    fi
  fi

  case "$status" in
    PASS)
      log "review PASS"
      finalize_plan_after_pass "$review_file"
      return $?
      ;;
    FAIL)
      local loop
      loop="$(state_review_loop)"
      loop=$((loop + 1))
      state_set_review_loop "$loop"
      log "review FAIL (loop $loop/$REKA_MAX_REVIEW_LOOPS)"
      if [ "$loop" -ge "$REKA_MAX_REVIEW_LOOPS" ]; then
        materialize_debt_from_result "$review_file" "$PLAN_ID" "Review did not pass" "review failed after $loop loops"
        state_set_blocked "review failed after $loop loops"
        return 1
      fi
      state_set_phase FIXING
      return 0
      ;;
    *)
      log "unknown review status: $status"
      review_retry_or_block "unrecognized review status"
      return $?
      ;;
  esac
}

review_retry_or_block() {
  local reason="$1" loop
  loop="$(state_review_loop)"
  loop=$((loop + 1))
  state_set_review_loop "$loop"
  if [ "$loop" -ge "$REKA_MAX_REVIEW_LOOPS" ]; then
    state_set_blocked "$reason"
    return 1
  fi
  state_set_phase REVIEWING
  return 0
}

# ---------------------------------------------------------------------------
# Commit / push (only after review PASS)
# ---------------------------------------------------------------------------

trailer_for_run() { printf 'Reka-Agent-Run: %s' "$RUN_ID"; }

verify_autonomous_commits() {
  local base="$1" sha trailers
  if [ -z "$base" ]; then
    log "STOP: no pre-run commit reference available for push verification"
    return 1
  fi
  while IFS= read -r sha; do
    [ -z "$sha" ] && continue
    trailers="$(git -C "$REPO_ROOT" log -1 --format=%B "$sha")"
    if ! printf '%s' "$trailers" | grep -q "$(trailer_for_run)"; then
      log "STOP: commit $sha was not created by this autonomous run"
      return 1
    fi
  done < <(git -C "$REPO_ROOT" log --format=%H "$base..HEAD" 2>/dev/null)
  return 0
}

finalize_plan_after_pass() {
  local review_file="$1"

  if [ -n "$REKA_PRECOMMIT_VERIFY" ]; then
    log "running pre-commit verification: $REKA_PRECOMMIT_VERIFY"
    if ! (cd "$REPO_ROOT" && eval "$REKA_PRECOMMIT_VERIFY"); then
      log "pre-commit verification failed; not committing"
      state_set_blocked "pre-commit verification failed"
      return 1
    fi
  fi

  if ! git -C "$REPO_ROOT" check-ignore -q ".reka-agent/state.json"; then
    log "STOP: .reka-agent state is not gitignored; refusing to commit autonomous state"
    state_set_blocked "autonomous state is not gitignored"
    return 1
  fi

  local dirty
  dirty="$(git -C "$REPO_ROOT" status --porcelain)"
  local commit_sha=""

  if [ -z "$dirty" ]; then
    log "no file changes to commit; marking plan complete"
  else
    local message
    message="$(commit_message_for_plan)"
    git -C "$REPO_ROOT" add -A
    if ! git -C "$REPO_ROOT" commit -m "$message" -m "$(trailer_for_run)" -m "Reka-Agent-Plan: $PLAN_ID" >/dev/null 2>&1; then
      log "git commit failed; not committing"
      state_set_blocked "git commit failed"
      return 1
    fi
    commit_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
    jsetstr "$RUN_JSON" commit "$commit_sha"
    log "committed $commit_sha"
  fi

  if [ "${REKA_PUSH:-0}" = "1" ] && [ -n "$commit_sha" ]; then
    if ! verify_autonomous_commits "$PRE_RUN_SHA"; then
      log "STOP: refusing to push because non-autonomous commits are present"
      state_set_blocked "unexpected commits present before push"
      return 1
    fi
    if git -C "$REPO_ROOT" push origin HEAD >/dev/null 2>&1; then
      jset "$RUN_JSON" pushed true
      log "pushed to origin"
    else
      jsetstr "$RUN_JSON" failureReason "git push failed"
      state_set_blocked "git push failed"
      return 1
    fi
  else
    log "push disabled (REKA_PUSH=$REKA_PUSH)"
  fi

  if [ -n "$PLAN_JSON" ] && [ -f "$PLAN_JSON" ]; then
    jsetstr "$PLAN_JSON" status COMPLETE
    jsetstr "$PLAN_JSON" completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
  state_clear_active_plan
  state_set_review_loop 0
  state_set_phase COMPLETE
  TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
  log "plan $PLAN_ID complete"
  return 0
}

# ---------------------------------------------------------------------------
# Phase: FIXING
# ---------------------------------------------------------------------------

prompt_fix() {
  local review_file="$1" result_file="$2"
  cat <<EOF
REKA AUTONOMOUS ENGINEERING - PHASE: FIX
Repository root: $REPO_ROOT
Run ID: $RUN_ID
Plan ID: $PLAN_ID
Plan directory: $PLAN_DIR
Review file: $review_file
Result file (required): $result_file

An independent reviewer returned FAIL. Read the review and fix only the blocking
issues it identified. Do not expand scope. Test your fixes.

Do NOT commit. Do NOT push. Write your result as JSON to the result file above
matching the schema in your instructions.
EOF
}

do_fix() {
  local review_file
  review_file="$(latest_review_path)"
  if [ ! -f "$review_file" ]; then
    state_set_blocked "no review file available for fixing"
    return 1
  fi

  local result_file="$RUN_DIR/fixer-result.json"
  rm -f "$result_file"
  local outfile="$LOGS_DIR/$RUN_ID-fix-$(state_review_loop).jsonl"
  local code timeout_s
  timeout_s="$(phase_timeout "$REKA_FIX_TIMEOUT")"
  invoke_phase reka-fixer "$REKA_MODEL_FIXER" "$(prompt_fix "$review_file" "$result_file")" "$outfile" "$timeout_s"
  code=$?
  read_phase_stats "$outfile"
  local timed_out=false
  [ "$code" -eq 124 ] && timed_out=true
  bump_session_budget "$PHASE_TOKENS" "$PHASE_COST" 1
  record_phase FIXING reka-fixer "$REKA_MODEL_FIXER" "$code" "$timed_out" "review $(state_review_loop)"

  if phase_failed "$code" || ! jvalidate "$result_file"; then
    materialize_debt_from_result "$result_file" "$PLAN_ID" "Fixing incomplete" "fixer session ended without a valid result"
    state_set_blocked "fixer session failed"
    return 1
  fi

  local status
  status="$(jget "$result_file" status)"
  case "$status" in
    FIXED)
      state_set_phase REVIEWING
      log "fixer reports FIXED; re-reviewing"
      return 0
      ;;
    PARTIAL | BLOCKED)
      materialize_debt_from_result "$result_file" "$PLAN_ID" "Fixing incomplete" "fixer reported $status"
      state_set_phase FIXING
      [ "$status" = "BLOCKED" ] && state_set_blocked "fixer reported BLOCKED"
      return 1
      ;;
    *)
      materialize_debt_from_result "$result_file" "$PLAN_ID" "Unknown fixer status" "unrecognized status: $status"
      state_set_blocked "unknown fixer status"
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Pruning
# ---------------------------------------------------------------------------

prune_history() {
  [ "${REKA_KEEP_RUNS:-0}" -gt 0 ] || return 0
  local total oldest
  total="$(find "$RUNS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)"
  while [ "$total" -gt "$REKA_KEEP_RUNS" ]; do
    oldest="$(find "$RUNS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-)"
    [ -z "$oldest" ] && break
    rm -rf "$oldest"
    total=$((total - 1))
  done
  if [ "${REKA_PRUNE_DAYS:-0}" -gt 0 ]; then
    find "$LOGS_DIR" -type f -mtime "+$REKA_PRUNE_DAYS" -delete 2>/dev/null
  fi
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

run_loop() {
  local phase rc
  while :; do
    if ! budget_ok; then
      run_note "stopped: daily budget exhausted"
      break
    fi
    if run_time_exhausted; then
      run_note "stopped: run time limit reached"
      break
    fi
    if [ "$TASKS_COMPLETED" -ge "${REKA_MAX_TASKS_PER_RUN:-1}" ]; then
      break
    fi

    phase="$(determine_phase)"
    log "phase: $phase"
    rc=0
    case "$phase" in
      PLANNING)
        do_plan || rc=1
        ;;
      EXECUTING)
        do_execute || rc=1
        ;;
      REVIEWING)
        do_review || rc=1
        ;;
      FIXING)
        do_fix || rc=1
        ;;
      COMPLETE | IDLE)
        break
        ;;
      BLOCKED)
        log "state is BLOCKED: $(state_get blockedReason)"
        break
        ;;
      *)
        log "unknown phase '$phase'; stopping"
        rc=1
        ;;
    esac
    [ "$rc" -ne 0 ] && break
  done
}

main_run() {
  check_prerequisites

  if [ -f "$PAUSE_FILE" ]; then
    log "PAUSE present; autonomous runner exiting without invoking OpenCode"
    return 0
  fi

  if ! acquire_lock; then
    return 0
  fi
  trap release_lock EXIT

  if [ "$RESUME" -eq 1 ]; then
    if [ "$(state_phase)" = "BLOCKED" ]; then
      log "resuming from BLOCKED: $(state_get blockedReason)"
      jset "$STATE_FILE" blockedReason null
      state_set_phase IDLE
    fi
  fi

  budget_reset_if_new_day

  if ! budget_ok; then
    log "daily budget already exhausted; exiting"
    return 0
  fi

  if ! check_git_safety; then
    return 1
  fi

  PRE_RUN_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"

  load_active_plan
  run_new
  log "starting autonomous run $RUN_ID (phase $(state_phase))"
  run_loop
  run_finalize "$(run_status)"
  prune_history
  return 0
}

run_status() {
  # The run status describes how the process ended, not the engineering result.
  # phase describes the engineering position; examine the phases[] array and
  # failureReason for the detailed outcome of each session.
  case "$(state_phase)" in
    BLOCKED) printf 'BLOCKED' ;;
    COMPLETE) printf 'COMPLETE' ;;
    EXECUTING | REVIEWING | FIXING) printf 'INCOMPLETE' ;;
    *) printf 'DONE' ;;
  esac
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
REKA Autonomous Engineering System runner.

Usage:
  agent-reka-runner.sh              run one autonomous session
  agent-reka-runner.sh --dry-run    inspect the decision; run no agent, commit or push
  agent-reka-runner.sh --status     print current engineering state
  agent-reka-runner.sh --pause      create the PAUSE kill switch
  agent-reka-runner.sh --unpause    remove the PAUSE kill switch
  agent-reka-runner.sh --resume     clear a BLOCKED phase, then run
  agent-reka-runner.sh --help

Configuration: .reka-agent/config.env
Documentation: docs/autonomous-engineering.md
EOF
}

check_prerequisites() {
  command -v "$PY" >/dev/null 2>&1 || die "python3 is required (set PYTHON to override)"
  command -v git >/dev/null 2>&1 || die "git is required"
  local bin="${REKA_OPENCODE_BIN%% *}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "WARN: opencode binary '$bin' not found on PATH"
    else
      die "opencode binary '$bin' not found on PATH"
    fi
  fi
}

cmd_status() {
  log "=== REKA autonomous status ==="
  if [ -f "$PAUSE_FILE" ]; then
    log "PAUSE: present (automation is paused)"
  else
    log "PAUSE: absent (automation enabled)"
  fi
  if [ -d "$LOCK_DIR" ]; then
    log "LOCK: present (pid $(cat "$LOCK_DIR/pid" 2>/dev/null || echo '?'))"
  else
    log "LOCK: absent"
  fi
  log "phase: $(state_phase)"
  log "active plan: $(state_get activePlanId)"
  log "blocked reason: $(state_get blockedReason)"
  log "budget: sessions=$(state_get budget.sessions)/$REKA_DAILY_BUDGET_SESSIONS execution=$(state_get budget.executionSessions)/$REKA_MAX_EXECUTION_SESSIONS tokens=$(state_get budget.tokens) cost=$(state_get budget.cost) day=$(state_get budget.date)"
  log "review loop: $(state_review_loop)/$REKA_MAX_REVIEW_LOOPS"
  log "open debt ($(debt_count_open)):"
  debt_summary
  local last
  last="$(state_get lastRunId)"
  if [ -n "$last" ] && [ -f "$RUNS_DIR/$last/run.json" ]; then
    log "last run: $last -> $(jget "$RUNS_DIR/$last/run.json" status) (summary: $RUNS_DIR/$last/summary.md)"
  fi
}

cmd_pause() {
  mkdir -p "$STATE_DIR"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$PAUSE_FILE"
  log "PAUSE created; automation will not run until --unpause"
}

cmd_unpause() {
  rm -f "$PAUSE_FILE"
  log "PAUSE removed; automation enabled"
}

cmd_dry_run() {
  log "=== DRY RUN (no OpenCode invocation, no commit, no push) ==="
  check_prerequisites
  if [ -f "$PAUSE_FILE" ]; then
    log "PAUSE present: a real run would exit immediately"
    return 0
  fi
  if [ -d "$LOCK_DIR" ]; then
    log "LOCK present: a real run would exit safely (another run active)"
  else
    log "lock: free"
  fi
  if check_git_safety; then
    log "git safety: OK (branch $(current_branch))"
  else
    log "git safety: STOP condition detected (a real run would not proceed)"
  fi
  log "current phase: $(state_phase)"
  log "budget: sessions=$(state_get budget.sessions)/$REKA_DAILY_BUDGET_SESSIONS tokens=$(state_get budget.tokens)/${REKA_DAILY_BUDGET_TOKENS:-0}"
  log "open debt ($(debt_count_open)):"
  debt_summary
  local next
  next="$(determine_phase)"
  log "decision: a real run would execute phase '$next'"
  case "$next" in
    PLANNING) log "next agent: reka-planner${REKA_MODEL_PLANNER:+ ($REKA_MODEL_PLANNER)}" ;;
    EXECUTING) log "next agent: reka-executor${REKA_MODEL_EXECUTOR:+ ($REKA_MODEL_EXECUTOR)}" ;;
    REVIEWING) log "next agent: reka-reviewer${REKA_MODEL_REVIEWER:+ ($REKA_MODEL_REVIEWER)}" ;;
    FIXING) log "next agent: reka-fixer${REKA_MODEL_FIXER:+ ($REKA_MODEL_FIXER)}" ;;
    BLOCKED) log "a real run would stop and wait for a human" ;;
  esac
  log "dry run complete; no agent was invoked, no commit and no push"
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --status) MODE="status" ;;
      --pause) MODE="pause" ;;
      --unpause) MODE="unpause" ;;
      --resume) RESUME=1 ;;
      -h | --help) MODE="help" ;;
      *) die "unknown argument: $1 (use --help)" ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"
  cd "$REPO_ROOT" || die "cannot change directory to $REPO_ROOT"
  ensure_layout
  load_config

  case "$MODE" in
    help)
      usage
      exit 0
      ;;
    status)
      check_prerequisites
      cmd_status
      exit 0
      ;;
    pause)
      cmd_pause
      exit 0
      ;;
    unpause)
      cmd_unpause
      exit 0
      ;;
  esac

  if [ "$DRY_RUN" -eq 1 ]; then
    cmd_dry_run
    exit 0
  fi

  main_run
}

main "$@"
