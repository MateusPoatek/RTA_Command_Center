// Floor (RTA): "where is it burning, and which Team Lead hasn't acted?" One row per TL,
// worst first; a row opens that TL's own screen, so there is only one layout to learn.
import type { BoardModel, Track } from "../domain/exceptions";
import { summarizeTeams } from "../domain/exceptions";
import type { Kpis } from "../domain/kpis";
import { lobLabel } from "../domain/wording";
import type { Freshness } from "./Kpis";
import { KpiLine } from "./Kpis";
import { LADDER } from "../domain/exceptions";

interface Props {
  model: BoardModel; now: number; asOf: number; kpis: Kpis; fresh: Freshness[]; wall: boolean;
  track: Record<string, Track>; outage: ReadonlySet<string>;
  onOutage: (lob: string, on: boolean) => void; onOpen: (tl: string) => void;
}

const STATE = { "not-seen": "Not seen yet", watching: "Watching", "on-it": "On it ✓", clear: "" } as const;

export function Floor({ model, now, asOf, kpis, fresh, wall, track, outage, onOutage, onOpen }: Props) {
  const teams = summarizeTeams(model, track, now);
  const busy = teams.filter((t) => t.state !== "clear");
  const calm = teams.length - busy.length;
  return (
    <main className="view">
      <KpiLine k={kpis} asOf={asOf} fresh={fresh} />
      {model.incidents.map((i) => (
        <div key={i.lob} className="incident">
          <span><b>{lobLabel(i.lob)}</b>: {i.agents} of {i.of} agents off schedule at the same time. Outage?</span>
          {!wall && <button onClick={() => onOutage(i.lob, true)}>Yes, outage</button>}
        </div>
      ))}
      {[...outage].map((lob) => (
        <div key={lob} className="incident quiet">
          <span>Outage declared for <b>{lobLabel(lob)}</b>: its agents are not alerted.</span>
          {!wall && <button onClick={() => onOutage(lob, false)}>Clear</button>}
        </div>
      ))}

      {!teams.length && <p className="muted">No agents yet.</p>}
      {busy.map((t) => (
        <button key={`${t.lob}|${t.tl}`} className={`teamrow ${t.state}`} onClick={() => onOpen(t.tl)} disabled={wall}>
          <b>{t.tl}</b>
          <span className="lob">{lobLabel(t.lob)}</span>
          <span>{t.red + t.grey ? `${t.red + t.grey} need action` : `${t.acked} handled`}{t.minor ? <span className="muted"> · +{t.minor} minor</span> : null}</span>
          <span>{t.oldest ? `oldest ${t.oldest} min` : ""}</span>
          <span className="state">{t.state === "escalated" ? `Escalated → ${LADDER[t.level]}` : STATE[t.state]}</span>
          <span className="go">›</span>
        </button>
      ))}
      {calm > 0 && <p className="calmline">✓ {busy.length ? `${calm} other team(s)` : `All ${calm} team(s)`} on schedule</p>}

      <div className="foot">
        {model.suppressed.length > 0 && <span title={model.suppressed.map((s) => s.reason).join("\n")}>{model.suppressed.length} not alerted (trainee, approved absence or outage)</span>}
        {model.unmapped.length > 0 && <span title={[...new Set(model.unmapped.map((u) => u.label))].join("\n")}>{new Set(model.unmapped.map((u) => u.label)).size} Verint activity name(s) not in the activity map → WFM</span>}
      </div>
    </main>
  );
}
