#!/usr/bin/env python3
"""Small JSON helper for the REKA autonomous engineering runner.

The runner deliberately avoids adding a jq dependency. Python 3 is present on
Raspberry Pi OS and on the REKA development machines, so this helper provides
the few JSON operations the runner needs.

This is not a general purpose tool. Keep it small and boring.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from typing import Any


def load(path: str) -> Any:
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return {}
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save(path: str, data: Any) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
    os.replace(tmp, path)


def plan_validate(
    path: str, expected_id: str = "", expected_dir: str = "", quiet: bool = False
) -> int:
    """Validate a plan artifact against the REKA plan schema.

    Planner success is determined by the existence and validity of this
    artifact, not by the planner process exit code. Returns 0 when the plan is
    a complete, bounded, active plan for the expected plan directory.
    """
    try:
        data = load(path)
    except (json.JSONDecodeError, OSError) as exc:
        if not quiet:
            sys.stderr.write(f"plan invalid: cannot read {path}: {exc}\n")
        return 1
    if not isinstance(data, dict):
        if not quiet:
            sys.stderr.write("plan invalid: not a JSON object\n")
        return 1

    problems: list[str] = []
    if not data.get("id"):
        problems.append("missing id")
    if expected_id and data.get("id") != expected_id:
        problems.append(f"id mismatch: expected {expected_id!r}, got {data.get('id')!r}")
    if data.get("status") != "ACTIVE":
        problems.append("status is not ACTIVE")
    if not isinstance(data.get("goal"), str) or not data["goal"].strip():
        problems.append("goal missing or empty")
    if not isinstance(data.get("scope"), list) or not data["scope"]:
        problems.append("scope missing or not a non-empty bounded list")
    if not isinstance(data.get("implementationSteps"), list) or not data["implementationSteps"]:
        problems.append("implementationSteps missing or empty")
    if not isinstance(data.get("testingStrategy"), str) or not data["testingStrategy"].strip():
        problems.append("testingStrategy missing or empty")
    if not isinstance(data.get("definitionOfDone"), list) or not data["definitionOfDone"]:
        problems.append("definitionOfDone missing or empty")
    if not isinstance(data.get("nonGoals"), list):
        problems.append("nonGoals missing or not a list")
    if not isinstance(data.get("requiresHumanDecision"), bool):
        problems.append("requiresHumanDecision missing or not a boolean")
    if expected_dir:
        actual_dir = os.path.dirname(os.path.abspath(path))
        if actual_dir != os.path.abspath(expected_dir):
            problems.append(
                f"plan is not inside the expected plan directory {expected_dir}"
            )
    if problems:
        if not quiet:
            sys.stderr.write("plan invalid: " + "; ".join(problems) + "\n")
        return 1
    return 0


def plan_scan(plans_dir: str) -> str | None:
    """Return the directory of the most recent valid ACTIVE plan, if any.

    The runner uses this to discover and resume a plan a previous (possibly
    timed-out or crashed) planner left behind, instead of creating a duplicate.
    """
    if not os.path.isdir(plans_dir):
        return None
    for name in sorted(os.listdir(plans_dir), reverse=True):
        plan_dir = os.path.join(plans_dir, name)
        if not os.path.isdir(plan_dir):
            continue
        plan_path = os.path.join(plan_dir, "plan.json")
        if not os.path.isfile(plan_path):
            continue
        if plan_validate(plan_path, name, plan_dir, quiet=True) == 0:
            return plan_dir
    return None


def get_path(data: Any, path: str) -> Any:
    current = data
    if not path:
        return current
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def set_path(data: Any, path: str, value: Any) -> None:
    parts = path.split(".")
    current = data
    for part in parts[:-1]:
        if not isinstance(current.get(part), dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def render_lines(items: Any, prefix: str = "- ") -> str:
    if not isinstance(items, list) or not items:
        return f"{prefix}(none)\n"
    out = ""
    for item in items:
        if isinstance(item, dict):
            title = item.get("title") or item.get("name") or json.dumps(item)
            out += f"{prefix}{title}\n"
        else:
            out += f"{prefix}{item}\n"
    return out


def plan_markdown(plan: dict) -> str:
    body = plan.get("body")
    if isinstance(body, str) and body.strip():
        header = f"# Plan {plan.get('id', '')}\n\n"
        if plan.get("goal"):
            header += f"**Goal:** {plan['goal']}\n\n"
        return header + body.rstrip() + "\n"
    lines = [f"# Plan {plan.get('id', '')}", ""]
    lines.append(f"**Goal:** {plan.get('goal', '(unspecified)')}")
    lines.append(f"**Complexity:** {plan.get('complexity', '?')}")
    lines.append("")
    lines.append("## Why now")
    lines.append(plan.get("whyNow", "(unspecified)"))
    lines.append("")
    lines.append("## Scope")
    lines.append(render_lines(plan.get("scope")).rstrip())
    lines.append("")
    lines.append("## Non-goals")
    lines.append(render_lines(plan.get("nonGoals")).rstrip())
    lines.append("")
    lines.append("## Affected modules")
    lines.append(render_lines(plan.get("affectedModules")).rstrip())
    lines.append("")
    lines.append("## Dependencies")
    lines.append(render_lines(plan.get("dependencies")).rstrip())
    lines.append("")
    lines.append("## Implementation steps")
    lines.append(render_lines(plan.get("implementationSteps")).rstrip())
    lines.append("")
    lines.append("## Testing strategy")
    lines.append(plan.get("testingStrategy", "(unspecified)"))
    lines.append("")
    lines.append("## Definition of Done")
    lines.append(render_lines(plan.get("definitionOfDone")).rstrip())
    lines.append("")
    lines.append("## Risks")
    lines.append(render_lines(plan.get("risks")).rstrip())
    lines.append("")
    return "\n".join(lines)


def debt_markdown(debt: dict) -> str:
    lines = [f"# Debt {debt.get('id', '')}", ""]
    lines.append(f"**Title:** {debt.get('title', '(untitled)')}")
    lines.append(f"**Severity:** {debt.get('severity', 'normal')}")
    lines.append(f"**Type:** {debt.get('type', 'work')}")
    lines.append(f"**Status:** {debt.get('status', 'OPEN')}")
    lines.append(f"**Source plan:** {debt.get('sourcePlan') or '(none)'}")
    lines.append(f"**Created:** {debt.get('createdAt', '')}")
    lines.append("")
    lines.append("## Reason")
    lines.append(debt.get("reason", "(unspecified)"))
    lines.append("")
    if debt.get("description"):
        lines.append("## Details")
        lines.append(debt["description"])
        lines.append("")
    lines.append("## Completed")
    lines.append(render_lines(debt.get("completed")).rstrip())
    lines.append("")
    lines.append("## Remaining")
    lines.append(render_lines(debt.get("remaining")).rstrip())
    lines.append("")
    if debt.get("requiresHuman"):
        lines.append(
            "> This record requires a human decision. The runner will not "
            "proceed until it is resolved or explicitly accepted."
        )
        lines.append("")
    return "\n".join(lines)


def materialize_debt(
    result_path: str,
    debt_dir: str,
    source_plan: str,
    default_title: str,
    default_reason: str,
    default_requires_human: bool = False,
) -> list[str]:
    """Create debt records from a phase result JSON. Returns created ids."""
    result = load(result_path)
    entries = result.get("debt")
    if not isinstance(entries, list) or not entries:
        entries = [
            {
                "title": default_title,
                "reason": default_reason,
                "severity": "critical" if default_requires_human else "normal",
                "type": "decision" if default_requires_human else "work",
                "requiresHuman": default_requires_human,
                "completed": result.get("completed", []),
                "remaining": result.get("remaining", []),
            }
        ]

    created: list[str] = []
    import datetime

    stamp = datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            entry = {"title": str(entry)}
        existing = entry.get("id")
        if not existing:
            existing = f"DEBT-{stamp}-{index + 1:02d}"
        debt = dict(entry)
        debt["id"] = existing
        debt["status"] = debt.get("status") or "OPEN"
        debt["severity"] = debt.get("severity") or "normal"
        debt["type"] = debt.get("type") or "work"
        debt["requiresHuman"] = bool(debt.get("requiresHuman", False))
        debt["sourcePlan"] = debt.get("sourcePlan") or source_plan
        debt["createdAt"] = debt.get("createdAt") or datetime.datetime.utcnow().isoformat() + "Z"
        debt.setdefault("completed", [])
        debt.setdefault("remaining", [])
        target_dir = os.path.join(debt_dir, existing)
        os.makedirs(target_dir, exist_ok=True)
        meta_path = os.path.join(target_dir, "meta.json")
        save(meta_path, debt)
        with open(os.path.join(target_dir, "debt.md"), "w", encoding="utf-8") as handle:
            handle.write(debt_markdown(debt))
        created.append(existing)
    return created


def debt_scan(debt_dir: str) -> str:
    """Print tab-separated rows for every OPEN debt record."""
    if not os.path.isdir(debt_dir):
        return ""
    rows = []
    for name in sorted(os.listdir(debt_dir)):
        meta_path = os.path.join(debt_dir, name, "meta.json")
        if not os.path.exists(meta_path):
            continue
        try:
            debt = load(meta_path)
        except (json.JSONDecodeError, OSError):
            continue
        if debt.get("status") != "OPEN":
            continue
        rows.append(
            "\t".join(
                [
                    str(debt.get("id", name)),
                    str(debt.get("severity", "normal")),
                    "true" if debt.get("requiresHuman") else "false",
                    str(debt.get("type", "work")),
                    str(debt.get("title", "")),
                ]
            )
        )
    return "\n".join(rows)


# ---------------------------------------------------------------------------
# Plan-scoped execution metadata (recovery ownership)
# ---------------------------------------------------------------------------
#
# An interrupted executor session may leave a dirty working tree. The runner
# records, per plan, the base revision it started from and the ever-growing
# manifest of file paths the autonomous system has changed as part of that
# plan (plan.json: execution.json). Every changed path must be attributable to
# the plan -- either it is already in the manifest, or it matches one of the
# plan's affectedModules, or (when the plan can touch workspace packages) it is
# a shared dependency artifact such as pnpm-lock.yaml. Anything else is treated
# as human work and stops the next run.


def _git(repo: str, *args: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _module_prefixes(plan: dict) -> list[str]:
    """Normalize affectedModules entries into unambiguous path prefixes.

    An entry such as 'docs (ROADMAP.md, DEVELOPMENT.md, ...)' normalizes to the
    'docs' prefix plus each parenthesized file as an exact-path prefix; a bare
    directory entry such as 'apps/api/test' stays as-is.
    """
    prefixes = []
    for entry in plan.get("affectedModules") or []:
        if not isinstance(entry, str):
            continue
        head, _, explicit = entry.partition(" (")
        head = head.strip()
        if head:
            prefixes.append(head)
        for item in explicit.rstrip(")").split(","):
            item = item.strip()
            if item:
                prefixes.append(item)
    return prefixes


def _touches_deps(prefixes: list[str]) -> bool:
    return any(p.startswith("packages/") or p.startswith("apps/") for p in prefixes)


def _changed_paths(repo: str, base: str) -> list[str]:
    """All working-tree changes (tracked and untracked) relative to base."""
    paths = _git(repo, "diff", "--name-only", base) if base else []
    paths += _git(repo, "ls-files", "--others", "--exclude-standard")
    return sorted(set(paths))


def _plausible(path: str, prefixes: list[str], manifest: set, touches_deps: bool) -> bool:
    if path in manifest:
        return True
    for prefix in prefixes:
        if path == prefix or path.startswith(prefix + "/"):
            return True
    if touches_deps and path in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"):
        return True
    return False


def capture_execution(
    exec_path: str, plan_path: str, repo: str
) -> list[str]:
    """Persist the plan execution snapshot from the live working tree.

    Updates the manifest (files the plan now owns) and the unattributed list
    (files that cannot be attributed to the plan). Returns the unattributed
    paths; the caller treats a non-empty result as a recovery stop signal for
    the next run.
    """
    import datetime

    exec_data = load(exec_path)
    if not isinstance(exec_data, dict):
        exec_data = {}
    plan = load(plan_path)

    base = exec_data.get("baseSha") or ""
    if not base:
        heads = _git(repo, "rev-parse", "HEAD")
        base = heads[0] if heads else ""

    prefixes = _module_prefixes(plan)
    touches = _touches_deps(prefixes)
    manifest = set(exec_data.get("manifest", []) or [])
    handled = set(manifest)

    changed = _changed_paths(repo, base)
    unattributed: list[str] = []
    for path in changed:
        if _plausible(path, prefixes, handled, touches):
            manifest.add(path)
        else:
            unattributed.append(path)

    exec_data["planId"] = plan.get("id") or exec_data.get("planId") or ""
    exec_data["baseSha"] = base
    exec_data["manifest"] = sorted(manifest)
    exec_data["unattributed"] = sorted(unattributed)
    exec_data["updatedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
    save(exec_path, exec_data)
    return sorted(unattributed)


def verify_attribution(exec_path: str, plan_path: str, repo: str) -> list[str]:
    """Non-mutating check that every working-tree change is plan-attributable.

    Used by the runner's git-safety gate before starting a run and before
    committing. Returns the non-attributable paths (empty when safe).
    """
    exec_data = load(exec_path) if os.path.isfile(exec_path) else {}
    if not isinstance(exec_data, dict):
        exec_data = {}
    plan = load(plan_path)

    base = exec_data.get("baseSha") or ""
    if not base:
        heads = _git(repo, "rev-parse", "HEAD")
        base = heads[0] if heads else ""
    if not base:
        return ["(no base revision and no reachable HEAD)"]

    manifest = set(exec_data.get("manifest", []) or [])
    prefixes = _module_prefixes(plan)
    touches = _touches_deps(prefixes)

    unattributed = [
        path
        for path in _changed_paths(repo, base)
        if not _plausible(path, prefixes, manifest, touches)
    ]
    return sorted(unattributed)


def debt_resolve_by_plan(debt_dir: str, plan_id: str) -> list[str]:
    """Close every OPEN debt record owned by the given source plan."""
    import datetime

    if not os.path.isdir(debt_dir):
        return []
    stamp = datetime.datetime.utcnow().isoformat() + "Z"
    closed: list[str] = []
    for name in sorted(os.listdir(debt_dir)):
        meta_path = os.path.join(debt_dir, name, "meta.json")
        if not os.path.exists(meta_path):
            continue
        debt = load(meta_path)
        if not isinstance(debt, dict) or debt.get("status") != "OPEN":
            continue
        if debt.get("sourcePlan") != plan_id:
            continue
        debt["status"] = "CLOSED"
        debt["resolvedAt"] = stamp
        save(meta_path, debt)
        with open(os.path.join(debt_dir, name, "debt.md"), "w", encoding="utf-8") as handle:
            handle.write(debt_markdown(debt))
        closed.append(str(debt.get("id", name)))
    return closed


def run_markdown(run: dict) -> str:
    lines = [f"# Run {run.get('runId', '')}", ""]
    lines.append(f"- **Started:** {run.get('startedAt', '')}")
    lines.append(f"- **Ended:** {run.get('endedAt', '')}")
    lines.append(f"- **Status:** {run.get('status', '')}")
    lines.append(f"- **Final phase:** {run.get('phase', '')}")
    lines.append(f"- **Plan:** {run.get('planId') or '(none)'}")
    lines.append(f"- **Commit:** {run.get('commit') or '(none)'}")
    lines.append(f"- **Pushed:** {run.get('pushed', False)}")
    if run.get("failureReason"):
        lines.append(f"- **Failure:** {run['failureReason']}")
    lines.append("")
    lines.append("## Sessions")
    lines.append("")
    lines.append("| phase | agent | model | exit | timeout | tokens | cost |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for phase in run.get("phases") or []:
        lines.append(
            "| {phase} | {agent} | {model} | {exit} | {timeout} | {tokens} | {cost} |".format(
                phase=phase.get("phase", ""),
                agent=phase.get("agent", ""),
                model=phase.get("model") or "(default)",
                exit=phase.get("exitCode", ""),
                timeout=phase.get("timedOut", False),
                tokens=phase.get("tokens", 0),
                cost=phase.get("cost", 0),
            )
        )
    lines.append("")
    review = run.get("review") or {}
    if review:
        lines.append("## Review")
        lines.append("")
        lines.append(f"- Status: {review.get('status', '')}")
        lines.append(f"- File: {review.get('path', '')}")
        lines.append("")
    debt = run.get("debt") or []
    if debt:
        lines.append("## Debt created")
        lines.append("")
        for item in debt:
            lines.append(f"- {item}")
        lines.append("")
    notes = run.get("notes") or []
    if notes:
        lines.append("## Notes")
        lines.append("")
        for note in notes:
            lines.append(f"- {note}")
        lines.append("")
    return "\n".join(lines)


def _as_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def token_total(usage: dict) -> int:
    if not isinstance(usage, dict):
        return 0
    if usage.get("total") is not None:
        return _as_int(usage.get("total"))
    cache = usage.get("cache") or {}
    if not isinstance(cache, dict):
        cache = {}
    return (
        _as_int(usage.get("input"))
        + _as_int(usage.get("output"))
        + _as_int(usage.get("reasoning"))
        + _as_int(cache.get("read"))
        + _as_int(cache.get("write"))
    )


def events_stats(path: str) -> str:
    tokens = 0
    cost = 0.0
    session_id = ""
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not session_id and event.get("sessionID"):
                session_id = event["sessionID"]
            part = event.get("part") or {}
            if part.get("type") == "step-finish":
                usage = part.get("tokens") or {}
                tokens += token_total(usage)
                try:
                    cost += float(part.get("cost") or 0)
                except (TypeError, ValueError):
                    pass
    print(f"{tokens}\t{cost}\t{session_id}")


def main() -> int:
    if len(sys.argv) < 3:
        sys.stderr.write("usage: agent-json.py <op> <file> [args...]\n")
        return 2
    op = sys.argv[1]
    path = sys.argv[2]

    if op == "validate":
        try:
            load(path)
        except (json.JSONDecodeError, OSError):
            return 1
        return 0

    if op == "plan-validate":
        expected_id = sys.argv[3] if len(sys.argv) > 3 else ""
        expected_dir = sys.argv[4] if len(sys.argv) > 4 else ""
        return plan_validate(path, expected_id, expected_dir)

    if op == "plan-scan":
        found = plan_scan(path)
        if found:
            print(found)
        return 0

    if op == "events-stats":
        events_stats(path)
        return 0

    if op == "debt-scan":
        output = debt_scan(path)
        if output:
            print(output)
        return 0

    if op == "run-md":
        with open(sys.argv[3], "w", encoding="utf-8") as handle:
            handle.write(run_markdown(load(path)))
        return 0

    if op == "materialize-debt":
        created = materialize_debt(
            path,
            sys.argv[3],
            sys.argv[4],
            sys.argv[5] if len(sys.argv) > 5 else "Unfinished work",
            sys.argv[6] if len(sys.argv) > 6 else "execution budget exhausted",
            len(sys.argv) > 7 and sys.argv[7] == "true",
        )
        for debt_id in created:
            print(debt_id)
        return 0

    if op == "capture-execution":
        unattributed = capture_execution(path, sys.argv[3], sys.argv[4])
        for item in unattributed:
            print(item)
        return 0 if not unattributed else 1

    if op == "verify-attribution":
        unattributed = verify_attribution(path, sys.argv[3], sys.argv[4])
        for item in unattributed:
            print(item)
        return 0 if not unattributed else 1

    if op == "debt-resolve-by-plan":
        for debt_id in debt_resolve_by_plan(path, sys.argv[3]):
            print(debt_id)
        return 0

    data = load(path)

    if op == "get":
        value = get_path(data, sys.argv[3])
        if value is None:
            print("")
        elif isinstance(value, bool):
            print("true" if value else "false")
        elif isinstance(value, (dict, list)):
            print(json.dumps(value, separators=(",", ":")))
        else:
            print(value)
    elif op == "getjson":
        print(json.dumps(get_path(data, sys.argv[3]), separators=(",", ":")))
    elif op == "exists":
        print("true" if get_path(data, sys.argv[3]) is not None else "false")
    elif op == "length":
        value = get_path(data, sys.argv[3])
        print(len(value) if isinstance(value, (list, dict, str)) else 0)
    elif op == "set":
        set_path(data, sys.argv[3], json.loads(sys.argv[4]))
        save(path, data)
    elif op == "setstr":
        set_path(data, sys.argv[3], sys.argv[4])
        save(path, data)
    elif op == "setint":
        set_path(data, sys.argv[3], int(sys.argv[4]))
        save(path, data)
    elif op == "addnum":
        current = get_path(data, sys.argv[3])
        try:
            current = float(current or 0)
        except (TypeError, ValueError):
            current = 0.0
        result = current + float(sys.argv[4])
        if result.is_integer():
            result = int(result)
        set_path(data, sys.argv[3], result)
        save(path, data)
    elif op == "append":
        arr = get_path(data, sys.argv[3])
        if not isinstance(arr, list):
            arr = []
        arr.append(json.loads(sys.argv[4]))
        set_path(data, sys.argv[3], arr)
        save(path, data)
    elif op == "plan-md":
        with open(sys.argv[3], "w", encoding="utf-8") as handle:
            handle.write(plan_markdown(data))
    elif op == "debt-md":
        with open(sys.argv[3], "w", encoding="utf-8") as handle:
            handle.write(debt_markdown(data))
    else:
        sys.stderr.write(f"unknown op: {op}\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
