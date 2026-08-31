# ADR-0001 — Floor View is a radar, the card is the action surface

- **Status:** Accepted
- **Date:** 2026-06-10
- **Context:** Floor View design (see [../DESIGN.md](../DESIGN.md))

## Why (the decision)

**Floor View renders state and *finds* problems; the existing `CommandCard` *resolves* them.** Clicking a flaring
avatar opens its already-attached card with the draft message, channels, actions, and audit trail intact. We add a
spatial front door — we do not rebuild the machinery behind it.

## The forces

- The card pipeline (lifecycle, draft messages, target channels, audit events, Copilot, "teach-AI") is **proven and
  governance-shaped**. Re-implementing actions "on the floor" would duplicate it and create a second, unaudited write
  path — unacceptable given the "all writes via approved channels" rule.
- The genuine deficiency of today's UX is **discovery**, not resolution: a serial list is a poor *finder*. A spatial
  map is an excellent finder. So fix the finder, keep the resolver.
- `AgentProfile` is already linked to its `CommandCard`, so "click avatar → open card" is a thin, additive seam.

## Consequences

- **Positive:** zero disruption to the proven action path; the floor is purely additive; one clear mental model
  ("radar finds, card resolves"); no new write surface to govern.
- **Negative / accepted:** the RTA context-switches from floor to card to act. This is *intended* — acting should be
  deliberate and audited, not a twitch-click on a game board. We explicitly reject "drag an avatar to fire an alert."

## Alternatives rejected

- **Act directly on the floor** (drag/click an avatar to send) — recreates the action machinery, opens an unaudited
  path, and makes consequential actions feel like a game gesture. Rejected.
- **Floor View replaces the card feed entirely** — throws away a proven, governed surface to solve a discovery
  problem. Rejected.
