// Board ranking: turns live cards (reactive) + the Verint roster (proactive)
// into one priority-ordered list. Pure — see scripts/board.test.ts.
import type { CommandCard, Severity } from "./types";
import type { VerintRosterRow } from "../hooks/useExtensionBridge";

export type BoardKind = "reactive" | "pre-shift" | "late-login" | "activity-change";

export interface BoardRow {
  id: string;
  kind: BoardKind;
  severity: Severity;
  agent: string;
  lob: string;
  headline: string;
  /** Epoch ms the row is "about": event start for proactive rows, undefined for reactive. */
  dueMs?: number;
  cardId?: string;
}

const RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
// ponytail: fixed windows; make per-LOB/config if RTAs want to tune them.
const LEAD_MIN = 10;      // alert this long before shift start / activity change
const LATE_MAX_MIN = 15;  // stop reporting "late" after this — beyond it, Verint adherence cards take over
const CLOSED: CommandCard["status"][] = ["sent", "suppressed", "resolved", "archived", "added-to-handoff"];

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

export function buildBoardRows(cards: CommandCard[], roster: VerintRosterRow[], now: number): BoardRow[] {
  const rows: BoardRow[] = [];

  for (const c of cards) {
    if (!c.agent || CLOSED.includes(c.status)) continue;
    rows.push({
      id: c.id, kind: "reactive", severity: c.severity, agent: c.agent.name,
      lob: c.lob || c.agent.lob, headline: c.title, cardId: c.id,
    });
  }

  for (const r of roster) {
    const lob = r.lob ?? "";
    const start = ms(r.scheduled_shift_start);
    const minsToStart = (start - now) / 60000;
    if (!r.shift_start && minsToStart <= LEAD_MIN && minsToStart >= -LATE_MAX_MIN) {
      const late = minsToStart < 0;
      rows.push({
        id: `shift-${r.name}-${r.scheduled_shift_start}`,
        kind: late ? "late-login" : "pre-shift",
        severity: late ? "high" : minsToStart <= 5 ? "medium" : "low",
        agent: r.name, lob, dueMs: start,
        headline: late ? "Shift started — not logged in" : "Shift starts soon — remind to log in",
      });
    }
    const next = ms(r.next_activity_start);
    const minsToNext = (next - now) / 60000;
    if (r.next_activity && minsToNext > 0 && minsToNext <= LEAD_MIN) {
      rows.push({
        id: `next-${r.name}-${r.next_activity_start}`, kind: "activity-change",
        severity: "low", agent: r.name, lob, dueMs: next,
        headline: `Next: ${r.next_activity}`,
      });
    }
  }

  // Severity first; within a tier, whatever is due soonest (proactive) — reactive rows have no dueMs and sort first.
  return rows.sort((a, b) => RANK[b.severity] - RANK[a.severity] || (a.dueMs ?? 0) - (b.dueMs ?? 0));
}
