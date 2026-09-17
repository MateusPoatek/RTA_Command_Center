*Audience: anyone (human or agent) producing docs or code in this repo · Purpose: how we work to keep token spend low without losing quality.*

---

# Production Playbook — Token Discipline

Four levers. Apply them by default. The goal is a small, expensive main context that only
does high-judgment work, with everything cheap pushed to subagents or a cheaper model.

## The four levers

1. **Model tiering** — draft on Sonnet, review/polish on Opus.
2. **Subagent isolation** — heavy reads happen in a subagent's context, never the main one.
3. **Template skeletons** — copy structure from `_templates/`, never re-derive it.
4. **RTK for ops** — git/file/build ops route through `rtk` (hook-wired; ~90% saved).

---

## Doc variant (producing the Architecture Package)

The master skeleton is [`README.md`](./README.md) (the Information Architecture). To produce
a chapter or diagram:

1. **Pick the skeleton** — `_templates/DOC_SKELETON.md` for a chapter, `BRD_SKELETON.md`
   for a formal deliverable, `diagrams/sources/` + the `%% D-NN` header for a diagram.
2. **Spawn ONE Sonnet subagent per artifact** (`Agent`, `model: sonnet`). Give it: the
   skeleton, the D-ID/chapter it owns, and the *paths* to its sources (BRD section,
   engineering doc). It reads those in its own context and returns **only** the finished
   `.md` / `.mmd` — not a summary of what it read. Parallelize independent artifacts in one
   message.
3. **Opus reviews in the main thread** — reads the returned draft (not the sources),
   checks it against conventions + the Principles map, wires the supersedes/references table.
4. **Render diagrams** — `bash diagrams/render.sh` (mmd → PNG in `diagrams/output/`).
5. **Opus-only, no fan-out:** the Information Architecture itself, the Architecture
   Principles chapter, cross-volume consistency, and the **D-00 A2 Platform Poster**.

## Coding variant (when we return to code)

Same shape, code instead of prose:

1. **Explore/read in subagents** — use `Explore`/`general-purpose` agents to locate code and
   read large files; they return the relevant excerpt + paths, keeping big files out of the
   main context.
2. **Draft on Sonnet** — mechanical edits, boilerplate, test scaffolding → Sonnet subagent.
3. **Opus reviews** — architecture decisions, cross-file consistency, the final diff review.
4. **RTK for every op** — `git`, `grep`, `ls`, `read` are auto-rewritten; don't bypass it.
5. **ponytail + karpathy** stay on (per [`../../CLAUDE.md`](../../CLAUDE.md)) — smallest diff
   that works; no speculative abstractions.

---

## When NOT to tier

Tiering has overhead (subagent spin-up, a round-trip). Skip it and just do it in the main
thread when the task is small: a one-paragraph edit, a single-line fix, a quick lookup. The
lever is for *bulk* drafting and *large* reads, not every keystroke.

## Measuring it

`rtk gain` / `rtk gain --history` for op savings. For a tiering decision, compare a subagent
draft-then-polish against a full-main-thread baseline on one representative artifact before
committing to the pattern for a batch.
