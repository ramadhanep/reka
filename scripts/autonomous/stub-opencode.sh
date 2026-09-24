#!/usr/bin/env bash
#
# Test double for `opencode run`. Used only by selftest.sh. It emulates the
# `--format json` event stream and writes the phase output files that the real
# agents would write. It never touches the real repository.
#
# Scenario is selected with STUB_SCENARIO. Reviewer call counting uses
# STUB_STATE/review-count.
#
# Scenarios: happy, decision, partial, blocked, crash, fail_then_pass,
# always_fail, invalid_review, planner_ok_crash, planner_timeout_with_plan,
# planner_timeout_no_plan, planner_nonzero_with_plan, planner_nonzero_bad,
# planner_zero_bad, crash_after_change.
#
# The stub modifies ${STUB_REPO}/src.txt, so the stub plans declare that path
# as their only affected module.
#
set -u

AGENT=""
MODEL=""
PROMPT=""

while [ $# -gt 0 ]; do
  case "$1" in
    run) shift ;;
    --agent)
      AGENT="${2:-}"
      shift 2
      ;;
    -m | --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --format | --title)
      shift 2
      ;;
    --auto | --pure | --print-logs | --thinking)
      shift
      ;;
    -*) shift ;;
    *)
      PROMPT="$1"
      shift
      ;;
  esac
done

SCENARIO="${STUB_SCENARIO:-happy}"
STUB_REPO="${STUB_REPO:-$PWD}"
STUB_STATE="${STUB_STATE:-/tmp/reka-stub-state}"
mkdir -p "$STUB_STATE"

field() {
  printf '%s\n' "$PROMPT" | sed -n "s/^$1:[[:space:]]*//p" | head -1
}

RUN_ID="$(field 'Run ID')"
PLAN_ID="$(field 'Plan ID')"
OUT_FILE="$(field 'Output file (required)')"
RESULT_FILE="$(field 'Result file (required)')"
REVIEW_OUT="$(field 'Review output file (required)')"
REVIEW_FILE="$(field 'Review file')"

emit_events() {
  printf '{"type":"step_start","sessionID":"ses_stub_%s_%s"}\n' "$RUN_ID" "$AGENT"
  printf '{"type":"step_finish","sessionID":"ses_stub_%s_%s","part":{"type":"step-finish","reason":"stop","tokens":{"total":1234},"cost":0.02}}\n' "$RUN_ID" "$AGENT"
}

comment="Autonomous stub change for $PLAN_ID"

case "$AGENT" in
  reka-planner)
    mkdir -p "$(dirname "$OUT_FILE")"
    case "$SCENARIO" in
      planner_timeout_no_plan)
        emit_events
        exit 124
        ;;
      planner_nonzero_bad | planner_zero_bad)
        printf 'this is not a plan\n' >"$OUT_FILE"
        emit_events
        [ "$SCENARIO" = "planner_zero_bad" ] && exit 0
        exit 3
        ;;
    esac
    if [ "$SCENARIO" = "decision" ]; then
      cat >"$OUT_FILE" <<JSON
{
  "id": "$PLAN_ID",
  "status": "ACTIVE",
  "goal": "Adopt a new architectural boundary",
  "whyNow": "stub decision scenario",
  "scope": ["..."],
  "nonGoals": [],
  "affectedModules": ["core"],
  "dependencies": [],
  "implementationSteps": ["..."],
  "testingStrategy": "...",
  "definitionOfDone": ["..."],
  "risks": ["architecture change"],
  "complexity": "L",
  "requiresHumanDecision": true,
  "humanDecision": "This requires a human decision about a new architectural boundary.",
  "body": "## Goal\nRequest human approval."
}
JSON
    else
      cat >"$OUT_FILE" <<JSON
{
  "id": "$PLAN_ID",
  "status": "ACTIVE",
  "goal": "Add a verified stub feature",
  "whyNow": "the selftest needs a bounded plan",
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
  "humanDecision": "",
  "body": "## Goal\nAdd a verified stub feature."
}
JSON
    fi
    emit_events
    case "$SCENARIO" in
      planner_timeout_with_plan) exit 124 ;;
      planner_nonzero_with_plan) exit 3 ;;
      *) exit 0 ;;
    esac
    ;;

  reka-executor)
    case "$SCENARIO" in
      crash_after_change)
        # Emulates an executor that made valid partial changes and then the
        # model/tool runtime failed before writing the result file.
        printf '%s\n' "$comment" >>"$STUB_REPO/src.txt"
        emit_events
        exit 3
        ;;
      crash | planner_ok_crash | planner_timeout_with_plan | planner_nonzero_with_plan)
        emit_events
        exit 3
        ;;
      partial)
        printf '%s\n' "$comment" >>"$STUB_REPO/src.txt"
        cat >"$RESULT_FILE" <<JSON
{
  "status": "PARTIAL",
  "summary": "started but did not finish",
  "completed": ["part of the work"],
  "remaining": ["the rest of the work"],
  "testsRun": [],
  "testsPassed": false,
  "commitMessage": "feat(core): partial stub work",
  "debt": [],
  "escalation": null
}
JSON
        ;;
      blocked)
        cat >"$RESULT_FILE" <<JSON
{
  "status": "BLOCKED",
  "summary": "needs a human decision",
  "completed": [],
  "remaining": ["human decision"],
  "testsRun": [],
  "testsPassed": false,
  "commitMessage": "feat(core): blocked stub work",
  "debt": [
    {
      "title": "Human decision required",
      "reason": "the stub executor is blocked",
      "severity": "critical",
      "type": "decision",
      "requiresHuman": true,
      "remaining": ["human decision"]
    }
  ],
  "escalation": "human decision required"
}
JSON
        ;;
      *)
        printf '%s\n' "$comment" >>"$STUB_REPO/src.txt"
        cat >"$RESULT_FILE" <<JSON
{
  "status": "COMPLETE",
  "summary": "implemented the stub feature",
  "completed": ["modified a file", "added a check"],
  "remaining": [],
  "testsRun": ["stub check -> pass"],
  "testsPassed": true,
  "commitMessage": "feat(core): add verified stub feature",
  "debt": [],
  "escalation": null
}
JSON
        ;;
    esac
    emit_events
    exit 0
    ;;

  reka-reviewer)
    count_file="$STUB_STATE/review-count"
    count=0
    [ -f "$count_file" ] && count="$(cat "$count_file")"
    count=$((count + 1))
    printf '%s' "$count" >"$count_file"
    mkdir -p "$(dirname "$REVIEW_OUT")"

    if [ "$SCENARIO" = "invalid_review" ]; then
      printf 'this is not json\n' >"$REVIEW_OUT"
      emit_events
      exit 0
    fi

    if [ "$SCENARIO" = "always_fail" ] || { [ "$SCENARIO" = "fail_then_pass" ] && [ "$count" -eq 1 ]; }; then
      cat >"$REVIEW_OUT" <<JSON
{
  "status": "FAIL",
  "summary": "one blocking issue found",
  "planId": "$PLAN_ID",
  "blockingIssues": [
    {
      "title": "Missing test",
      "file": "src.txt",
      "why": "behavior is not verified",
      "fix": "add a test"
    }
  ],
  "nonBlockingIssues": [],
  "testEvidence": ["stub -> not run"]
}
JSON
    else
      cat >"$REVIEW_OUT" <<JSON
{
  "status": "PASS",
  "summary": "looks correct",
  "planId": "$PLAN_ID",
  "blockingIssues": [],
  "nonBlockingIssues": [],
  "testEvidence": ["stub check -> pass"]
}
JSON
    fi
    emit_events
    exit 0
    ;;

  reka-fixer)
    printf '%s\n' "$comment (fixed)" >>"$STUB_REPO/src.txt"
    cat >"$RESULT_FILE" <<JSON
{
  "status": "FIXED",
  "summary": "fixed the blocking issue",
  "addressed": ["Missing test -> added"],
  "remaining": [],
  "testsRun": ["stub check -> pass"],
  "testsPassed": true,
  "commitMessage": "fix(core): address review feedback"
}
JSON
    emit_events
    exit 0
    ;;

  *)
    printf 'stub-opencode: unknown agent %s\n' "${AGENT:-<none>}" >&2
    emit_events
    exit 0
    ;;
esac
