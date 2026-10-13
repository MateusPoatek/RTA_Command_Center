// Headline numbers "as of now", plus how old each source's data is. The
// numbers are only as fresh as the oldest source that feeds them.
import type { Funnel, Kpis } from "../domain/kpis";

export interface Freshness { src: "Verint" | "GTT" | "Workday"; text: string; ageMin?: number }

const SRC_CLS = { GTT: "g", Verint: "v", Workday: "w" } as const;
const n = (v: number | null, unit = "%") => (v === null ? "—" : `${v}${unit}`);
const ageCls = (m?: number) => (m === undefined ? "muted" : m <= 5 ? "ok" : m <= 15 ? "mid" : "bad");

export function KpiStrip({ k, now, fresh }: { k: Kpis; now: number; fresh: Freshness[] }) {
  const hhmm = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="kpis" aria-label="Headline numbers">
      <div className="asof">
        <b>As of {hhmm}</b>
        {fresh.map((f) => (
          <span key={f.src} className="fresh">
            <i className={`chip ${SRC_CLS[f.src]}`}>{f.src}</i>{" "}
            <span className={ageCls(f.ageMin)}>{f.text}</span>
          </span>
        ))}
        {k.unpublished > 0 && (
          <span className="mid" title="No published Verint schedule, so there is no base to measure attendance, productive time or shrinkage against. Filter them in Data checks.">
            {k.unpublished} agent(s) with unpublished schedule excluded from these numbers
          </span>
        )}
      </div>
      <div className="tiles">
        <div className="tile" title="Present ÷ agents expected so far (shift started; approved absences excluded). Present = GTT clock-in or Verint activity.">
          <span className="lbl">Attendance</span>
          <span className="num">{n(k.attendance.pct)}</span>
          <span className="sub">{k.attendance.present} of {k.attendance.expected} present · {k.attendance.unexplained} unexplained · {k.attendance.approved} approved off</span>
        </div>
        <div className="tile" title="Σ minutes in adherence ÷ Σ minutes scheduled so far (Verint adherenceSummary), time-weighted across agents.">
          <span className="lbl">Adherence</span>
          <span className="num">{n(k.adherence.pct)}</span>
          <span className="sub">{k.adherence.outMin} min out of adherence · {k.adherence.agents} agents</span>
        </div>
        <div className="tile" title="Σ productive minutes so far: scheduled work done in adherence (planned ∩ actual), or Verint paid minutes when segments are not captured.">
          <span className="lbl">Productive hours</span>
          <span className="num">{k.productive.hours}h</span>
          <span className="sub">of {k.productive.schedHours}h scheduled so far · {k.productive.agents} agents</span>
        </div>
        <div className="tile" title="The most frequent active exception on the board right now.">
          <span className="lbl">Most common violation</span>
          <span className="num word">{k.violation ? k.violation.label : "None"}</span>
          <span className="sub">{k.violation ? `${k.violation.count} agent(s)${k.violation.next.length ? " · then " + k.violation.next.map((v) => `${v.label} (${v.count})`).join(", ") : ""}` : "No active exceptions"}</span>
        </div>
        <div className="tile" title="(absence minutes + in-shift non-productive minutes) ÷ scheduled minutes so far. Approximates the scorecard's Total Shrink; the billable / non-billable split needs the contract rules.">
          <span className="lbl">Shrinkage</span>
          <span className="num">{n(k.shrink.pct)}</span>
          <span className="sub">absence {k.shrink.absenceMin} min · in-shift {k.shrink.inShiftMin} min · of {k.shrink.schedMin} min</span>
        </div>
      </div>
      <FunnelPanel f={k.funnel} shrink={k.shrink.pct} />
    </section>
  );
}

/** Floor: the headline numbers on one line; a source is mentioned only when it is late or missing. */
export function KpiLine({ k, asOf, fresh }: { k: Kpis; asOf: number; fresh: Freshness[] }) {
  const late = fresh.filter((f) => f.ageMin === undefined ? !/sample|not connected|none/.test(f.text) : f.ageMin > 15);
  return (
    <div className="kpiline" title="Details tab: how each number is calculated">
      <b>As of {new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
      <span>Attendance <b>{n(k.attendance.pct)}</b></span>
      <span>Adherence <b>{n(k.adherence.pct)}</b></span>
      <span>Shrinkage <b>{n(k.shrink.pct)}</b></span>
      <span>Productive <b>{k.productive.hours}h</b></span>
      {late.map((f) => <span key={f.src} className="stale">{f.src}: {f.text}</span>)}
    </div>
  );
}

const share = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

function FunnelPanel({ f, shrink }: { f: Funnel; shrink: number | null }) {
  const people: Array<[string, number, string]> = [
    ["In the Verint roster", f.roster, `${f.trainees} trainee(s) excluded`],
    ["With a published schedule today", f.published, `${f.unpublished} with no published schedule (day off, or draft only), excluded`],
    ["Shift started by now", f.due, `${f.notYet} start later today`],
    ["Presenting activity", f.present, `${f.presentVerint} in Verint · ${f.presentGttOnly} GTT clock-in only · ${f.absent} absent · ${f.approved} approved off`],
  ];
  const mins: Array<[string, number, string]> = [
    ["Published minutes so far (base)", f.schedMin, f.spanBased ? `${f.spanBased} agent(s) on first-to-last approximation` : "paid published minutes + planned time off"],
    ["− Absence (no activity, or time off)", f.absenceMin, `${share(f.absenceMin, f.schedMin)} · of which planned time off ${f.timeOffMin.toLocaleString()}`],
    ["= Scheduled minutes of present agents", f.presentSchedMin, share(f.presentSchedMin, f.schedMin)],
    ["− Productive minutes", f.productiveMin, share(f.productiveMin, f.schedMin)],
    ["= Non-productive minutes in shift", f.inShiftMin, share(f.inShiftMin, f.schedMin)],
  ];
  return (
    <details className="funnel">
      <summary>Shrinkage breakdown: roster → schedule → presence → productive hours</summary>
      <div className="fun-grid">
        <div>
          <h4>People</h4>
          {people.map(([l, n, note]) => (
            <div key={l} className="fun-row">
              <span className="fun-bar" style={{ width: `${f.roster ? (100 * n) / f.roster : 0}%` }} />
              <span className="fun-lbl">{l}</span><b>{n}</b><span className="muted small">{note}</span>
            </div>
          ))}
        </div>
        <div>
          <h4>Minutes</h4>
          <table className="fun-min"><tbody>
            {mins.map(([l, n, note]) => <tr key={l}><td>{l}</td><td className="num">{n.toLocaleString()}</td><td className="muted">{note}</td></tr>)}
            <tr className="total"><td>Shrinkage = (absence + non-productive) ÷ base</td><td className="num">{shrink ?? "—"}%</td><td /></tr>
          </tbody></table>
        </div>
      </div>
      <ul className="caveats">
        {f.presentGttOnly > 0 && <li className="bad"><b>{f.presentGttOnly} agent(s) are clocked in on GTT but have no Verint activity.</b> All {f.gttOnlyMin.toLocaleString()} of their minutes ({share(f.gttOnlyMin, f.schedMin)} of the base) count as shrink. If the Verint capture is missing the actual-activity timeline, this is an artifact, not real shrink.</li>}
        {f.lagged > 0 && <li><b>{f.lagged} agent(s) are measured up to their last closed Verint activity</b>, not the capture time. Verint counts an activity only once it ends (in blocks of about 15 min), so their current activity is not in productive minutes yet. Agents silent for more than 30 min count as shrink.</li>}
        {f.clippedMin > 0 && <li><b>{f.clippedMin.toLocaleString()} published minutes before Verint's capture window are left out of the base</b> (overnight shifts that began before the Verint day). Verint has no activity for them, so counting them would show as phantom shrink.</li>}
        {f.spanBased > 0 && <li><b>{f.spanBased} agent(s) have no paid-schedule detail</b>, so their base runs from the first to the last published event and includes unpaid lunch. That overstates shrinkage by about the unpaid share (11.9% of the shift span in the June capture). Update the extension and re-capture to remove it.</li>}
        <li><b>Productive = Verint paid minutes</b> on live data. They include paid breaks, which understates shrinkage until the contract's productive definition is agreed.</li>
        <li>Agents with an unpublished schedule ({f.unpublished}) are left out of both sides of the ratio.</li>
      </ul>
    </details>
  );
}
