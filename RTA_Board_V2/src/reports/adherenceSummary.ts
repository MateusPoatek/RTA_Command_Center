// Shift-report Adherence section from the board's own alert model (domain/exceptions.ts), so the PDF and
// the Floor use ONE definition. The old command-center rolled this up from the extension's pre-built
// cards, a second, different rule set.
import type { VerintAgent } from "../data/types";
import type { BoardModel, Track } from "../domain/exceptions";
import { cfgFor, escalationLevel } from "../domain/exceptions";
import { displayName, lobLabel } from "../domain/wording";
import type { AdherenceSummary } from "./types";

export function buildAdherenceSummary(m: BoardModel, track: Record<string, Track>, agents: VerintAgent[], now: number): AdherenceSummary {
  const byOutcome = { resolved: 0, escalated: 0, sent: 0, suppressed: m.suppressed.length, active: 0 };
  for (const e of m.exceptions) {
    const t = track[e.key];
    if (t?.ackAt) byOutcome.resolved++;
    else if (t?.sentAt && escalationLevel(cfgFor(e.lob), t.sentAt, now)) byOutcome.escalated++;
    else if (t?.sentAt) byOutcome.sent++;
    else byOutcome.active++;
  }
  const outPct = (name: string) => { const a = agents.find((v) => v.name === name); return a?.adherencePct != null ? Math.max(0, 100 - a.adherencePct) : null; };
  const lobs = new Map<string, string[]>();
  for (const e of m.exceptions) lobs.set(e.lob, [...(lobs.get(e.lob) ?? []), e.agent]);
  const perLob = [...lobs].map(([lob, names]) => {
    const p = names.map(outPct).filter((x): x is number => x !== null);
    return { lob: lobLabel(lob), violationCount: names.length, avgAdherenceOutPercent: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null };
  }).sort((a, b) => b.violationCount - a.violationCount);
  const topOffenders = [...m.exceptions].sort((x, y) => x.sev - y.sev || y.minutes - x.minutes).slice(0, 8)
    .map((e) => ({ agentName: displayName(e.agent), lob: lobLabel(e.lob), violationCount: (e.repeat ?? 1) + e.also.length, worstAdherenceOutPercent: outPct(e.agent) }));
  return { totalViolations: m.exceptions.length, byOutcome, perLob, topOffenders };
}
