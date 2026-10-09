# RTA Alert Rules v1

These rules turn the **ANA Bot Alerts SOP** (Epic Games SV) and the **Guatemala / El Salvador visit debriefs** into the alerting model behind the RTA Board.

- Code: [`src/domain/exceptions.ts`](../src/domain/exceptions.ts)
- Proof: `npm run check`. Each rule has a fixture agent and an assertion in [`scripts/check.ts`](../scripts/check.ts).

Source keys:
- **[ANA]** `TELUS Digital - Epic Games SV - ANA BOT Alerts SOP.md` (repo root), with line numbers
- **[01]** External Debrief, WFM Command Center
- **[02]** Internal Debrief, Command Center Product
- **[SC]** WFM Weekly Scorecard SOP, summarised in `POC_Redefined/Product_and_Architecture_docs/SCORECARD_DATA_PRIORITIES.md`

## 1. What ANA Bot does today, and why it gets ignored

| Aspect | ANA Bot | Floor feedback |
|---|---|---|
| Alert types | One alert: the GTT aux ≠ the scheduled Verint activity. `#N/A` means the segment is unmapped, and `Offline` means a possible no-show [ANA L68, L145–158] | Missing alerts: shift-end logout, break overrun, LOB-wide problems [02 §8.2] |
| Threshold | None. Every mismatch is sent | "Not real violations" when there is no 4:59 waiver [01 §4.2] |
| Cadence | A message every 15 min [ANA L123] | "Even 15 minutes is too slow" for criticals [01 §1.2] |
| Grouping | By language × aux | TLs want their own team [02 §8.3] |
| Severity | None | Sev 3 → 2 → 1 by duration or repetition [02 §8.2] |
| Ack / escalation | None. The TL "reviews" [ANA L79–80] | "Red for 20+ minutes, don't know whether to re-ping" [01 R3] |
| Suppression | A manual check of valid reasons [ANA L97–110] | Approved absences show as no-shows every day [01 R6] |
| Outcome | "99% of the time those chats are not … acknowledged" (RTA TL focus group) | The board is the primary surface; direct alerts are for criticals only [01 §4.4] |

## 2. Severity and routing

| Sev | Surface | Who | Ack |
|---|---|---|---|
| **1** | Board (full red row) **+ direct alert sent automatically** | The agent's TL | 5 min window, then escalation ladder (§5) |
| **2** | Board + one **roll-up digest line per TL** ("3 of your agents… longest 22m") | The TL, batched | None |
| **3** | Board only | The RTA | None |

Each agent gets at most **one card**. The worst rule wins, and the others are listed on the card (`also`) [02 §8.3].

## 3. Rules

| ID | Alert | Trigger | Sev 3 | Sev 2 | Sev 1 | Source |
|---|---|---|---|---|---|---|
| A1 | Not clocked in | Past scheduled start, with no GTT `clock_in` and no Verint activity | — | ≥ 3 min | ≥ 10 min | [01 §4.4.2], [02 §8.2] |
| A2 | Out of adherence | Verint actual ≠ scheduled, beyond a 5-min buffer | 5–14 min | 15–29 | ≥ 30 | [02 §8.2] ("30–75 min out of compliance") |
| A3 | Break / lunch overrun | Still on a planned break that has ended, beyond the **4:59 waiver** | 5–9 min over | 10–29 over | ≥ 30 over | [01 §4.2, §4.4.2], [02 §8.2] |
| A4 | Not clocked out | Past scheduled end + 5 min, still clocked in on GTT (no `clock_out`) | — | 5–29 min | ≥ 30 | [01 §1.2] (missed 2 pm logout seen at 6 pm), [02 §8.2] |
| A5 | LOB incident | **≥ 5 agents and ≥ 20 %** of one LOB at Sev 1–2 at the same time | — | — | One incident alert to the LOB's TLs + Ops Manager. **It replaces the members' individual direct alerts** | [02 §8.3] |
| A6 | Unmapped activity | Verint label not in the activity map (ANA's `#N/A`) | — | — | — | [ANA L150], [02 §1.6]. This is a data-quality chip **routed to WFM, not the TL** |

### Modifiers

- **Repetition.** On the agent's 3rd out-of-adherence episode of the day (≥ 5 min each), A2 or A3 moves **up one severity level** [02 §8.2]. The card shows "3× today".
- **Suppression.** The agent is counted but gets no row when one of these applies:
  - a Workday approved exception (PTO, sick leave, LOA, maternity), or a VTO tagged by the RTA. **[SC]** counts RTA-initiated VTO as planned.
  - a **trainee**, who is excluded from alerts and shrink [SC].
  - a **known outage** that the RTA declared from the incident banner. It suppresses the whole LOB until cleared.
- **No retroactive excuse.** An acknowledgement reason explains an alert but never reclassifies it. Lateness, early-out and NCNS stay *unplanned* for the scorecard even when excused later [SC].

## 4. Acknowledgement reason codes

The codes are the valid reasons from ANA [L97–110], plus one from the debrief. A **Windows account block is not a valid reason** [ANA].

`VPN issue · GTT glitch · Windows glitch · Power / internet outage · Hardware · Long chat / call · Approved, not in system · Other`

These codes become the tuning data: ack rate, time-to-ack, reasons by rule [02 §8.4].

## 5. Escalation ladder

Escalation is **opt-in per account** (`escalation`, default *off*). The old bot's escalation was switched off after managers complained of spam [02 §8.4]. EPIC opts in.

| Minutes since a Sev 1 was sent, unacknowledged | With |
|---|---|
| 0–5 | Team Lead |
| > 5 | Ops Manager |
| > 15 | WFM Director |

## 6. Per-account settings

Every threshold above is one field in `DEFAULT` (`exceptions.ts`). An account overrides fields in `ACCOUNTS` (account = the LOB prefix, e.g. `EPIC`). The debriefs ask for per-account playbooks, e.g. alert every 2 min at low service level and every 10–15 min at high [02 §7]. Those belong here once a second account is onboarded.

## 7. Open questions for operations

1. **Partner TL.** ANA sends to the OPS TL **and** the partner TL [ANA L80, L114]. v1 routes to the agent's TL only. Should the partner TL get Sev 1s, or only the digest?
2. **The A5 threshold** (5 agents / 20 %) is a starting point. Calibrate it on a week of real EPIC data.
3. **Digest cadence.** The debriefs mention midday and end-of-day digests [02 §1.2, §10]. v1 shows the live digest line; delivery timing is still open.
4. **Proactive alerts** ("break ends in 5 min", pre-shift log-in nudges, [02 §8.5], E13 P3) are deliberately not in v1.
