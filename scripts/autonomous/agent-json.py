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
