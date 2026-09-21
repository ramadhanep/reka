# `.reka-agent/` — autonomous engineering state

This directory holds the persistent state of the REKA autonomous engineering
loop. **Filesystem state is the source of truth**, not OpenCode session history.

Committed here:

- `config.env` — budget, model and safety configuration
- `README.md` — this file
- `.gitignore` — keeps runtime state out of Git

Ignored (created at runtime):

```text
state.json     current phase and budget counters
PAUSE          kill switch; presence stops the runner
lock/          run lock
plans/         plans (one directory per plan)
debt/          engineering debt (one directory per item)
reviews/       machine-readable review results
runs/          per-run records and summaries
logs/          runner logs
```

Do not edit runtime state by hand unless recovering from a problem. See
[../docs/autonomous-engineering.md](../docs/autonomous-engineering.md).
