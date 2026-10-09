// Planned-vs-actual analysis for one agent's day. Slices time at every segment
// boundary and compares what the schedule said with what the agent did:
//   same activity            -> in adherence (and productive if the activity is work)
//   different / no activity  -> out of adherence
// Productive = minutes in adherence on a work activity, so out-of-adherence time
// is what separates scheduled-work hours from productive hours.
// ponytail: "work" is Verint's isWork flag; the contractual productive definition
// (paid vs work, [02] §11.2 open item) is a one-line change here.
import type { Segment } from "../data/types";

export interface OoaSpan { start: number; end: number; planned: string; actual: string }
export interface DayAnalysis {
  plannedWorkMin: number; // scheduled work minutes elapsed so far
  productiveMin: number;
  ooaMin: number;
  ooa: OoaSpan[];
}

const MIN = 60000;
const at = (segs: Segment[], t: number) => segs.find((s) => s.start <= t && t < s.end);

export function analyzeDay(planned: Segment[], actual: Segment[], now: number): DayAnalysis {
  const out: DayAnalysis = { plannedWorkMin: 0, productiveMin: 0, ooaMin: 0, ooa: [] };
  if (!planned.length) return out;
  const from = Math.min(...planned.map((s) => s.start));
  const to = Math.min(now, Math.max(...planned.map((s) => s.end)));
  const cuts = [...new Set([from, to, ...[...planned, ...actual].flatMap((s) => [s.start, s.end]).filter((t) => t > from && t < to)])].sort((a, b) => a - b);

  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const p = at(planned, a);
    if (!p) continue;
    const q = at(actual, a);
    const mins = (b - a) / MIN;
    if (p.work) out.plannedWorkMin += mins;
    if (q && q.label === p.label) {
      if (p.work) out.productiveMin += mins;
      continue;
    }
    out.ooaMin += mins;
    const label = q?.label ?? "Not logged in";
    const prev = out.ooa[out.ooa.length - 1];
    if (prev && prev.end === a && prev.planned === p.label && prev.actual === label) prev.end = b;
    else out.ooa.push({ start: a, end: b, planned: p.label, actual: label });
  }
  const r = (n: number) => Math.round(n * 10) / 10;
  return { ...out, plannedWorkMin: r(out.plannedWorkMin), productiveMin: r(out.productiveMin), ooaMin: r(out.ooaMin) };
}
