// "As of now" headline numbers for the selected account. Every figure is a
// ratio of sums over the elapsed part of today's PUBLISHED schedule (the
// scorecard SOP convention), never an average of per-agent percentages.
// The funnel records every step, so a shrinkage figure can be traced:
//   roster -> published schedule -> shift started -> presenting activity -> productive minutes
import type { Data } from "../data/types";
import type { BoardModel, Kind } from "./exceptions";
import { clockIn, joinAll } from "./join";
import { analyzeDay } from "./timeline";

export interface Funnel {
  roster: number; trainees: number; unpublished: number; published: number;
  notYet: number; due: number; approved: number; absent: number;
  present: number; presentVerint: number; presentGttOnly: number;
  schedMin: number;        // elapsed published minutes of every due agent (the shrinkage base)
  absenceMin: number;      // ... of agents with no activity at all
  presentSchedMin: number; // ... of agents presenting activity
  productiveMin: number;
  inShiftMin: number;      // presentSchedMin − productive
  gttOnlyMin: number;      // part of inShiftMin from agents GTT says are in but Verint shows no activity (0 productive)
  timeOffMin: number;      // part of absenceMin that is planned time off published in Verint
  spanBased: number;       // agents whose base is first-to-last event (no paid detail) — includes unpaid lunch
  clippedMin: number;      // published minutes before Verint's capture window starts, left out of the base
  lagged: number;          // agents measured up to their last closed Verint activity instead of the capture time
}

export interface Kpis {
  attendance: { pct: number | null; present: number; expected: number; approved: number; unexplained: number };
  adherence: { pct: number | null; inMin: number; outMin: number; agents: number };
  productive: { hours: number; agents: number; schedHours: number };
  violation: { label: string; count: number; next: Array<{ label: string; count: number }> } | null;
  shrink: { pct: number | null; absenceMin: number; inShiftMin: number; schedMin: number };
  unpublished: number; // agents excluded from every number: no published schedule = no base to measure against
  funnel: Funnel;
}

const LABEL: Record<Kind, string> = { "no-clock-in": "Not clocked in", "no-clock-out": "Not clocked out", "break-overrun": "Break / lunch overrun", ooa: "", "no-show": "No-show (no activity, no clock-in)" };
const pct = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);
const upTo = (sl: Array<[number, number]> | undefined, t: number, from = -Infinity) => (sl ?? []).reduce((m, [s, e]) => m + Math.max(0, Math.min(e, t) - Math.max(s, from)), 0) / 60000;

export function computeKpis(d: Data, now: number, board: BoardModel): Kpis {
  const f: Funnel = { roster: 0, trainees: 0, unpublished: 0, published: 0, notYet: 0, due: 0, approved: 0, absent: 0, present: 0, presentVerint: 0, presentGttOnly: 0,
    schedMin: 0, absenceMin: 0, presentSchedMin: 0, productiveMin: 0, inShiftMin: 0, gttOnlyMin: 0, timeOffMin: 0, spanBased: 0, clippedMin: 0, lagged: 0 };
  // Verint's actuals cover one capture day (on 2026-10-09 EPIC: from 07:00Z). Overnight shifts published
  // from 02:00Z had 5h of base with no possible activity -> 49% shrink instead of ~10%. Base starts there.
  // ponytail: window start = earliest Verint shift start in the roster; send it from the extension if that proves fragile.
  const starts = d.verint.filter((a) => a.paidPlan && a.shiftStart !== undefined).map((a) => a.shiftStart!);
  const from = starts.length ? Math.min(...starts) : -Infinity;
  let inMin = 0, outMin = 0, adhAgents = 0;
  const MIN = 60000;

  for (const j of joinAll(d)) {
    const a = j.agent;
    f.roster++;
    if (j.workday?.trainee) { f.trainees++; continue; } // outside shrink and attendance (scorecard SOP)
    // Unpublished schedule: the scorecard's base is the PUBLISHED schedule. Including these agents biases
    // every ratio — attendance (only the ones who show up enter), productive (hours with no schedule),
    // shrinkage (worked time as base -> 0% shrink; an assumed shift -> phantom absence). Excluded, counted.
    if ((a.scheduleState && a.scheduleState !== "published") || a.scheduledStart === undefined || a.scheduledEnd === undefined) { f.unpublished++; continue; }
    f.published++;
    const verintActive = a.shiftStart !== undefined;
    const started = verintActive || clockIn(j) !== undefined;
    if (!started && a.scheduledStart > now) { f.notYet++; continue; }
    f.due++;
    // Base = paid published minutes so far + planned time off so far (the SOP keeps planned absence in
    // the base). Fallback when the extension sends no paid detail: first-to-last event, which wrongly
    // includes unpaid lunch (11.9% of the span on the 2026-06-04 capture) — counted in spanBased.
    // Per-agent "as of": Verint counts an activity only once it closes, so for someone still working the last
    // ~15 min have no productive minutes yet. Measure them up to their last closed activity (2026-10-09 EPIC:
    // 83 of 156 agents were 15-17 min behind the capture -> 14.8% instead of 9.3%). Past 30 min of silence
    // the agent is treated as gone, and the time counts as shrink.
    // ponytail: 30-min threshold is a guess from one capture; tune if Verint's posting interval differs per tenant.
    const t = a.actualEnd !== undefined && now - a.actualEnd > 0 && now - a.actualEnd <= 30 * MIN ? a.actualEnd : now;
    if (t < now) f.lagged++;
    if (a.paidPlan) f.clippedMin += upTo(a.paidPlan, t) - upTo(a.paidPlan, t, from);
    const paid = a.paidPlan ? upTo(a.paidPlan, t, from) : Math.max(0, (Math.min(now, a.scheduledEnd) - a.scheduledStart) / MIN);
    const off = upTo(a.timeOff, t, from);
    if (!a.paidPlan) f.spanBased++;
    const elapsed = paid + off;
    f.schedMin += elapsed;
    f.timeOffMin += off;

    if (!started) {
      f.absenceMin += elapsed; // planned and unplanned absence both count as shrink
      if (j.workday?.exception || (off > 0 && paid === 0)) f.approved++; // Workday exception, or Verint time off
      else f.absent++;
      continue;
    }
    f.present++;
    f.absenceMin += off; // partial-day time off is planned absence even for someone who worked
    f.presentSchedMin += paid;
    const day = a.planned?.length && a.actual?.length ? analyzeDay(a.planned, a.actual, now) : null;
    const prod = Math.min(paid, day ? day.productiveMin : a.productiveMin ?? 0);
    f.productiveMin += prod;
    f.inShiftMin += paid - prod;
    if (verintActive) f.presentVerint++;
    else { f.presentGttOnly++; f.gttOnlyMin += paid - prod; }
    // As-of-now adherence: violations so far against scheduled time so far. (Verint's own
    // adherence minutes are against the WHOLE day's published minutes — high early in the day.)
    if (verintActive && a.ooaMinToday !== undefined) {
      outMin += Math.min(paid, a.ooaMinToday); inMin += Math.max(0, paid - a.ooaMinToday); adhAgents++;
    }
  }

  const counts = new Map<string, number>();
  for (const e of board.exceptions) {
    const k = e.kind === "ooa" ? `${e.on} instead of ${e.should}` : LABEL[e.kind];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const ranked = [...counts].sort((x, y) => y[1] - x[1]).map(([label, count]) => ({ label, count }));
  const r = (n: number) => Math.round(n);
  const expected = f.present + f.absent;

  return {
    attendance: { pct: pct(f.present, expected), present: f.present, expected, approved: f.approved, unexplained: f.absent },
    adherence: { pct: pct(inMin, inMin + outMin), inMin: r(inMin), outMin: r(outMin), agents: adhAgents },
    productive: { hours: Math.round(f.productiveMin / 6) / 10, agents: f.present, schedHours: Math.round(f.schedMin / 6) / 10 },
    violation: ranked.length ? { ...ranked[0], next: ranked.slice(1, 3) } : null,
    shrink: { pct: pct(f.absenceMin + f.inShiftMin, f.schedMin), absenceMin: r(f.absenceMin), inShiftMin: r(f.inShiftMin), schedMin: r(f.schedMin) },
    unpublished: f.unpublished,
    funnel: { ...f, schedMin: r(f.schedMin), absenceMin: r(f.absenceMin), presentSchedMin: r(f.presentSchedMin), productiveMin: r(f.productiveMin), inShiftMin: r(f.inShiftMin), gttOnlyMin: r(f.gttOnlyMin), timeOffMin: r(f.timeOffMin), clippedMin: r(f.clippedMin) },
  };
}
