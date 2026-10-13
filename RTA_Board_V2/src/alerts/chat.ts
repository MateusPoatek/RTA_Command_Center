// TL Alert System -> Google Chat, through local_api.py (POST /api/dispatch-alert), which posts to the
// account's incoming webhook (env GCHAT_WEBHOOK_<ACCOUNT>; none = ok:false, the send stays simulated).
// An incoming webhook posts to the account's SPACE: it cannot DM one TL, so every line names the TL.
// ponytail: real DMs need a Chat app (backlog). Acknowledge stays on the board ("On it").
import type { BoardModel, Exception, Track } from "../domain/exceptions";
import { LADDER, cfgFor, escalationLevel } from "../domain/exceptions";
import type { Kpis } from "../domain/kpis";
import { displayName, lobLabel, sentence } from "../domain/wording";
import type { ReconciliationReport } from "../reports/types";

/** What local_api.py wraps as { cardsV2: [{ cardId, card }] } (a small subset of Cards v2). */
export interface ChatCard {
  header: { title: string; subtitle?: string };
  sections: { header?: string; widgets: { textParagraph: { text: string } }[] }[];
}

const MAX_LINES = 20; // a card nobody scrolls is ANA's "100 messages" again
// Only alerts that are new get a Chat post. An older one was already visible before this board opened
// (or was just reloaded), so it stays on the board: posting the backlog on every page load is ANA's spam again.
// ponytail: age heuristic; a server-side "already posted" log replaces it when dispatch moves off the browser.
export const CHAT_FRESH_MIN = 30;
export const tlLabel = (tl: string) => (!tl || tl === "Unassigned" ? "RTA (no Team Lead found)" : tl);

const line = (e: Exception) => `<b>For ${tlLabel(e.tl)}:</b> ${displayName(e.agent)} ${sentence(e)} · ${e.minutes} min`;
const para = (lines: string[]) => ({ textParagraph: { text: lines.slice(0, MAX_LINES).join("<br>") + (lines.length > MAX_LINES ? `<br>…and ${lines.length - MAX_LINES} more on the board` : "") } });

/** Alerts not posted yet: new Sev 1s (outside a LOB incident) and escalations that rose a level. */
export function chatDue(m: BoardModel, track: Record<string, Track>, now: number) {
  const fresh = m.exceptions.filter((e) => e.sev === 1 && !e.incident && !track[e.key]?.chatAt && !track[e.key]?.ackAt && e.minutes <= CHAT_FRESH_MIN);
  const escalate = m.exceptions.flatMap((e) => {
    const t = track[e.key];
    if (!t?.sentAt || t.ackAt || !t.chatAt) return [];
    const level = escalationLevel(cfgFor(e.lob), t.sentAt, now);
    return level > (t.chatLevel ?? 0) ? [{ e, level }] : [];
  });
  return { fresh, escalate };
}

/** One card per minute per account: every new Sev 1 of that minute, one line each. */
export function alertCard(fresh: Exception[], accountLabel: string): ChatCard {
  return {
    header: { title: `RTA alert${fresh.length > 1 ? "s" : ""} · ${accountLabel}`, subtitle: `${fresh.length} need the Team Lead now · press "On it" on the RTA Board` },
    sections: [{ widgets: [para(fresh.map(line))] }],
  };
}

export function escalationCard(items: { e: Exception; level: number }[], accountLabel: string): ChatCard {
  return {
    header: { title: `Not acknowledged · ${accountLabel}`, subtitle: "No \"On it\" from the Team Lead in time" },
    sections: [1, 2].map((lv) => items.filter((i) => i.level === lv)).filter((g) => g.length).map((g) => ({
      header: `→ ${LADDER[g[0].level]}`,
      widgets: [para(g.map(({ e }) => line(e)))],
    })),
  };
}

/** The 30-min digest: Sev 2 still open (never sent one by one), the headline numbers, the last report. */
export function digestCard(m: BoardModel, track: Record<string, Track>, k: Kpis, asOf: number, report: ReconciliationReport | null, accountLabel: string): ChatCard {
  const open = m.exceptions.filter((e) => e.sev === 2 && !track[e.key]?.ackAt);
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const at = new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sections: ChatCard["sections"] = [
    { header: `Numbers as of ${at}`, widgets: [para([`Attendance <b>${pct(k.attendance.pct)}</b> · Adherence <b>${pct(k.adherence.pct)}</b> · Shrinkage <b>${pct(k.shrink.pct)}</b> · Productive <b>${k.productive.hours}h</b>`])] },
    { header: `To watch (${open.length})`, widgets: [para(open.length ? open.map(line) : ["Nothing open."])] },
  ];
  if (m.incidents.length) sections.push({ header: "LOB incidents", widgets: [para(m.incidents.map((i) => `${lobLabel(i.lob)}: ${i.agents} of ${i.of} agents out at once`))] });
  if (report) sections.push({ header: `Attendance report (${new Date(report.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`, widgets: [para([`GTT ${report.gtt_total} · Verint ${report.verint_total} · matched ${report.matched} · ${report.discrepancy_count} gaps`, ...report.points_of_attention])] });
  return { header: { title: `RTA digest · ${accountLabel}`, subtitle: "Every 30 min · Sev 1 alerts are sent on their own" }, sections };
}

export type ChatResult = { at: number; what: string; ok: boolean; error?: string };

export async function dispatch(account: string, card: ChatCard, what: string): Promise<ChatResult> {
  try {
    const r = await fetch("/api/dispatch-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account, card }) });
    const d = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    return { at: Date.now(), what, ok: !!d.ok, error: d.ok ? undefined : d.error };
  } catch {
    return { at: Date.now(), what, ok: false, error: "local_api.py not reachable" };
  }
}
