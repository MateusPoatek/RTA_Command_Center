/**
 * adherenceSummary.ts — rolls up the live real-time-adherence card queue into
 * a shift-level summary for the composed Shift Report.
 *
 * Unlike the Attendance/GTT report, Adherence has no backend representation
 * or persistence — the only place this data exists is the in-memory
 * CommandCard[] queue (lane "real-time-adherence"). This is computed fresh
 * from whatever's in state at report-composition time, not fetched.
 */
import type { AdherenceSummary, CommandCard } from "../domain/types";

const TOP_OFFENDERS_LIMIT = 8;

export function buildAdherenceSummary(cards: CommandCard[]): AdherenceSummary {
  const violations = cards.filter((c) => c.lane === "real-time-adherence");

  const byOutcome = { resolved: 0, escalated: 0, sent: 0, suppressed: 0, active: 0 };
  for (const c of violations) {
    if (c.status === "resolved") byOutcome.resolved += 1;
    else if (c.status === "escalated") byOutcome.escalated += 1;
    else if (c.status === "sent") byOutcome.sent += 1;
    else if (c.status === "suppressed") byOutcome.suppressed += 1;
    else byOutcome.active += 1; // needs-review, ready-to-send, in-progress, detected, classified
  }

  const lobGroups = new Map<string, CommandCard[]>();
  for (const c of violations) {
    const lob = c.lob ?? "—";
    const list = lobGroups.get(lob);
    if (list) list.push(c);
    else lobGroups.set(lob, [c]);
  }
  const perLob = Array.from(lobGroups.entries())
    .map(([lob, group]) => {
      const pcts = group.map((c) => c.agent?.adherenceOutPercent).filter((p): p is number => p != null);
      return {
        lob,
        violationCount: group.length,
        avgAdherenceOutPercent: pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      };
    })
    .sort((a, b) => b.violationCount - a.violationCount);

  const agentGroups = new Map<string, CommandCard[]>();
  for (const c of violations) {
    const name = c.agent?.name;
    if (!name) continue; // sensitive top-offenders list only covers named agents
    const list = agentGroups.get(name);
    if (list) list.push(c);
    else agentGroups.set(name, [c]);
  }
  const topOffenders = Array.from(agentGroups.entries())
    .map(([agentName, group]) => {
      const pcts = group.map((c) => c.agent?.adherenceOutPercent).filter((p): p is number => p != null);
      return {
        agentName,
        lob: group[0].lob ?? "—",
        violationCount: group.length,
        worstAdherenceOutPercent: pcts.length > 0 ? Math.max(...pcts) : null,
      };
    })
    .sort((a, b) => b.violationCount - a.violationCount)
    .slice(0, TOP_OFFENDERS_LIMIT);

  return { totalViolations: violations.length, byOutcome, perLob, topOffenders };
}
