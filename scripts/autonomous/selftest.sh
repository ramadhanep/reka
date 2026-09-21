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
  assert_eq DONE "$(jval "$repo/.reka-agent/runs/$(jval "$repo/.reka-agent/state.json" lastRunId)/run.json" status)" "run recorded as DONE"
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
  printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

main "$@"
