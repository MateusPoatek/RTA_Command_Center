# CIBC RTA Automation — Development Practices

## Default skills for coding work

For every coding task in this repo (writing, editing, refactoring, reviewing) — invoke both, unless the user says otherwise:

- **ponytail** (full intensity) — climb the laziness ladder before writing code: skip if unneeded (YAGNI) → reuse existing code in this repo → stdlib → native platform feature → already-installed dependency → one-liner → minimum custom code. Mark deliberate shortcuts with `# ponytail: <what/upgrade path>`.
- **karpathy-guidelines** — surface assumptions before implementing, make surgical changes only (don't touch code the task didn't ask about), keep changes to the minimum that solves the problem, define a verifiable check before calling something done.

Together: smaller diffs, fewer tokens, no speculative abstractions, no unrelated cleanup riding along on a task.

Say "stop ponytail" / "normal mode" to turn off for the session.

## Token discipline (docs and code)

Keep the main (Opus) context small and high-judgment; push cheap work down:

- **Model tiering** — draft on Sonnet subagents, review/polish on Opus.
- **Subagent isolation** — read large files (BRD, source docs) inside a subagent; it returns only the artifact, never the raw file.
- **Template skeletons** — copy structure from `POC_Redefined/Product_and_Architecture_docs/_templates/`, don't re-derive it.
- **RTK for ops** — git/file/build ops are hook-rewritten through `rtk`; don't bypass.

Skip tiering for small tasks (one-paragraph edits, one-line fixes). Full how-to: [DOC_PRODUCTION_PLAYBOOK.md](POC_Redefined/Product_and_Architecture_docs/DOC_PRODUCTION_PLAYBOOK.md).
