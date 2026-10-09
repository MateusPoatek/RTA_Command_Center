// Optional live input: the existing "RTA Live Bridge" extension (POC_Redefined/
// verint_extension) posts { __rtaLiveBridge, kind:"cards", roster, syncedAt } to
// window. Same contract as the POC, so the extension works unchanged — and when
// it is replaced by a server-side capture, only this file changes.
import { useEffect } from "react";
import type { VerintAgent } from "./types";

export interface RosterRow {
  name: string;
  lob?: string;
  organization?: string; // Verint org leaf (extension >= 2026-10-09)
  scheduled_activity: string;
  actual_activity: string;
  out_of_adherence: string; // "H:MM:SS"
  days_adherence: string; // "93%"
  scheduled_shift_start?: string;
  scheduled_shift_end?: string;
  shift_start?: string;
  shift_end?: string;
  productive_paid_minutes?: number;
  adherence_minutes?: number;
  ooa_minutes?: number;
  schedule_state?: "published" | "draft_only" | "none";
  published_segments_json?: string; // [{a, k: work|paid|unpaid|off, s, e}]
}

type Seg = { a?: number; k: string; s: number; e: number };
const slices = (json: string | undefined, kinds: string[]) => {
  try { return (JSON.parse(json || "[]") as Seg[]).filter((x) => kinds.includes(x.k)).map((x) => [x.s, x.e] as [number, number]); }
  catch { return undefined; }
};

const ms = (iso?: string) => (iso ? new Date(iso).getTime() || undefined : undefined);
const hms = (s: string) => s.split(":").map(Number).reduce((a, n) => a * 60 + (n || 0), 0);

export function rosterToAgents(roster: RosterRow[], syncedAt: number): VerintAgent[] {
  return roster.map((r) => ({
    name: r.name,
    // "<capture account> - <line of business>": the account is the LOB the extension tagged (App drops other
    // accounts' rows); the line of business is the Verint org leaf, BPO_Global_EPIC_TISV_Player Support -> "TISV · Player Support".
    lob: [r.lob || "", r.organization?.split("_").slice(-2).join(" · ")].filter(Boolean).join(" - "),
    scheduledActivity: r.scheduled_activity,
    actualActivity: r.actual_activity,
    ooaSeconds: hms(r.out_of_adherence || "0:00:00"),
    adherencePct: parseFloat(r.days_adherence) || null,
    scheduledStart: ms(r.scheduled_shift_start),
    scheduledEnd: ms(r.scheduled_shift_end),
    shiftStart: ms(r.shift_start),
    actualEnd: ms(r.shift_end),
    productiveMin: r.productive_paid_minutes,
    scheduleState: r.schedule_state,
    paidPlan: r.published_segments_json ? slices(r.published_segments_json, ["work", "paid"]) : undefined,
    timeOff: r.published_segments_json ? slices(r.published_segments_json, ["off"]) : undefined,
    adherenceMin: r.adherence_minutes,
    ooaMinToday: r.ooa_minutes,
    capturedAt: syncedAt,
    origin: "live",
  }));
}

export function useBridge(onRoster: (agents: VerintAgent[], raw: RosterRow[], syncedAt: number) => void) {
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || !d || d.__rtaLiveBridge !== true || d.kind !== "cards") return;
      if (Array.isArray(d.roster) && d.roster.length) {
        const at = d.syncedAt ? new Date(d.syncedAt).getTime() : Date.now();
        onRoster(rosterToAgents(d.roster, at), d.roster, at);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onRoster]);
}

/** Page -> extension control (content_cc.js relays to background.js): "set-lob", "trigger-capture", "push-now". */
export const bridgeSend = (kind: string, extra: Record<string, unknown> = {}) =>
  window.postMessage({ __rtaLiveBridge: true, kind, ...extra }, window.location.origin);
