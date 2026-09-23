# Autonomous Engineering System

REKA can be advanced by a self-hosted autonomous loop that runs on a schedule
(cron), plans its own next step, implements it, reviews it independently, and
commits only when the review passes.

The system is deliberately small, auditable and boring:

```text
cron
  ↓
agent-reka-runner.sh          one bounded session per invocation
  ↓
OpenCode (primary agents)     planner → executor → reviewer → fixer
  ↓
.reka-agent/ state            filesystem is the source of truth
  ↓
git commit + push             only after an independent review PASS
```

The goal is not a fully autonomous company. The goal is a trustworthy engineer
that makes one verified improvement at a time, records what it could not
finish, and stops cleanly.

## 1. Design principles

1. **Filesystem state is the source of truth.** Not OpenCode session history,
   not model memory. A Raspberry Pi reboot or a crashed session must not lose
   the engineering position.
2. **One bounded step per run.** The runner completes at most
   `REKA_MAX_TASKS_PER_RUN` plan (default `1`) before exiting. Cron provides the
   cadence.
3. **Independent verification before commit.** The executor never commits. A
   fresh reviewer session must return `PASS` first. The runner performs the
   commit.
4. **Honest partial work becomes debt.** If a run ends mid-plan, the work and
   the reason are persisted so the next session resumes instead of replanning.
5. **Model usage is a finite budget.** Sessions, tokens and wall-clock time are
   capped. When the budget is spent the runner stops and keeps state.
6. **Small dependency surface.** The harness uses bash, `git`, `python3` and
   OpenCode. It does not require `jq`, a database, a queue or a daemon.
7. **No surprise architecture changes.** The agents inherit the constraints in
   `AGENTS.md`, `ARCHITECTURE.md` and `ROADMAP.md`. Business work is only taken
   when the roadmap says it is available.

## 2. Components

| Component                             | Purpose                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `agent-reka-runner.sh`                | The single cron entrypoint. Owns state, budget, git safety, phases, commit and push.                        |
| `.opencode/agents/reka-planner.md`    | Primary agent that produces exactly one bounded plan.                                                       |
| `.opencode/agents/reka-executor.md`   | Primary agent that implements the active plan. Never commits.                                               |
| `.opencode/agents/reka-reviewer.md`   | Primary agent that independently verifies work. Never edits code.                                           |
| `.opencode/agents/reka-fixer.md`      | Primary agent that fixes only the reviewer's blocking issues.                                               |
| `scripts/autonomous/agent-json.py`    | JSON/state helper (no `jq` dependency): read/write state, render markdown, scan debt, parse OpenCode usage. |
| `scripts/autonomous/stub-opencode.sh` | Deterministic test double for `opencode run`.                                                               |
| `scripts/autonomous/selftest.sh`      | Offline test suite for the orchestration logic.                                                             |
| `.reka-agent/`                        | Persistent, mostly gitignored state directory.                                                              |

The four agents are **primary** agents on purpose. OpenCode cannot select a
subagent with `--agent`; autonomous phases must be primary agents.

## 3. State machine

```text
IDLE
  └─▶ PLANNING ─▶ EXECUTING ─▶ REVIEWING ─┬─ PASS ─▶ COMPLETE ─▶ (IDLE next run)
                        ▲                 │
                        │                 └─ FAIL ─▶ FIXING ─▶ REVIEWING
                        │
                        └─ resume with existing active plan

any phase ─▶ BLOCKED   (budget, repeated failure, human decision, protected change)
```

Phases are stored in `.reka-agent/state.json` as `phase`:

| Phase       | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `IDLE`      | No active plan. The runner may plan.                                 |
| `PLANNING`  | A planner session is expected/underway.                              |
| `EXECUTING` | A plan is active and not yet review-ready.                           |
| `REVIEWING` | Work is ready for independent review.                                |
| `FIXING`    | Reviewer returned `FAIL`; a fixer session addresses blocking issues. |
| `BLOCKED`   | The run stopped and requires attention (`--resume` or a human).      |
| `COMPLETE`  | The plan was reviewed, committed and closed.                         |

Key behaviours:

- On start, the runner reads `state.json`. If a plan is active it resumes it;
  it does not create a new plan.
- **Planner completion is artifact-based.** Planning succeeds when a valid
  `plan.json` exists for the run, regardless of the planner process exit code.
  A planner that writes a valid plan and then keeps exploring until the
  per-phase timeout is killed (`exit 124`) is treated as success: the plan is
  preserved and the run moves to `EXECUTING`. A timeout or crash with **no**
  valid plan is a genuine planning failure and is retried with
  `consecutiveFailures`.
- The runner persists the in-flight plan position (`phase: PLANNING`,
  `activePlanId`) *before* invoking the planner, so a crash mid-planning
  resumes the same plan directory on the next run instead of replanning. If a
  validated active plan exists on disk but state lost the reference (for
  example a previous planner timed out after writing it), the runner
  discovers it via `plan-scan` and resumes it rather than creating a duplicate.
- `BLOCKED` is terminal until `--resume` clears it. Debt marked
  `requiresHuman: true` is never auto-cleared.
- `REKA_MAX_EXECUTION_SESSIONS` bounds executor/fixer sessions per run.
- `REKA_MAX_REVIEW_LOOPS` bounds `REVIEWING → FIXING` cycles. Exceeding it
  records debt and moves to `BLOCKED`.

Run status (`run.json.status`) describes how the process ended, not the
engineering result: `COMPLETE` (plan closed), `INCOMPLETE` (process ended while
a plan was still active in `EXECUTING`/`REVIEWING`/`FIXING`), `BLOCKED`, or
`DONE` (process finished with no active plan, including genuine planning
failures). The detailed outcome of each session is in `phases[]`,
`failureReason` and the current `phase` in `state.json`.

## 4. Filesystem state

```text
.reka-agent/
├── config.env                 committed; budget/model/safety config
├── README.md                  committed
├── .gitignore                 committed; ignores runtime state
├── state.json                 current phase, active plan, budget counters
├── PAUSE                      kill switch; presence stops the runner
├── lock/                      run lock (mkdir + pid + staleness)
├── plans/<PLAN-ID>/
│   ├── plan.json              machine-readable plan
│   └── plan.md                rendered plan
├── debt/<DEBT-ID>/
│   ├── meta.json              machine-readable debt item
│   └── debt.md                rendered debt item
├── reviews/REV-<RUN>-<n>.json machine-readable review result
├── runs/<RUN-ID>/
│   ├── run.json               run record (status, phases, usage)
│   ├── summary.md             rendered run summary
│   ├── executor-result.json   executor output
│   └── fixer-result.json      fixer output (when applicable)
└── logs/                      runner log + per-session JSONL transcripts
```

Runtime state is ignored by Git; only `config.env`, `README.md` and
`.gitignore` are committed. The runner verifies `.reka-agent/state.json` is
ignored before it commits, so state can never leak into history.

## 5. Agent output contracts

Every phase writes one JSON file to a path printed by the runner. The runner
validates the JSON before trusting it; invalid output is treated as a failure,
never as success.

- **Planner** → `.reka-agent/plans/<PLAN-ID>/plan.json`
  (`status` = `ACTIVE`, `goal`, `scope`, `nonGoals`, `affectedModules`,
  `dependencies`, `implementationSteps`, `testingStrategy`,
  `definitionOfDone`, `risks`, `complexity`, `requiresHumanDecision`). The
  artifact must be valid JSON, carry the run's plan id and `status: ACTIVE`,
  and be bounded (`scope`/`implementationSteps`/`definitionOfDone` non-empty).
  The planner's session exit code does not determine success; the artifact
  does.
- **Executor** → `.reka-agent/runs/<RUN-ID>/executor-result.json`
  (`status` ∈ `COMPLETE|PARTIAL|BLOCKED`, `completed`, `remaining`, `testsRun`,
  `testsPassed`, `commitMessage`, `debt[]`, `escalation`).
- **Reviewer** → `.reka-agent/reviews/REV-<RUN>-<n>.json`
  (`status` ∈ `PASS|FAIL`, `summary`, `blockingIssues[]`, `nonBlockingIssues[]`,
  `testEvidence[]`).
- **Fixer** → `.reka-agent/runs/<RUN-ID>/fixer-result.json`
  (`status` ∈ `FIXED|PARTIAL|BLOCKED`, `addressed`, `remaining`, `testsRun`,
  `testsPassed`, `commitMessage`).

`PASS` requires `blockingIssues` to be empty. A reviewer that cannot run a
needed check must say so in `testEvidence` and treat the uncertainty as
blocking.

## 6. Review and commit gate

The commit path is the most sensitive part of the system:

1. Executor/fixer sessions modify the working tree. They cannot commit or push.
2. A fresh reviewer session (different session, different agent) verifies the
   diff and the plan's definition of done.
3. Only on `PASS` does the runner run the optional
   `REKA_PRECOMMIT_VERIFY`, stage the plan's changes, and commit.
4. The commit message comes from the executor/fixer `commitMessage`, with
   trailers identifying the automation:

```text
Reka-Agent-Run: RUN-...
Reka-Agent-Plan: PLAN-...
```

5. Push happens only when `REKA_PUSH=1` and every commit since the run started
   is an autonomous commit (trailer present). If a human commit is mixed in,
   the runner refuses to push.
6. The plan is closed, debt from the review is recorded, and the run ends.

## 7. Debt

Debt is the memory of unfinished work. It is created from:

- executor/fixer `PARTIAL` or `BLOCKED` output,
- reviewer blocking issues that remain after the loop limit,
- planner requests for a human decision.

Each item records title, reason, severity, type, `requiresHuman`, and the
completed/remaining steps. On the next run the planner and executor read open
debt and continue the work instead of replanning. Items with
`requiresHuman: true` block autonomous progress until a human clears them.

## 8. Budget

`REKA_DAILY_BUDGET_SESSIONS` bounds sessions per calendar day across all phases.
`REKA_DAILY_BUDGET_TOKENS` (only enforced when greater than `0`) bounds daily
tokens. Token and cost usage is read from OpenCode's `--format json` stream:
the payload is in events whose `part.type` is `step-finish`. The runner stops
before starting a session it cannot afford and preserves state.

## 9. Git safety

Before doing any work the runner refuses to proceed when:

- the working tree has unexpected changes (human work in progress),
- the current branch is not `REKA_BRANCH`,
- the `PAUSE` file exists,
- another run holds the lock.

The only intentional exception is resuming a run whose recorded phase is
`EXECUTING` with matching debt: those changes are the automation's own partial
work and are adopted.

## 10. Operations

### Schedule

```cron
0 20 * * * /path/to/reka/agent-reka-runner.sh >> /path/to/reka/.reka-agent/cron.log 2>&1
```

### Commands

```bash
./agent-reka-runner.sh              # run one autonomous session
./agent-reka-runner.sh --dry-run    # show the decision; change nothing
./agent-reka-runner.sh --status     # print phase, budget, open debt
./agent-reka-runner.sh --pause      # engage the kill switch
./agent-reka-runner.sh --unpause    # release the kill switch
./agent-reka-runner.sh --resume     # clear BLOCKED, then run
./agent-reka-runner.sh --help
```

`--dry-run` is the safe way to inspect what a real run would do; it never
invokes OpenCode, commits or pushes. `--dry-run` and `--status` may initialize
the ignored `.reka-agent/` scaffolding if it does not exist yet.

### Recovery

| Situation                              | Action                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| Pi rebooted mid-run                    | Just run again. The lock is stale and the phase is resumed.   |
| Planner timed out *after* writing plan | Nothing to do: the runner validates and preserves the plan, then moves to `EXECUTING`. |
| Planner failed with no plan            | Retried automatically (`consecutiveFailures`); becomes `BLOCKED` after repeated failures. |
| Run stopped at `BLOCKED`               | Read `state.json`, open debt, and `logs/`. Fix or `--resume`. |
| Debt requires a human                  | Make the decision, clear the debt item, then run.             |
| Bad autonomous commit                  | Revert it as a human; the runner will not fight you.          |
| Emergency stop                         | `./agent-reka-runner.sh --pause`.                             |

## 11. Configuration

Configuration lives in `.reka-agent/config.env`. Environment variables present
when the runner starts take precedence over the file. The important knobs:

```text
REKA_MODEL_{PLANNER,EXECUTOR,REVIEWER,FIXER}   provider/model per phase
REKA_DAILY_BUDGET_SESSIONS                     sessions per day (default 6)
REKA_DAILY_BUDGET_TOKENS                       daily token ceiling (0 = off)
REKA_MAX_RUN_TIME                              wall-clock limit per run (s)
REKA_MAX_EXECUTION_SESSIONS                    executor/fixer sessions per run
REKA_MAX_REVIEW_LOOPS                          review→fix cycles before BLOCKED
REKA_MAX_TASKS_PER_RUN                         completed plans per run
REKA_BRANCH                                    expected git branch
REKA_PUSH                                      1 = push reviewed commits
REKA_PRECOMMIT_VERIFY                          command before commit (optional)
REKA_OPENCODE_BIN                              opencode executable
REKA_{PLAN,EXECUTE,REVIEW,FIX}_TIMEOUT         per-phase timeouts (s)
REKA_PRUNE_DAYS / REKA_KEEP_RUNS               run-record retention
```

## 12. Testing

The orchestration logic is tested offline, without calling a model:

```bash
scripts/autonomous/selftest.sh
```

`stub-opencode.sh` simulates scenarios (`happy`, `partial`, `blocked`, `crash`,
`fail_then_pass`, `always_fail`, `invalid_review`, `decision`,
`planner_ok_crash`, `planner_timeout_with_plan`, `planner_timeout_no_plan`,
`planner_nonzero_with_plan`, `planner_nonzero_bad`, `planner_zero_bad`) in
throwaway git repositories. The suite asserts phases, debt, commits, trailers,
budget accounting, the pause switch, the lock, git safety, and that `--dry-run`
is read-only. It verifies that a valid plan is treated as planning success even
when the planner exits `124` (timeout) or non-zero, that a timeout without a
plan is a failure, and that interrupted/orphaned plans are resumed without
being regenerated.

## 13. Guardrails and residual risks

Enforced:

- executor/fixer cannot `commit`, `push`, `reset`, `clean`, `rebase`, `stash`,
  use `git -C`, `sudo`, or destructive `rm`;
- executor/fixer cannot edit the harness (`agent-reka-runner.sh`,
  `scripts/autonomous/**`, `.opencode/**`) or `.reka-agent/` state;
- planner can only write under `.reka-agent/plans/`;
- reviewer can only write under `.reka-agent/reviews/`;
- the runner validates every JSON contract and refuses to push mixed history.

Residual risks (accepted for now, revisit if the system is given more
autonomy):

- Agent bash allowlists are guardrails, not a sandbox. A determined model could
  still write to state through a shell command. The runner re-validates state
  and the reviewer sees the diff, so the blast radius is bounded.
- Review quality depends on the reviewer model. A weak model can pass weak
  work; `REKA_PRECOMMIT_VERIFY` exists for deterministic checks.
- The system assumes a single writer. Concurrent human edits are detected and
  stop the run rather than merged.
