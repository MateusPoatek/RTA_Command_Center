# Real-Time Visuals — Config Panel Menu (draft for the team)

*The RTA / Scheduling team picks **what they want to see and track within their reporting cycles**. This is the menu
of the *possible* — every item is tagged by data availability so we only ever offer what we can actually source. It's
a **discussion artifact**: the team's choices become the defaults; we refine when we sit with them.*

**Grounded in:** [VERINT_EXTRACTION_CAPABILITIES.md](VERINT_EXTRACTION_CAPABILITIES.md) (what's extractable) +
[COMMAND_CENTER_LIVE_DATA_AUDIT.md](COMMAND_CENTER_LIVE_DATA_AUDIT.md) (what the CC can render). Natural home: an
evolution of the existing `CaptureConfigModal` (which already does honest LIVE/PLANNED labels).

## Availability legend (shown next to every toggle so we never over-promise)

🟢 **Live now** (Verint extension) · 🟡 **Derivable now** (Verint calc, no new source) ·
🔵 **When GTT lands** (creds in progress) · 🟠 **Needs telephony/ServiceNow** (separate adapter)

---

## Section 1 — Real-time floor (always-on view)

What stays on screen during the shift. Each toggle = a surface the RTA can show/hide.

| Show? | Item | Avail | Per-item options |
|:---:|------|:---:|------------------|
| ☑ | **Out-of-adherence alerts** | 🟢 | severity floor (low/med/high), which LOBs, escalation cadence |
| ☑ | **Real-time alert dispatch feed** | 🟢 | channel per LOB, AI-auto vs review-first |
| ☑ | **Adherence %** (per agent / per LOB) | 🟡 | thresholds for "at risk" colour |
| ☐ | **Shift open/close** (late-in / early-out flags) | 🟡 | grace window (min); planned-vs-actual delta |
| ☐ | **Productive hours** (running) | 🟡 | *definition pending **Load Contract Rules*** (see note) |
| ☐ | **LOB health** (SLA %, queue depth, calls holding) | 🟠 | *needs telephony/ACD adapter* |
| ☐ | **Open tickets** per agent/LOB | 🟠 | *needs ServiceNow adapter* |

## Section 2 — Reporting cycles (what each scheduled report contains)

RTAs report on a cadence (today: Morning / Midday / Final, ~3h apart). Configure the **times** and **contents** per cycle.

| Include in report? | Item | Avail |
|:---:|------|:---:|
| ☑ | Adherence summary (in/out %, top violations by LOB) | 🟡 |
| ☐ | Attendance (no-shows, late starts, early logouts) | 🔵 partial 🟡 from schedule now → ✅ with GTT |
| ☐ | Productive hours by agent/LOB | 🟡 *(contract rules)* |
| ☐ | Shift open/close exceptions | 🟡 |
| ☐ | Outage / incident log | 🟢 (from cards) |

*Cadence config:* report times (e.g. 09:00 / 12:00 / 15:00), recipients/channels, auto-assemble vs RTA-review.

## Section 3 — Scope & routing

- **My LOBs / accounts** — which lines this RTA owns (filters every surface above).
- **Alert channels** — LOB → Google Chat channel map (reuses existing routing).
- **Thresholds & escalation** — OOA severity bands, consecutive-cycle escalation (RTA → supervisor → OM).

## Section 4 — Data sources (transparency, read-only status)

| Source | Status | Unlocks |
|--------|--------|---------|
| Verint (browser extension) | 🟢 **LIVE** | adherence, alerts, shift, productive(paid) |
| GTT / Workday | 🔵 **PLANNED** — creds in progress | true clock-in/out, attendance |
| Telephony / ACD (Genesys/Avaya) | 🟠 **PLANNED** | SLA, queue, calls holding, AHT |
| ServiceNow | 🟠 **PLANNED** | ticket counts/status |

---

## Panel mock (for discussion)

```
┌─ Real-Time Visuals — Configuration ───────────────────────────┐
│ MY LOBS:  [Cards] [Costco] [Disputes] [TLB] [Fraud ITR] [+]     │
│                                                                │
│ ON THE FLOOR (always-on)                                       │
│   [✓] OOA alerts            🟢   severity ≥ [Medium ▾]          │
│   [✓] Dispatch feed         🟢   [AI auto] [Review first •]     │
│   [✓] Adherence %           🟡   at-risk < [75]%                │
│   [ ] Shift open/close      🟡   grace [5] min                  │
│   [ ] Productive hours      🟡   def: ⚠ pending contract rules  │
│   [ ] LOB health (SLA/queue)🟠   needs telephony — PLANNED      │
│   [ ] Open tickets          🟠   needs ServiceNow — PLANNED     │
│                                                                │
│ REPORTING CYCLES         Morning 09:00 · Midday 12:00 · Final 15:00 │
│   [✓] Adherence summary     🟡                                  │
│   [ ] Attendance            🔵 partial now · full when GTT lands │
│   [ ] Productive hours      🟡 (contract rules)                 │
│                                                                │
│ SOURCES:  Verint 🟢 LIVE · GTT 🔵 planned · ACD 🟠 · SNOW 🟠     │
└────────────────────────────────────────────────────────────────┘
```

---

## ⚠ Load Contract Rules (blocks "paid/productive" defaults)

"Paid" / "productive" is **client-defined**, owned by **Evelyn Brooks' team**; there are **5 contract types, not yet
in hand**. So the *Productive hours* toggle ships with paid-minutes + a "definition pending contract rules" caveat
until those specs arrive, then the classification plugs in as a per-client manifest input — not hardcoded. (See
[VERINT_EXTRACTION_CAPABILITIES.md](VERINT_EXTRACTION_CAPABILITIES.md) §4c.)

## Open questions for the team (their answers = our defaults)

1. Which surfaces are **always-on** vs **on-demand** for a typical RTA shift?
2. Report cadence — are Morning/Midday/Final the right cycles + times? What must each contain?
3. Adherence "at-risk" threshold and OOA severity bands — match current SOP?
4. Escalation chain + channels per LOB — confirm the routing map.
5. (For later) the 5 contract types → the paid/productive definitions.

## Build note

This is a **spec/menu**, not built UI. When approved, it extends `CaptureConfigModal` (the connector-registry seed)
into a control-plane config — checkbox state persists to a per-RTA/per-tenant config (the manifest), no code change to
add/remove a surface. 🟠/🔵 items render disabled with their "PLANNED — needs X" label so the menu never promises
data we can't source.
