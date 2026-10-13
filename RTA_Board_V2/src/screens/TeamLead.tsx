// Team Lead: "which of my people need me now?" One sentence and one button per row.
// Red = act now (Sev 1), grey = keep an eye on it (Sev 2), Sev 3 is only a count.
// Rules and routing: docs/ALERT_RULES.md. Follow-up state lives in App (shared with Floor).
import { useState } from "react";
import type { Data } from "../data/types";
import type { BoardModel, Exception, Track } from "../domain/exceptions";
import { cfgFor, escalationLevel } from "../domain/exceptions";
import { displayName, sentence } from "../domain/wording";
import { Timeline } from "./Timeline";

// ANA Bot SOP §4.1 valid reasons + the debrief's "approved, not in system"
const REASONS = ["VPN issue", "GTT glitch", "Windows glitch", "Power / internet outage", "Hardware", "Long chat / call", "Approved, not in system", "Other"];
export const LADDER = ["Team Lead", "Ops Manager", "WFM Director"];

interface Props {
  data: Data; model: BoardModel; now: number; wall: boolean;
  tl: string; tls: string[]; onTl: (tl: string) => void;
  track: Record<string, Track>; onTrack: (key: string, t: Track) => void;
}

export function TeamLead({ data, model, now, wall, tl, tls, onTl, track, onTrack }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [showMinor, setShowMinor] = useState(false);
  const mine = model.exceptions.filter((e) => e.tl === tl);
  const size = mine.length + model.teams.filter((t) => t.tl === tl).reduce((n, t) => n + (model.calm[`${t.lob}|${t.tl}`] ?? 0), 0);
  const acked = (e: Exception) => !!track[e.key]?.ackAt;
  const rows = mine.filter((e) => e.sev <= 2 || acked(e) || showMinor)
    .sort((x, y) => Number(acked(x)) - Number(acked(y)) || x.sev - y.sev || y.minutes - x.minutes);
  const minor = mine.filter((e) => e.sev === 3 && !acked(e)).length;
  const onSchedule = size - mine.filter((e) => !acked(e)).length;

  return (
    <main className="view">
      <div className="view-head">
        <h1>My team · {tl || "—"}</h1>
        <span className="count">{onSchedule} of {size} on schedule</span>
        {!wall && tls.length > 1 && (
          <select value={tl} onChange={(e) => onTl(e.target.value)} aria-label="Team Lead">
            {tls.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 && <div className="allclear">All {size} on schedule ✓</div>}
      {rows.map((e) => {
        const t = track[e.key] ?? {};
        const lvl = e.sev === 1 && !t.ackAt && t.sentAt ? escalationLevel(cfgFor(e.lob), t.sentAt, now) : 0;
        return (
          <div key={e.key}>
            <div className={`alert ${t.ackAt ? "done" : e.sev === 1 ? "red" : ""}`}>
              <button className="what" onClick={() => setOpen(open === e.key ? null : e.key)} title="Show planned vs actual">
                <b>{displayName(e.agent)}</b> {sentence(e)}
              </button>
              <span className="for">{e.kind === "no-show" ? "missed shift" : `${e.minutes} min`}</span>
              {t.ackAt ? <span className="done-lbl">✓ On it{t.reason ? ` · ${t.reason}` : ""}</span>
                : !wall && <button className="primary" onClick={() => onTrack(e.key, { ackAt: Date.now() })}>On it</button>}
              {lvl > 0 && <span className="esc">Not acknowledged — escalated to {LADDER[lvl]}</span>}
              {t.ackAt && t.reason === undefined && !wall && (
                <div className="reasons">
                  <span className="muted">Why? (optional)</span>
                  {REASONS.map((r) => <button key={r} onClick={() => onTrack(e.key, { reason: r })}>{r}</button>)}
                  <button onClick={() => onTrack(e.key, { reason: "" })}>Skip</button>
                </div>
              )}
            </div>
            {open === e.key && (() => { const a = data.verint.find((v) => v.name === e.agent); return a ? <Timeline agent={a} now={now} /> : null; })()}
          </div>
        );
      })}
      {minor > 0 && !showMinor && (
        <p className="minor">+{minor} minor (under 15 min) · <button onClick={() => setShowMinor(true)}>show</button></p>
      )}
    </main>
  );
}
