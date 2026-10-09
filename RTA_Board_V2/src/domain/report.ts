// Report composition with provenance. Every cell carries the sources it came
// from; a cell is only "ok" when its facts are backed the way they should be.
// Confidence = passed evaluations / total evaluations — the definition the
// Scorecard debrief proposes ([03] §6.3: (passed + validated) / total).
import type { Data, Origin, Source } from "../data/types";
import { clockIn, joinAll } from "./join";
import type { Joined } from "./join";
import { analyzeDay } from "./timeline";

export type Status = "ok" | "unverified" | "conflict" | "missing" | "pending";

export interface Prov {
  source: Source;
  system: string; // where it was read
  field: string;
  value: string;
  fetchedAt: number;
  origin: Origin;
  joinKey: "workday_id" | "name" | "name_loose";
}
export interface Cell { value: string; status: Status; note?: string; provs: Prov[] }

export interface AgentLine {
  name: string; lob: string; tl: string;
  scheduled: Cell; shiftStart: Cell; productive: Cell; adherence: Cell; attendance: Cell;
  passed: number; total: number;
  unpublished: boolean; // no published Verint schedule today
}
export interface LobRollup {
  lob: string; agents: number; confidence: number;
  checks: Record<Exclude<Status, "pending">, number>; // evaluated checks by outcome (scheduled, shift start, attendance)
  adherence: number | null; absentExplained: number; absentUnexplained: number; absenteeismPct: number;
}

const SHIFT_AGREE_MS = 10 * 60000;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export function composeReport(d: Data, now: number): { lines: AgentLine[]; lobs: LobRollup[] } {
  const lines: AgentLine[] = [];

  for (const j of joinAll(d)) {
    const a = j.agent;
    const jk = j.joinKey;
    const vP = (field: string, value: string): Prov => ({
      source: "Verint", system: a.origin === "live" ? "RTA Live Bridge (calendar-filter API)" : "Verint WFM (fixture)",
      field, value, fetchedAt: a.capturedAt, origin: a.origin, joinKey: jk,
    });
    const gIn = clockIn(j);
    const gOrigin = j.gtt[0]?.origin ?? "fixture";
    const gP = (): Prov[] => gIn === undefined ? [] : [{
      source: "GTT", system: gOrigin === "live" ? "GTT post-mortem report (live API)" : "GTT post-mortem report (fixture)", field: "status=clock_in · time_utc",
      value: hhmm(gIn), fetchedAt: now, origin: gOrigin, joinKey: jk,
    }];
    const wP = (field: string, value: string): Prov[] => !j.workday ? [] : [{
      source: "Workday", system: "Workday employee record (fixture)", field, value, fetchedAt: now, origin: "fixture", joinKey: jk,
    }];

    // scheduled: Verint is the schedule authority.
    const scheduled: Cell = a.scheduledStart && a.scheduledEnd
      ? { value: hm(Math.round((a.scheduledEnd - a.scheduledStart) / 60000)), status: "ok",
          provs: [vP("publishedSchedule.events · min(start)..max(end)", `${hhmm(a.scheduledStart)}–${hhmm(a.scheduledEnd)}`)] }
      : { value: "—", status: "missing", note: "No published schedule", provs: [] };

    // shift start: GTT clock-in corroborated by Verint's first actual event.
    const started = a.shiftStart !== undefined || gIn !== undefined;
    const sStart = a.shiftStart;
    const startedProvs = [...gP(), ...(sStart ? [vP("actualSchedule.events · min(start)", hhmm(sStart))] : [])];
    let shiftStart: Cell;
    if (!started) {
      const due = a.scheduledStart !== undefined && a.scheduledStart < now && !j.workday?.exception;
      shiftStart = j.workday?.exception
        ? { value: "—", status: "pending", note: "Approved absence — no clock-in expected", provs: [] }
        : { value: "—", status: due ? "missing" : "pending", note: due ? "Shift due, no clock-in in GTT or Verint" : "Not started yet", provs: [] };
    } else if (gIn !== undefined && sStart !== undefined) {
      const diff = Math.abs(gIn - sStart);
      shiftStart = diff <= SHIFT_AGREE_MS
        ? { value: hhmm(sStart), status: "ok", note: "GTT and Verint agree", provs: startedProvs }
        : { value: `${hhmm(gIn)} / ${hhmm(sStart)}`, status: "conflict", note: `GTT and Verint differ by ${Math.round(diff / 60000)} min`, provs: startedProvs };
    } else {
      shiftStart = { value: hhmm((sStart ?? gIn) as number), status: "unverified",
        note: gIn === undefined ? "Verint only — no GTT clock-in" : "GTT only — no Verint activity", provs: startedProvs };
    }

    const day = a.planned?.length && a.actual?.length ? analyzeDay(a.planned, a.actual, now) : null;
    const productive: Cell = day
      ? { value: hm(Math.round(day.productiveMin)), status: "ok", note: `${day.ooaMin} min out of adherence removed from ${Math.round(day.plannedWorkMin)} scheduled work min`,
          provs: [vP("derived: published ∩ actual segments (work, in adherence)", `${Math.round(day.productiveMin)} min`)] }
      : a.productiveMin !== undefined
      ? { value: hm(Math.max(0, a.productiveMin)), status: "ok", provs: [vP("actualSchedule.events · sum(isPaid)", `${a.productiveMin} min`)] }
      : { value: "—", status: a.shiftStart ? "missing" : "pending", provs: [] };
    const adherence: Cell = a.adherencePct !== null
      ? { value: `${a.adherencePct}%`, status: "ok", provs: [vP("adherenceSummary · in-adherence ÷ elapsed", `${a.adherencePct}%`)] }
      : { value: "—", status: a.shiftStart ? "missing" : "pending", provs: [] };

    // attendance: present = clock evidence; absent needs a Workday reason.
    let attendance: Cell;
    if (started) {
      attendance = { value: "Present", status: "ok", provs: startedProvs };
    } else if (j.workday?.exception) {
      attendance = { value: `Absent — ${j.workday.exception}`, status: "ok", note: "Explained by approved exception", provs: wP("exception", j.workday.exception) };
    } else if (a.scheduledStart !== undefined && a.scheduledStart < now) {
      attendance = { value: "Absent — unexplained", status: "conflict", note: "No clock-in and no approved exception", provs: wP("exception", "none") };
    } else {
      attendance = { value: "Pending", status: "pending", provs: [] };
    }

    const evals = [scheduled, shiftStart, attendance].filter((c) => c.status !== "pending");
    lines.push({
      name: a.name, lob: a.lob, tl: j.tl, scheduled, shiftStart, productive, adherence, attendance,
      passed: evals.filter((c) => c.status === "ok").length, total: evals.length,
      unpublished: a.scheduledStart === undefined || a.scheduledEnd === undefined,
    });
  }

  const byLob = new Map<string, AgentLine[]>();
  for (const l of lines) byLob.set(l.lob, [...(byLob.get(l.lob) ?? []), l]);
  const lobs: LobRollup[] = [...byLob].map(([lob, ls]) => {
    const pass = ls.reduce((s, l) => s + l.passed, 0);
    const tot = ls.reduce((s, l) => s + l.total, 0);
    const adh = ls.map((l) => parseFloat(l.adherence.value)).filter((n) => !Number.isNaN(n));
    const absent = ls.filter((l) => l.attendance.value.startsWith("Absent"));
    const unexplained = absent.filter((l) => l.attendance.status === "conflict").length;
    const checks = { ok: 0, unverified: 0, conflict: 0, missing: 0 };
    for (const l of ls) for (const c of [l.scheduled, l.shiftStart, l.attendance]) if (c.status !== "pending") checks[c.status]++;
    return {
      checks,
      lob, agents: ls.length, confidence: tot ? Math.round((100 * pass) / tot) : 100,
      adherence: adh.length ? Math.round(adh.reduce((s, n) => s + n, 0) / adh.length) : null,
      absentExplained: absent.length - unexplained, absentUnexplained: unexplained,
      absenteeismPct: Math.round((1000 * absent.length) / ls.length) / 10,
    };
  });
  return { lines, lobs };
}
