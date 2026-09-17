# Floor View — Design

*The UX. For the engine that feeds it, see [REFRESH_ARCHITECTURE.md](REFRESH_ARCHITECTURE.md). For the decisions
behind these choices, see [decisions/](decisions/).*

---

## 1. The problem with a list

The RTA's current work surface is `PriorityFeed` — up to eight cards, sorted by severity. A list is **serial**: you
read it top to bottom, one item at a time, and when you look away it tells you nothing about *where* on the floor the
trouble is. It has no geography, so it builds no memory.

Floor View is a **parallel** surface. One glance conveys the state of the whole floor, because state is encoded in
**position, colour, and motion** — three channels the eye reads simultaneously and pre-attentively.

## 2. The governing principle: stillness is the reward

> A live floor full of moving, glowing avatars is a slot machine. If everything pulses, the eye goes everywhere and
> lands nowhere — a more stressful list.

So the design inverts the usual "gamified dashboard" instinct:

- **Healthy = calm + still + green.** A quiet floor is the signal "you've got this." Quiet is the goal state, and
  achieving quiet is the reward.
- **Motion, colour, and heat are a budget spent only on exceptions.** The single avatar that desaturates and starts
  accumulating heat is the *only* thing that moves — so the eye snaps to it, because nothing else competes.
- **The "juice" is the resolution, not the ambience.** The satisfying beat is the avatar **snapping back to green**
  when the RTA clears the alert. The reward loop is *restoring calm*, not racking up points.

This is what makes Floor View a focus tool rather than an anxiety machine, and it is the throughline for every visual
decision below.

## 3. Radar + action surface (ADR-0001)

Floor View does **not** replace the command card; it becomes a better front door to it.

| Surface | Role | Interaction |
|---------|------|-------------|
| **Floor (radar)** | Ambient, glanceable. Where the RTA *lives* during a calm shift. Finds the problem. | Watch; click a flaring avatar. |
| **Command card (action)** | The existing `CommandCard` with its draft message + actions. Resolves the problem. | Approve-send / escalate / suppress / teach-AI. |

**Radar finds it; the card resolves it.** Everything already built — the card lifecycle, draft messages, channels,
audit trail, Copilot — stays exactly as is. We add a spatial entry point, we don't rebuild the machinery. Clicking an
avatar opens its attached card (the `AgentProfile` is already linked to the card today).

## 4. Neighbourhoods, not seats

There are **no physical seat coordinates** in the data — `AgentProfile.geo` is only `"Guatemala" | "Philippines" |
"Unknown"`. So the floor is not a literal seating chart. Instead avatars cluster into **LOB neighbourhoods**, keyed by
the `organizationName` that is **intrinsic to every Verint record** (e.g. `BPO_Global_EPIC_TISV_Player Support`).

This is *better* than physical seats:

- It matches how RTAs already think about the floor — by line of business.
- A whole neighbourhood flushing red = an **LOB-level event** (an outage, a coaching block, a missed break wave),
  legible at a glance in a way a list can never be.
- It maps one-to-one onto the refresh engine's unit of work (a neighbourhood = a targeted pull).

Layout: stable positions per neighbourhood (so muscle memory can form — a neighbourhood doesn't wander between
shifts), avatars arranged within their block, the block labelled with its LOB and a per-neighbourhood freshness
readout ("synced 8s ago").

## 5. The visual language

Driven entirely by fields we already have on `AgentProfile` and the live `CommandCard`.

| Signal | Encodes | Source |
|--------|---------|--------|
| **Avatar colour / saturation** | adherence state (in-adherence = calm green; out = desaturates) | `currentStatus` vs `scheduledActivity`, `adherenceOutPercent` |
| **Heat** (a growing glow/aura) | *how long* an avatar has been out of adherence — escalating cost made visible | OOA duration (already drives titles like `COAC 32:14`) |
| **The lunch/break wave** | scheduled transitions rolling through neighbourhoods — the floor's *cadence* | `schedulePreview` (`["Break 14:00", "Lunch 15:30"]`) |
| **Snap-to-green** | an alert just resolved | card `status` → `resolved` |
| **Neighbourhood freshness** | when this LOB was last polled | refresh engine's per-neighbourhood `lastSyncedAt` |

**Heat accumulation** is the centrepiece: an out-of-adherence avatar slowly accrues visible heat proportional to its
OOA duration. It's honest — heat maps to real, escalating operational cost — and it does the attention work for the
RTA: the longer something festers, the harder it pulls the eye.

**The lunch/break wave** is the expertise-builder: render scheduled activity transitions as a wave moving through the
neighbourhoods. Watch it a few shifts and you *learn the floor's rhythm* — you start anticipating the 12:00 wave
instead of reacting to it.

## 6. State, not scoreboard (ADR-0002)

The avatars are **real people**, and even an internal tool leaks into management culture. So:

- **No agent leaderboard, ever** — not even internally. The moment a TL screenshots "Diego is the reddest avatar,"
  we've rebuilt the surveillance problem from the inside.
- Avatars depict **operational state to be managed**, never a person's performance ranking.
- The only "score" is the **shift-health recap** at close (reusing the existing `CloseShiftPanel`): *how green did you
  keep the floor* — a time-weighted measure of the **RTA's stewardship of the operation**, never a measure of any
  individual's adherence.

This keeps Floor View inside the locked 6/8 strategy ("upskill, not replace / surveil") and out of the labour-optics
landmine. It is a hard product line, not a preference.

## 7. What we are NOT deciding here

- **Rendering technology** (SVG/DOM vs a canvas lib) is an implementation-time decision, deferred to an ADR written
  during Phase 3. Default lean: dependency-free SVG/DOM + CSS transitions for ≤~200 avatars; escalate to Konva/Pixi
  *only* if real avatar counts demand it. We will not add a heavy dependency speculatively.
- **Exact motion timing / easing / palette** — tuned against the real feel once it's on screen with live data.
