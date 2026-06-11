# ADR-0002 — State, not scoreboard (no agent leaderboards, ever)

- **Status:** Accepted (hard product line)
- **Date:** 2026-06-10
- **Context:** Floor View is built for the internal RTA daily-driver, so it leans into game-feel. This ADR fixes the
  boundary that game-feel must never cross.

## Why (the decision)

**Avatars depict operational state to be managed — never a person's performance ranking. There is no agent
leaderboard, not even internally.** The only "score" is a shift-level **floor-health recap** that measures the
**RTA's stewardship of the operation**, never any individual agent's adherence.

## The forces

- The avatars are **real employees**. Gamifying the *display of monitored people* — scoring them, ranking them —
  turns the tool into gamified surveillance. At a bank, that is an ethical, labour-relations, and reputational
  landmine.
- It would directly contradict the locked 6/8 strategy: **reposition RTAs as WFM experts; upskill, not replace (or
  surveil).** A leaderboard narrates the opposite story and kills that framing.
- "It's only internal" is not a safeguard. **Internal tools leak into management culture.** The moment a team lead
  screenshots "Diego is the reddest avatar this week," we have rebuilt the surveillance problem from the inside.
- Game-feel still has a legitimate home: the **RTA's own experience** — a responsive, legible, satisfying-to-operate
  console, and a sense of "I kept the floor green this shift." That is motivating the *operator*, not scoring the
  *monitored*.

## Consequences

- **Positive:** keeps Floor View inside the sanctioned strategy and clear of labour/privacy optics; defensible to
  governance and to clients; preserves the "upskill" narrative.
- **Negative / accepted:** we forgo the cheap engagement hit of per-agent leaderboards. This is a deliberate,
  permanent trade — the engagement comes from *restoring calm* and *building floor expertise*, not from ranking
  people.

## How this constrains the build

- No per-agent score, streak, rank, or cumulative tally is stored or displayed.
- Heat/colour reflect **current operational state** (live OOA duration), not a person's historical record.
- The shift recap is **floor-health, time-weighted, RTA-scoped** — "how green did you keep the floor" — and explicitly
  not "your agents' adherence scores."
