// Planned vs actual, one lane each, plus a third lane that is ONLY the time out
// of adherence. Reads left to right across the scheduled shift; the line is "now".
import type { Segment, VerintAgent } from "../data/types";
import { analyzeDay } from "../domain/timeline";

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

function Lane({ name, segs, t0, span, cls }: { name: string; segs: Array<Pick<Segment, "start" | "end"> & { label: string; work?: boolean }>; t0: number; span: number; cls: (s: { work?: boolean }) => string }) {
  return (
    <div className="lane">
      <span className="lane-name">{name}</span>
      <div className="lane-track">
        {segs.map((s, i) => (
          <div key={i} className={`seg ${cls(s)}`} style={{ left: `${((s.start - t0) / span) * 100}%`, width: `${((s.end - s.start) / span) * 100}%` }}
            title={`${s.label} ${hhmm(s.start)}–${hhmm(s.end)}`}>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Timeline({ agent, now }: { agent: VerintAgent; now: number }) {
  const planned = agent.planned ?? [];
  if (!planned.length) return <div className="timeline muted">No schedule segments captured for this agent.</div>;
  const actual = agent.actual ?? [];
  const t0 = Math.min(...planned.map((s) => s.start));
  const t1 = Math.max(...planned.map((s) => s.end));
  const span = t1 - t0;
  const d = analyzeDay(planned, actual, now);
  const pct = d.plannedWorkMin ? Math.round((100 * d.productiveMin) / d.plannedWorkMin) : 100;
  const hours = Array.from({ length: Math.floor(span / 3600000) + 1 }, (_, i) => t0 + i * 3600000);

  return (
    <div className="timeline">
      <div className="axis">
        {hours.map((h) => <span key={h} style={{ left: `${((h - t0) / span) * 100}%` }}>{hhmm(h)}</span>)}
      </div>
      <div className="lanes">
        <Lane name="Planned" segs={planned} t0={t0} span={span} cls={(s) => (s.work ? "work" : "off")} />
        <Lane name="Actual" segs={actual} t0={t0} span={span} cls={(s) => (s.work ? "work" : "off")} />
        <Lane name="Out of adherence" segs={d.ooa.map((o) => ({ start: o.start, end: o.end, label: `${o.actual} (planned ${o.planned})` }))} t0={t0} span={span} cls={() => "ooa"} />
        <div className="now" style={{ left: `${((Math.min(now, t1) - t0) / span) * 100}%` }} />
      </div>
      <div className="sums">
        <span>Scheduled work so far <b>{(d.plannedWorkMin / 60).toFixed(1)}h</b></span>
        <span className="bad">Out of adherence <b>{d.ooaMin}m</b></span>
        <span className="ok">Productive <b>{(d.productiveMin / 60).toFixed(1)}h</b> ({pct}%)</span>
      </div>
    </div>
  );
}
