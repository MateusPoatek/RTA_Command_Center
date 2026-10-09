/**
 * dispatchHelpers.ts — pure helpers for grouping DispatchEntry records
 *
 * A dispatch batch (App.tsx's flushBatch) stamps every DispatchEntry it
 * creates with the same `cycle` number. groupByCycle() turns a flat
 * DispatchEntry[] back into that batch structure for display — used by both
 * DispatchFeed (live, this-shift view) and CloseShiftPanel (end-of-shift
 * handoff summary), so the two views can't drift apart.
 */

import type { DispatchEntry } from "../domain/scenario_types";
import type { AdherenceSummary, CommandCard, ReconciliationReport, Severity } from "../domain/types";
import { telusColors } from "../shared/brandConfig";

export interface DispatchBatch {
  cycle: number;
  entries: DispatchEntry[];
  latestTimestamp: string;
}

/**
 * Groups entries by DispatchEntry.cycle, newest batch first.
 *
 * @param entries - Any DispatchEntry list (already filtered by account, if applicable).
 * @returns        Batches, newest first. A cycle with a single entry (e.g. a
 *                 lone escalation) is still returned as a batch of size 1 —
 *                 callers can render it exactly like an individual entry.
 */
export function groupByCycle(entries: DispatchEntry[]): DispatchBatch[] {
  const buckets = new Map<number, DispatchEntry[]>();
  for (const e of entries) {
    const list = buckets.get(e.cycle);
    if (list) list.push(e);
    else buckets.set(e.cycle, [e]);
  }
  return [...buckets.entries()]
    .map(([cycle, es]) => ({
      cycle,
      entries: es,
      latestTimestamp: es.reduce((max, e) => (e.timestamp > max ? e.timestamp : max), es[0].timestamp),
    }))
    .sort((a, b) => b.cycle - a.cycle);
}

// ---------------------------------------------------------------------------
// Google Chat card formatting — shared shape + helpers
// ---------------------------------------------------------------------------

// Minimal shape of what we actually build — not the full Google Chat Cards
// v2 schema (that's much larger). local_api.py wraps this in
// { cardsV2: [{ cardId: <generated server-side>, card: <this object> }] }.
interface ChatCard {
  header: { title: string; subtitle?: string };
  sections: { header?: string; widgets: { textParagraph: { text: string } }[] }[];
}

// Confirmed live against the actual webhook, not assumed from docs:
// `<font color="#hex">` inside a textParagraph DOES render real color,
// unlike a card's header/subtitle which stay plain.
const font = (hex: string, text: string | number) => `<font color="${hex}">${text}</font>`;
// Verint names/skills/activities go into textParagraph HTML — escape them so a
// stray "<" or "&" can't break (or inject into) the card's formatting.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];
const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "🔵",
  info:     "⚪",
};
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
  info:     "Info",
};
// Telus's palette has no red/amber (see brandConfig.ts) — reuse the same
// conventional problem/pending colors the PDF report already uses, only for
// the two severities that actually warrant a color call-out.
const SEVERITY_COLOR: Partial<Record<Severity, string>> = {
  critical: telusColors.problemRed,
  high:     telusColors.pendingAmber,
};

// card.draftMessage reads "{lob} alert: {name} — {detail}" (see parse.js's
// buildCard) — that {name} segment duplicates the name we already show as
// this line's bold label (that's the literal "504674 — EPIC alert: 504674
// — ..." double-up reported live). Strips just the name between "alert: "
// and the next " — ", keeping the "{lob} alert:" label and the real detail.
function stripNameEcho(text: string): string {
  const afterAlert = text.indexOf("alert: ");
  if (afterAlert < 0) return text;
  const detailStart = text.indexOf(" — ", afterAlert);
  if (detailStart < 0) return text;
  return text.slice(0, afterAlert + "alert: ".length) + text.slice(detailStart + 3);
}

/**
 * Formats an entire flush's google-chat-lob cards into ONE Google Chat CARD
 * — a burst of one ping per card per flush was unreadable in a busy space
 * and easy to miss. Groups cards into one SECTION per severity level present
 * (critical first), each with its own header and divider — clustering
 * same-urgency alerts together reads far better than one flat numbered list
 * once a batch has more than a couple of cards.
 *
 * @param cards - Cards going to Chat for ONE account in this flush (not the
 *                whole batch — callers group by account first).
 * @param opts  - Per-account format flags (see AccountConfig in accounts.ts).
 *                Omitted -> the original format, unchanged.
 */
export function buildGChatAlertBatchCard(
  cards: CommandCard[],
  opts: { omitPleaseCheck?: boolean; languageById?: Record<string, string>; verintBase?: string } = {},
): ChatCard {
  const count = cards.length;
  const bySeverity = new Map<Severity, CommandCard[]>();
  for (const c of cards) {
    const list = bySeverity.get(c.severity);
    if (list) list.push(c);
    else bySeverity.set(c.severity, [c]);
  }

  const sections: ChatCard["sections"] = [...SEVERITY_ORDER]
    .reverse() // most severe first
    .filter((sev) => bySeverity.has(sev))
    .map((sev) => {
      const group = bySeverity.get(sev)!;
      const color = SEVERITY_COLOR[sev];
      const lines = group.map((c, i) => {
        // No roster name -> the name is already "Agent #<id>"; don't repeat the id.
        const idSuffix = c.agent?.id && c.agent.name !== `Agent #${c.agent.id}` ? ` (#${c.agent.id})` : "";
        const nameWithId = esc(`${c.agent?.name ?? c.title}${idSuffix}`);
        let detail = esc(stripNameEcho(c.draftMessage ?? c.summary ?? c.title));
        if (opts.omitPleaseCheck) detail = detail.replace(/\s*Please check\.?\s*$/i, "");
        const boldName = color ? font(color, `<b>${nameWithId}</b>`) : `<b>${nameWithId}</b>`;
        const language = c.agent?.id ? opts.languageById?.[String(c.agent.id)] : undefined;
        // Shown verbatim (EPIC_BG: Verint skill names, so RTAs can filter by them).
        const languageTag = language ? ` · ${esc(language)}` : "";
        // Per-agent deep links: Verint's legacy Tracking pages accept the
        // employee as ?selectedID= (the calendar has no per-employee URL).
        // Both show today, which is what a live alert needs.
        const id = c.agent?.id ? encodeURIComponent(String(c.agent.id)) : "";
        const links = opts.verintBase && id
          ? ` · <a href="${opts.verintBase}/wfo/control/peopleschedule_fs?selectedID=${id}">View shift</a>` +
            ` · <a href="${opts.verintBase}/wfo/control/viewtimerecord_fs?selectedID=${id}">Day details</a>`
          : "";
        return `${i + 1}. ${boldName}${languageTag} — ${detail}${links}`;
      });
      return {
        header: `${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} (${group.length})`,
        widgets: [{ textParagraph: { text: lines.join("<br>") } }],
      };
    });

  return {
    header: {
      title: opts.omitPleaseCheck ? "🚨 OUT OF ADHERENCE ALERTS 🚨" : "🚨 OUT OF ADHERENCE ALERTS: PLEASE CHECK 🚨",
      subtitle: `${count} alert${count === 1 ? "" : "s"} — ${new Date().toLocaleString()}`,
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// Periodic Attendance + Adherence digest
// ---------------------------------------------------------------------------

/**
 * A single, scannable Google Chat CARD (not plain text) combining the
 * Attendance (GTT×Verint) report with the live Adherence rollup — sent on a
 * timer (see App.tsx's chatDigestEnabled / 30-min useCaptureScheduler) or
 * on-demand via the Report Config "Send Now" button.
 *
 * Cards v2 gives real section dividers (one per section, rendered by Chat
 * itself) and — confirmed live against the actual webhook, not assumed from
 * docs — `<font color="#hex">` inside a textParagraph DOES render real
 * color, unlike a card's header/subtitle which stay plain. So Telus colors
 * are used INSIDE section bodies only: Forest green for healthy numbers,
 * red for real problems (discrepancies/escalations), amber for
 * still-active/pending, Purple for the digest's own totals as a brand
 * accent — not a literal semantic color, just identity.
 *
 * @param report     - Latest Attendance report for this account, or null if none generated yet.
 * @param adherence  - Live Adherence rollup (see utils/adherenceSummary.ts), already scoped to this account.
 * @param accountLabel - Human-readable account name for the header.
 */
export function buildChatDigestCard(
  report: ReconciliationReport | null,
  adherence: AdherenceSummary,
  accountLabel: string,
): ChatCard {
  const sections: ChatCard["sections"] = [];

  const attendanceLines: string[] = [];
  const verintOnly = report?.source === "verint_only";
  if (report) {
    const discColor = report.discrepancy_count > 0 ? telusColors.problemRed : telusColors.forest;
    if (verintOnly) {
      attendanceLines.push(`Verint Captured: <b>${font(telusColors.purple, report.verint_total)}</b>`);
      attendanceLines.push(`Attendance Gaps: <b>${font(discColor, report.discrepancy_count)}</b>`);
    } else {
      const pct = report.gtt_total > 0 ? Math.round((report.matched / report.gtt_total) * 100) : 0;
      attendanceLines.push(`GTT Attendance: <b>${font(telusColors.forest, report.gtt_total)}</b>`);
      attendanceLines.push(`Verint Captured: <b>${font(telusColors.purple, report.verint_total)}</b>`);
      attendanceLines.push(`Matched: <b>${font(telusColors.forest, `${report.matched} (${pct}%)`)}</b>`);
      attendanceLines.push(`Discrepancies: <b>${font(discColor, report.discrepancy_count)}</b>`);
    }
    attendanceLines.push(`Total Productive Hours: <b>${(report.total_productive_minutes / 60).toFixed(1)}h</b>`);
  } else {
    attendanceLines.push("<i>No attendance report generated yet today.</i>");
  }
  sections.push({
    header: verintOnly ? "📊 Attendance (Verint)" : "📊 Attendance (GTT × Verint)",
    widgets: [{ textParagraph: { text: attendanceLines.join("<br>") } }],
  });

  const adherenceLines: string[] = [
    `Total: <b>${font(telusColors.purple, adherence.totalViolations)}</b>` +
    ` · Resolved: ${adherence.byOutcome.resolved}` +
    ` · Escalated: ${font(telusColors.problemRed, adherence.byOutcome.escalated)}` +
    ` · Sent: ${adherence.byOutcome.sent}` +
    ` · Suppressed: ${adherence.byOutcome.suppressed}` +
    ` · Active: ${font(telusColors.pendingAmber, adherence.byOutcome.active)}`,
  ];
  if (adherence.perLob.length > 0) {
    adherenceLines.push("");
    adherenceLines.push("<b>Top LOBs</b>");
    for (const l of adherence.perLob.slice(0, 3)) {
      const pctText = l.avgAdherenceOutPercent != null ? `, avg ${l.avgAdherenceOutPercent.toFixed(0)}% OOA` : "";
      adherenceLines.push(`• ${l.lob}: ${l.violationCount} violation(s)${pctText}`);
    }
  }
  if (adherence.topOffenders.length > 0) {
    adherenceLines.push("");
    adherenceLines.push("<b>Top Offenders</b>");
    for (const o of adherence.topOffenders.slice(0, 3)) {
      adherenceLines.push(`• ${o.agentName} (${o.lob}): ${o.violationCount} violation(s)`);
    }
  }
  sections.push({
    header: "🎯 Adherence (Real-Time Violations)",
    widgets: [{ textParagraph: { text: adherenceLines.join("<br>") } }],
  });

  if (report && report.points_of_attention.length > 0) {
    sections.push({
      header: "⚠️ Points of Attention",
      widgets: [{
        textParagraph: {
          text: report.points_of_attention.slice(0, 5).map((p) => `• ${p}`).join("<br>"),
        },
      }],
    });
  }

  return {
    header: { title: `📋 Shift Digest — ${accountLabel}`, subtitle: new Date().toLocaleString() },
    sections,
  };
}
