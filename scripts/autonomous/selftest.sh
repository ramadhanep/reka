#!/usr/bin/env bash
#
# selftest.sh — offline tests for the REKA autonomous engineering runner.
#
# Each test creates an isolated temporary git repository, copies the runner and
# the JSON helper into it, and drives the real orchestration logic with a stub
# OpenCode binary. It never touches the real repository, commits nothing, and
# pushes nothing.
#
# Usage: scripts/autonomous/selftest.sh
#
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$HERE/../../agent-reka-runner.sh"
HELPER="$HERE/agent-json.py"
STUB="$HERE/stub-opencode.sh"
AGENT_GITIGNORE="$HERE/../../.reka-agent/.gitignore"

PY="${PYTHON:-python3}"
PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  printf '  ok   %s\n' "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  printf '  FAIL %s\n' "$1"
}

assert_eq() {
  if [ "$1" = "$2" ]; then
    ok "$3"
  else
    bad "$3 (expected '$1', got '$2')"
  fi
}

assert_nonzero() {
  if [ "$1" -ne 0 ]; then
    ok "$2"
  else
    bad "$2 (expected nonzero exit)"
  fi
}

assert_contains() {
  case "$2" in
    *"$1"*) ok "$3" ;;
    *) bad "$3 (missing '$1')" ;;
  esac
}

jval() { "$PY" "$HELPER" get "$1" "$2" 2>/dev/null; }

count_open_debt() {
  local repo="$1" count=0 line
  while IFS= read -r line; do
    [ -n "$line" ] && count=$((count + 1))
  done < <("$PY" "$HELPER" debt-scan "$repo/.reka-agent/debt" 2>/dev/null)
  printf '%s' "$count"
}

count_runs() {
  find "$1/.reka-agent/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l
}

count_plans() {
  find "$1/.reka-agent/plans" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l
}

count_valid_reviews() {
  local file valid=0
  for file in "$1/.reka-agent/reviews"/*.json; do
    [ -e "$file" ] || continue
    "$PY" "$HELPER" validate "$file" >/dev/null 2>&1 && valid=$((valid + 1))
  done
  printf '%s' "$valid"
}

setup_repo() {
  local repo="$1"
  git init -q -b main "$repo"
  git -C "$repo" config user.email "agent@reka.test"
  git -C "$repo" config user.name "Reka Agent"
  mkdir -p "$repo/scripts/autonomous" "$repo/.reka-agent"
  cp "$RUNNER" "$repo/agent-reka-runner.sh"
  chmod +x "$repo/agent-reka-runner.sh"
  cp "$HELPER" "$repo/scripts/autonomous/agent-json.py"
  cp "$AGENT_GITIGNORE" "$repo/.reka-agent/.gitignore"
  printf '# REKA test repository\n' >"$repo/AGENTS.md"
  printf 'base\n' >"$repo/src.txt"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m "initial"
}

run_runner() {
  local repo="$1" scenario="$2" extra="${3:-}"
  mkdir -p "$repo/.reka-agent/stub-state"
  (
    cd "$repo" || exit 1
    env \
      REKA_OPENCODE_BIN="$STUB" \
      STUB_SCENARIO="$scenario" \
      STUB_REPO="$repo" \
      STUB_STATE="$repo/.reka-agent/stub-state" \
      REKA_PUSH=0 \
      REKA_BRANCH=main \
      REKA_DAILY_BUDGET_SESSIONS=10 \
      REKA_MAX_EXECUTION_SESSIONS=2 \
      REKA_MAX_REVIEW_LOOPS=2 \
      REKA_MAX_TASKS_PER_RUN=1 \
      REKA_MAX_RUN_TIME=300 \
      "$repo/agent-reka-runner.sh" $extra
  ) >"$repo/.reka-agent/runner.out" 2>&1
  return $?
}

make_repo() {
  local repo
  repo="$(mktemp -d "${TMPDIR:-/tmp}/reka-selftest.XXXXXX")"
  setup_repo "$repo"
  printf '%s' "$repo"
}

# ---------------------------------------------------------------------------

test_happy_path() {
  printf '\n[happy path]\n'
  local repo rc
  repo="$(make_repo)"
  run_runner "$repo" happy
  rc=$?
  assert_eq 0 "$rc" "runner exits 0"
  assert_eq COMPLETE "$(jval "$repo/.reka-agent/state.json" phase)" "phase is COMPLETE"
  assert_eq 0 "$(count_open_debt "$repo")" "no open debt"
  assert_eq 1 "$(count_plans "$repo")" "exactly one plan created"
  assert_contains "Reka-Agent-Run:" "$(git -C "$repo" log -1 --format=%B)" "commit carries run trailer"
  assert_contains "Reka-Agent-Plan:" "$(git -C "$repo" log -1 --format=%B)" "commit carries plan trailer"
  assert_eq COMPLETE "$(jval "$repo/.reka-agent/runs/$(jval "$repo/.reka-agent/state.json" lastRunId)/run.json" status)" "run recorded as COMPLETE"
  assert_eq 3 "$(jval "$repo/.reka-agent/state.json" budget.sessions)" "three agent sessions were counted"
  assert_eq 3702 "$(jval "$repo/.reka-agent/state.json" budget.tokens)" "token usage was accumulated"
  [ "$("$PY" -c 'import json,sys;print(1 if json.load(open(sys.argv[1]))["budget"]["cost"] > 0 else 0)' "$repo/.reka-agent/state.json")" = 1 ] \
    && ok "cost usage was accumulated" || bad "cost was not accumulated"
  rm -rf "$repo"
}

test_partial_becomes_debt_and_no_replan() {
  printf '\n[partial work becomes debt, no replanning]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" partial
  run_runner "$repo" partial
  assert_eq EXECUTING "$(jval "$repo/.reka-agent/state.json" phase)" "phase remains EXECUTING"
  assert_eq 1 "$(count_plans "$repo")" "no new plan was created on resume"
  [ "$(count_open_debt "$repo")" -ge 1 ] && ok "open debt exists" || bad "expected open debt"
  assert_eq 1 "$(git -C "$repo" rev-list --count HEAD)" "nothing was committed"
  rm -rf "$repo"
}

test_fail_then_pass() {
  printf '\n[review FAIL then fixer then PASS]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" fail_then_pass
  assert_eq COMPLETE "$(jval "$repo/.reka-agent/state.json" phase)" "phase is COMPLETE"
  assert_contains "Reka-Agent-Run:" "$(git -C "$repo" log -1 --format=%B)" "commit created after fix"
  assert_eq 0 "$(count_open_debt "$repo")" "no leftover blocking debt"
  rm -rf "$repo"
}

test_review_loop_limit_blocks() {
  printf '\n[review loop limit becomes BLOCKED]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" always_fail
  assert_eq BLOCKED "$(jval "$repo/.reka-agent/state.json" phase)" "phase is BLOCKED"
  [ "$(count_open_debt "$repo")" -ge 1 ] && ok "remaining issues persisted as debt" || bad "expected debt"
  assert_eq 1 "$(git -C "$repo" rev-list --count HEAD)" "nothing was committed"
  rm -rf "$repo"
}

test_invalid_review_is_not_trusted() {
  printf '\n[invalid review output is not trusted]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" invalid_review
  assert_eq BLOCKED "$(jval "$repo/.reka-agent/state.json" phase)" "phase is BLOCKED"
  assert_eq 0 "$(count_valid_reviews "$repo")" "no valid review was accepted"
  assert_eq 1 "$(git -C "$repo" rev-list --count HEAD)" "nothing was committed"
  rm -rf "$repo"
}

test_blocked_executor() {
  printf '\n[executor reports BLOCKED]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" blocked
  assert_eq BLOCKED "$(jval "$repo/.reka-agent/state.json" phase)" "phase is BLOCKED"
  [ "$(count_open_debt "$repo")" -ge 1 ] && ok "blocking debt persisted" || bad "expected open debt"
  assert_eq 1 "$(git -C "$repo" rev-list --count HEAD)" "nothing was committed"
  rm -rf "$repo"
}

test_human_decision_blocks_planning() {
  printf '\n[planner requests a human decision]\n'
  local repo meta
  repo="$(make_repo)"
  run_runner "$repo" decision
  assert_eq BLOCKED "$(jval "$repo/.reka-agent/state.json" phase)" "phase is BLOCKED"
  meta="$(find "$repo/.reka-agent/debt" -name meta.json | head -1)"
  assert_eq true "$(jval "$meta" requiresHuman)" "debt requires a human"
  rm -rf "$repo"
}

test_dirty_tree_stops() {
  printf '\n[unexpected human changes stop the runner]\n'
  local repo rc
  repo="$(make_repo)"
  printf 'human work\n' >"$repo/human.txt"
  run_runner "$repo" happy
  rc=$?
  assert_nonzero "$rc" "runner refuses to run"
  assert_eq 0 "$(count_runs "$repo")" "no run was started"
  assert_contains "human work detected" "$(cat "$repo/.reka-agent/runner.out")" "clear stop message"
  rm -rf "$repo"
}

test_pause_kill_switch() {
  printf '\n[pause kill switch]\n'
  local repo rc
  repo="$(make_repo)"
  touch "$repo/.reka-agent/PAUSE"
  run_runner "$repo" happy
  rc=$?
  assert_eq 0 "$rc" "runner exits cleanly"
  assert_eq 0 "$(count_runs "$repo")" "no run was started while paused"
  rm -rf "$repo"
}

test_lock_prevents_overlap() {
  printf '\n[lock prevents overlapping runs]\n'
  local repo rc
  repo="$(make_repo)"
  sleep 30 &
  local sleeper=$!
  mkdir -p "$repo/.reka-agent/lock"
  printf '%s' "$sleeper" >"$repo/.reka-agent/lock/pid"
  date +%s >"$repo/.reka-agent/lock/created"
  run_runner "$repo" happy
  rc=$?
  assert_eq 0 "$rc" "second run exits safely"
  assert_eq 0 "$(count_runs "$repo")" "no run was started while locked"
  kill "$sleeper" 2>/dev/null || true
  rm -rf "$repo"
}

test_dry_run_changes_nothing() {
  printf '\n[dry run is read-only]\n'
  local repo rc
  repo="$(make_repo)"
  run_runner "$repo" happy "--dry-run"
  rc=$?
  assert_eq 0 "$rc" "dry run exits 0"
  assert_eq 0 "$(count_runs "$repo")" "no run directory created"
  assert_eq 0 "$(count_plans "$repo")" "no plan directory created"
  assert_eq IDLE "$(jval "$repo/.reka-agent/state.json" phase)" "phase unchanged"
  assert_contains "would execute phase 'PLANNING'" "$(cat "$repo/.reka-agent/runner.out")" "decision reported"
  rm -rf "$repo"
}

test_daily_budget_reset() {
  printf '\n[daily budget resets on a new day]\n'
  local repo today
  repo="$(make_repo)"
  run_runner "$repo" happy
  today="$(date +%F)"
  "$PY" "$HELPER" setstr "$repo/.reka-agent/state.json" budget.date "2000-01-01"
  "$PY" "$HELPER" setint "$repo/.reka-agent/state.json" budget.sessions 5
  "$PY" "$HELPER" setint "$repo/.reka-agent/state.json" budget.tokens 999999
  "$PY" "$HELPER" set "$repo/.reka-agent/state.json" budget.cost 42
  run_runner "$repo" happy
  assert_eq "$today" "$(jval "$repo/.reka-agent/state.json" budget.date)" "budget date advanced"
  assert_eq 3 "$(jval "$repo/.reka-agent/state.json" budget.sessions)" "sessions reset then recounted"
  assert_eq 3702 "$(jval "$repo/.reka-agent/state.json" budget.tokens)" "tokens reset then recounted"
  assert_eq 1 "$("$PY" -c 'import json,sys;print(1 if json.load(open(sys.argv[1]))["budget"]["cost"] < 1 else 0)' "$repo/.reka-agent/state.json")" "cost reset then recounted"
  rm -rf "$repo"
}

test_token_accounting_shapes() {
  printf '\n[token accounting accepts total and component shapes]\n'
  local tmp a b
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/reka-tokens.XXXXXX")"
  a="$tmp/total.jsonl"
  b="$tmp/components.jsonl"
  printf '{"type":"step_finish","sessionID":"ses_x","part":{"type":"step-finish","tokens":{"total":1234},"cost":0.02}}\n' >"$a"
  printf '{"type":"step_finish","sessionID":"ses_y","part":{"type":"step-finish","tokens":{"input":100,"output":20,"reasoning":4,"cache":{"read":6,"write":0}},"cost":0.01}}\n' >"$b"
  assert_eq "1234" "$("$PY" "$HELPER" events-stats "$a" | cut -f1)" "explicit total is used"
  assert_eq "130" "$("$PY" "$HELPER" events-stats "$b" | cut -f1)" "component tokens are summed"
  assert_eq "0.01" "$("$PY" "$HELPER" events-stats "$b" | cut -f2)" "cost is parsed"
  rm -rf "$tmp"
}

last_run_json() {
  printf '%s/.reka-agent/runs/%s/run.json' "$1" "$(jval "$1/.reka-agent/state.json" lastRunId)"
}

last_run_state() {
  printf '%s/.reka-agent/state.json' "$1"
}

test_planner_success_persists_plan() {
  printf '\n[planner success + valid plan -> EXECUTING]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_ok_crash
  assert_eq EXECUTING "$(jval "$(last_run_state "$repo")" phase)" "phase is EXECUTING"
  assert_eq 1 "$(count_plans "$repo")" "exactly one plan created"
  assert_eq 0 "$(jval "$(last_run_state "$repo")" consecutiveFailures)" "failures reset after success"
  [ -n "$(jval "$(last_run_state "$repo")" activePlanId)" ] && ok "active plan persisted" || bad "active plan not persisted"
  assert_eq ACTIVE "$(jval "$(last_run_state "$repo")" planStatus)" "plan status ACTIVE"
  assert_eq INCOMPLETE "$(jval "$(last_run_json "$repo")" status)" "run finished with plan still active (not DONE-as-success)"
  assert_contains '"phase": "PLANNING"' "$(cat "$(last_run_json "$repo")")" "planning session recorded"
  rm -rf "$repo"
}

test_planner_timeout_with_valid_plan_recovers() {
  printf '\n[planner timeout + valid plan -> EXECUTING]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_timeout_with_plan
  assert_eq EXECUTING "$(jval "$(last_run_state "$repo")" phase)" "phase is EXECUTING despite timeout"
  assert_eq 1 "$(count_plans "$repo")" "plan preserved, not regenerated"
  assert_eq ACTIVE "$(jval "$(last_run_state "$repo")" planStatus)" "plan status ACTIVE"
  assert_contains '"exitCode": 124' "$(cat "$(last_run_json "$repo")")" "timeout exit recorded"
  assert_contains '"timedOut": true' "$(cat "$(last_run_json "$repo")")" "timeout flag recorded"
  assert_contains "plan preserved" "$(cat "$(last_run_json "$repo")")" "note records plan preserved after timeout"
  rm -rf "$repo"
}

test_planner_timeout_no_plan_is_failure() {
  printf '\n[planner timeout + no plan -> failure]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_timeout_no_plan
  assert_eq IDLE "$(jval "$(last_run_state "$repo")" phase)" "phase returns IDLE on genuine planning failure"
  assert_eq 1 "$(jval "$(last_run_state "$repo")" consecutiveFailures)" "consecutiveFailures incremented"
  assert_eq 0 "$(count_plans "$repo")" "no plan persisted"
  [ -z "$(jval "$(last_run_state "$repo")" activePlanId)" ] && ok "no active plan claimed" || bad "phantom active plan"
  assert_contains '"exitCode": 124' "$(cat "$(last_run_json "$repo")")" "timeout recorded as a failed planning"
  rm -rf "$repo"
}

test_planner_nonzero_with_valid_plan_preserved() {
  printf '\n[planner non-zero + valid plan -> plan preserved]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_nonzero_with_plan
  assert_eq EXECUTING "$(jval "$(last_run_state "$repo")" phase)" "valid plan proceeds despite non-zero exit"
  assert_eq 1 "$(count_plans "$repo")" "plan preserved"
  assert_eq ACTIVE "$(jval "$(last_run_state "$repo")" planStatus)" "plan status ACTIVE"
  assert_contains '"exitCode": 3' "$(cat "$(last_run_json "$repo")")" "non-zero exit recorded"
  rm -rf "$repo"
}

test_planner_nonzero_invalid_plan_is_failure() {
  printf '\n[planner non-zero + invalid plan -> failure]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_nonzero_bad
  assert_eq IDLE "$(jval "$(last_run_state "$repo")" phase)" "phase returns IDLE"
  assert_eq 1 "$(jval "$(last_run_state "$repo")" consecutiveFailures)" "consecutiveFailures incremented"
  assert_eq 0 "$(count_plans "$repo")" "no plan persisted"
  assert_contains '"exitCode": 3' "$(cat "$(last_run_json "$repo")")" "non-zero exit recorded"
  rm -rf "$repo"
}

test_planner_zero_exit_invalid_plan_is_failure() {
  printf '\n[planner exit 0 + invalid plan -> failure (not trusted)]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_zero_bad
  assert_eq IDLE "$(jval "$(last_run_state "$repo")" phase)" "phase returns IDLE"
  assert_eq 1 "$(jval "$(last_run_state "$repo")" consecutiveFailures)" "consecutiveFailures incremented"
  assert_eq 0 "$(count_plans "$repo")" "no plan persisted"
  rm -rf "$repo"
}

test_restart_resumes_existing_plan() {
  printf '\n[runner restart with active plan resumes, no replan]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_ok_crash
  assert_eq EXECUTING "$(jval "$(last_run_state "$repo")" phase)" "interrupted run leaves EXECUTING"
  run_runner "$repo" happy
  assert_eq COMPLETE "$(jval "$(last_run_state "$repo")" phase)" "restart executes from the existing plan"
  assert_eq 1 "$(count_plans "$repo")" "no duplicate plan created on resume"
  rm -rf "$repo"
}

test_restart_after_planner_timeout_resumes() {
  printf '\n[restart after planner timeout with valid plan resumes]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_timeout_with_plan
  assert_eq EXECUTING "$(jval "$(last_run_state "$repo")" phase)" "timed-out planner still leaves a valid active plan"
  run_runner "$repo" happy
  assert_eq COMPLETE "$(jval "$(last_run_state "$repo")" phase)" "next run completes from the preserved plan"
  assert_eq 1 "$(count_plans "$repo")" "plan was never regenerated"
  rm -rf "$repo"
}

test_interrupted_planning_recovers_without_replan() {
  printf '\n[crash mid-PLANNING with valid plan recovers without replan]\n'
  local repo
  repo="$(make_repo)"
  run_runner "$repo" planner_ok_crash
  "$PY" "$HELPER" setstr "$repo/.reka-agent/state.json" phase PLANNING
  "$PY" "$HELPER" setstr "$repo/.reka-agent/state.json" planStatus PENDING
  run_runner "$repo" happy
  assert_eq COMPLETE "$(jval "$(last_run_state "$repo")" phase)" "recovered plan executed and completed"
  assert_eq 1 "$(count_plans "$repo")" "existing plan resumed, no duplicate created"
  rm -rf "$repo"
}

test_orphaned_active_plan_is_resumed() {
  printf '\n[orphaned valid plan is discovered and resumed, not duplicated]\n'
  local repo
  repo="$(make_repo)"
  mkdir -p "$repo/.reka-agent/plans/PLAN-ORPHAN-TEST0001"
  cat >"$repo/.reka-agent/plans/PLAN-ORPHAN-TEST0001/plan.json" <<'JSON'
{
  "id": "PLAN-ORPHAN-TEST0001",
  "status": "ACTIVE",
  "goal": "Resume the orphaned stub feature",
  "whyNow": "a previous planner was interrupted after writing this",
  "scope": ["one small change"],
  "nonGoals": ["everything else"],
  "affectedModules": ["src.txt"],
  "dependencies": [],
  "implementationSteps": ["modify a file", "test it"],
  "testingStrategy": "run the stub check",
  "definitionOfDone": ["file changed", "tests pass"],
  "risks": ["none"],
  "complexity": "S",
  "requiresHumanDecision": false,
  "humanDecision": ""
}
JSON
  run_runner "$repo" happy
  assert_eq COMPLETE "$(jval "$(last_run_state "$repo")" phase)" "orphaned plan executed and completed"
  assert_eq 1 "$(count_plans "$repo")" "no duplicate plan created"
  assert_contains "resumed existing plan" "$(cat "$(last_run_json "$repo")")" "runner recorded the resume"
  rm -rf "$repo"
}

current_plan_dir() {
  printf '%s/.reka-agent/plans/%s' "$1" "$(jval "$1/.reka-agent/state.json" activePlanId)"
}

test_executor_crash_preserves_work_and_resumes() {
  printf '\n[executor crash after plan-scoped changes: work preserved, plan resumes]\n'
  local repo plan_dir exec_file crash_run
  repo="$(make_repo)"
  run_runner "$repo" crash_after_change
  plan_dir="$(current_plan_dir "$repo")"
  crash_run="$repo/.reka-agent/runs/$(jval "$repo/.reka-agent/state.json" lastRunId)"

  assert_eq EXECUTING "$(jval "$repo/.reka-agent/state.json" phase)" "non-zero exit leaves phase EXECUTING"
  assert_eq 1 "$(git -C "$repo" rev-list --count HEAD)" "crash run committed nothing"
  assert_contains "Autonomous stub change" "$(cat "$repo/src.txt")" "partial implementation is preserved"
  assert_eq "{}" "$(cat "$crash_run/executor-result.json")" "executor result missing after failure"
  [ "$(count_open_debt "$repo")" -ge 1 ] && ok "generic debt recorded the interruption" || bad "expected generic debt"
  exec_file="$plan_dir/execution.json"
  [ -f "$exec_file" ] && ok "execution snapshot persisted" || bad "execution snapshot missing"
  assert_contains "src.txt" "$(jval "$exec_file" manifest)" "manifest lists the plan-owned path"
  assert_eq "$(git -C "$repo" rev-parse HEAD)" "$(jval "$exec_file" baseSha)" "base sha locked at adoption"

  run_runner "$repo" happy
  assert_eq COMPLETE "$(jval "$(last_run_state "$repo")" phase)" "next run resumes the active plan"
  assert_eq 2 "$(git -C "$repo" rev-list --count HEAD)" "successful recovery commits"
  assert_contains "Autonomous stub change" "$(git -C "$repo" show HEAD:src.txt)" "partial implementation survives the commit"
  assert_eq 0 "$(count_open_debt "$repo")" "plan debt resolved on completion"
  assert_contains '"phase": "REVIEWING"' "$(cat "$(last_run_json "$repo")")" "recovery proceeded to the reviewer"
  assert_eq 1 "$(count_plans "$repo")" "plan was resumed, never regenerated"
  rm -rf "$repo"
}

test_executor_crash_then_human_change_stops() {
  printf '\n[unrelated human change after an executor crash stops the next run]\n'
  local repo rc
  repo="$(make_repo)"
  run_runner "$repo" crash_after_change
  printf 'human work\n' >"$repo/human.txt"
  run_runner "$repo" happy
  rc=$?
  assert_nonzero "$rc" "runner stops when human changes are present"
  assert_eq 1 "$(count_runs "$repo")" "no fresh run was started"
  assert_contains "not attributable" "$(cat "$repo/.reka-agent/runner.out")" "stop message explains attribution"
  assert_eq EXECUTING "$(jval "$repo/.reka-agent/state.json" phase)" "the plan stays active for a later safe resume"
  assert_contains "Autonomous stub change" "$(cat "$repo/src.txt")" "plan-owned work is never discarded"
  rm -rf "$repo"
}

test_attribution_rules_deterministic() {
  printf '\n[deterministic plan attribution: module prefix, manifest, shared artifacts]\n'
  local tmp repo meta plan rc
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/reka-attribution.XXXXXX")"
  repo="$tmp/repo"
  meta="$tmp/meta"
  mkdir -p "$repo" "$meta"
  git init -q -b main "$repo"
  git -C "$repo" config user.email "agent@reka.test"
  git -C "$repo" config user.name "Reka Agent"
  mkdir -p "$repo/packages/jobs/src" "$repo/apps/worker" "$repo/other"
  printf 'a\n' >"$repo/packages/jobs/src/a.ts"
  printf 'b\n' >"$repo/apps/worker/b.ts"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m initial
  plan="$meta/plans.json"

  cat >"$plan" <<'JSON'
{
  "id": "P1",
  "status": "ACTIVE",
  "goal": "g",
  "whyNow": "w",
  "scope": ["s"],
  "nonGoals": [],
  "affectedModules": ["packages/jobs", "apps/worker"],
  "dependencies": [],
  "implementationSteps": ["i"],
  "testingStrategy": "t",
  "definitionOfDone": ["d"],
  "risks": ["r"],
  "complexity": "S",
  "requiresHumanDecision": false,
  "humanDecision": ""
}
JSON

  printf 'x\n' >>"$repo/packages/jobs/src/a.ts"                       # inside module -> attributed
  printf 'x\n' >>"$repo/apps/worker/b.ts"                             # inside module -> attributed
  printf 'x\n' >>"$repo/pnpm-lock.yaml"                               # shared artifact (plan touches apps) -> attributed
  printf 'x\n' >>"$repo/other/leak.txt"                               # outside -> unattributed

  # Module-prefix + shared artifacts cover everything except other/leak.txt.
  assert_contains "other/leak.txt" "$("$PY" "$HELPER" verify-attribution - "$plan" "$repo" 2>&1)" "only the out-of-module path is flagged"
  "$PY" "$HELPER" verify-attribution - "$plan" "$repo" >/dev/null 2>&1
  rc=$?
  assert_nonzero "$rc" "verify-attribution exits nonzero with unattributed paths"

  rm -f "$repo/other/leak.txt"
  "$PY" "$HELPER" verify-attribution - "$plan" "$repo" >"$meta/out.txt" 2>&1
  rc=$?
  assert_eq "0" "$rc" "clean tree passes attribution with exit 0"
  assert_eq "" "$(cat "$meta/out.txt")" "clean tree flags nothing"

  rm -rf "$tmp"
}

main() {
  printf 'REKA autonomous runner selftest\n'
  test_happy_path
  test_partial_becomes_debt_and_no_replan
  test_fail_then_pass
  test_review_loop_limit_blocks
  test_invalid_review_is_not_trusted
  test_blocked_executor
  test_human_decision_blocks_planning
  test_dirty_tree_stops
  test_pause_kill_switch
  test_lock_prevents_overlap
  test_dry_run_changes_nothing
  test_daily_budget_reset
  test_token_accounting_shapes
  test_planner_success_persists_plan
  test_planner_timeout_with_valid_plan_recovers
  test_planner_timeout_no_plan_is_failure
  test_planner_nonzero_with_valid_plan_preserved
  test_planner_nonzero_invalid_plan_is_failure
  test_planner_zero_exit_invalid_plan_is_failure
  test_restart_resumes_existing_plan
  test_restart_after_planner_timeout_resumes
  test_interrupted_planning_recovers_without_replan
  test_orphaned_active_plan_is_resumed
  test_executor_crash_preserves_work_and_resumes
  test_executor_crash_then_human_change_stops
  test_attribution_rules_deterministic
  printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

main "$@"
