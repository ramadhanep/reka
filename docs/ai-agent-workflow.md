# AI Agent Workflow

REKA is intentionally designed to be developed with AI coding agents.

The agent is an implementation assistant, not the architecture owner.

## 1. Source of Truth

Use this order:

```text
AGENTS.md
   ↓
ARCHITECTURE.md
   ↓
module documentation
   ↓
ADR
   ↓
task plan
   ↓
existing code
```

When documentation conflicts with code:

- do not silently rewrite architecture
- determine which is current
- update the canonical document when the architecture intentionally changes

## 2. Session Start

For non-trivial tasks:

```text
read AGENTS.md
inspect git status
inspect relevant directory
find existing patterns
read task/module docs
```

Do not scan the entire repository by default.

## 3. Plan Before Edit

Use:

[docs/templates/TASK_TEMPLATE.md](./templates/TASK_TEMPLATE.md)

The plan should identify:

- scope
- affected modules
- files likely to change
- dependencies
- data changes
- API changes
- UI changes
- test plan
- verification commands

## 4. Work in Small Batches

Preferred loop:

```text
inspect
  ↓
plan
  ↓
implement
  ↓
test
  ↓
inspect diff
  ↓
continue
```

Avoid huge speculative edits.

## 5. Specialized Agents

Project-local OpenCode agents may be used for:

```text
review
architecture-review
security-review
```

These should support the main agent rather than rewrite its architecture.

## 6. Review Before Completion

Ask a reviewer to look for:

- regression
- security flaw
- broken authorization
- data integrity problem
- unnecessary abstraction
- performance regression
- missing tests

## 7. Agent Must Not

- create new repos
- introduce microservices without ADR
- introduce infrastructure without requirement
- rewrite unrelated code
- bypass tests
- weaken security to make tests pass
- fabricate successful command output
- modify migrations to hide data problems

## 8. Commit Discipline

AI-generated work should still be understandable to a human.

Prefer commits that represent one logical improvement.

## 9. Context Efficiency

Do not load every document into every task.

Use:

- AGENTS.md for always-on constraints
- module docs for module work
- ADRs for architecture decisions
- task files for the exact change

This keeps the model context smaller and reduces conflicting instructions.
