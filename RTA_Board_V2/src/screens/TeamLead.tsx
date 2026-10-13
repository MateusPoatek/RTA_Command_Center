// Team Lead: "which of my people need me now?" One sentence and one button per row.
// Red = act now (Sev 1), grey = keep an eye on it (Sev 2), Sev 3 is only a count.
// Rules and routing: docs/ALERT_RULES.md. Follow-up state lives in App (shared with Floor).
import { useEffect, useState } from "react";
import type { Data } from "../data/types";
import type { BoardModel, Exception, Track } from "../domain/exceptions";
import { LADDER, cfgFor, escalationLevel } from "../domain/exceptions";
import { tlLabel } from "../alerts/chat";
import { displayName, sentence } from "../domain/wording";
import { Timeline } from "./Timeline";

// ANA Bot SOP §4.1 valid reasons + the debrief's "approved, not in system"
const REASONS = ["VPN issue", "GTT glitch", "Windows glitch", "Power / internet outage", "Hardware", "Long chat / call", "Approved, not in system", "Other"];
const UNASSIGNED = "Unassigned";
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface Props {
  data: Data; model: BoardModel; now: number; wall: boolean;
  tl: string; tls: string[]; onTl: (tl: string) => void;
  track: Record<string, Track>; onTrack: (key: string, t: Track) => void;
  chatOn: boolean;
}

export function TeamLead({ data, model, now, wall, tl, tls, onTl, track, onTrack, chatOn }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [showMinor, setShowMinor] = useState(false);
  const [toast, setToast] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  const acked = (e: Exception) => !!track[e.key]?.ackAt;
  const needs = (t: string) => model.exceptions.filter((e) => e.tl === t && e.sev <= 2 && !acked(e)).length;
  // Real TLs first, most urgent first; "no TL found" last, it is the RTA's queue, not a team.
  const ordered = [...tls].sort((a, b) => Number(a === UNASSIGNED) - Number(b === UNASSIGNED) || needs(b) - needs(a) || a.localeCompare(b));
  const optionLabel = (t: string) => `${t === UNASSIGNED ? "No Team Lead found" : t} — ${needs(t) ? `${needs(t)} need attention` : "all clear"}`;

  if (!tl) {
    return (
      <main className="view">
        <div className="view-head"><h1>Who are you?</h1><span className="count">Pick your name to see only your team's alerts.</span></div>
        <div className="pick">
          {ordered.map((t) => (
            <button key={t} className={t === UNASSIGNED ? "pick-rta" : ""} onClick={() => onTl(t)}>
              <b>{t === UNASSIGNED ? "No Team Lead found (RTA queue)" : t}</b>
              <span className={needs(t) ? "bad" : "ok"}>{needs(t) ? `${needs(t)} need attention` : "all clear"}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const mine = model.exceptions.filter((e) => e.tl === tl);
  const size = mine.length + model.teams.filter((t) => t.tl === tl).reduce((n, t) => n + (model.calm[`${t.lob}|${t.tl}`] ?? 0), 0);
  const rows = mine.filter((e) => e.sev <= 2 || acked(e) || showMinor)
    .sort((x, y) => Number(acked(x)) - Number(acked(y)) || x.sev - y.sev || y.minutes - x.minutes);
  const minor = mine.filter((e) => e.sev === 3 && !acked(e)).length;
  const onSchedule = size - mine.filter((e) => !acked(e)).length;
  const who = tlLabel(tl);

  const onIt = (e: Exception) => {
    onTrack(e.key, { ackAt: Date.now(), ackBy: who });
    const t = track[e.key];
    const lvl = t?.sentAt ? escalationLevel(cfgFor(e.lob), t.sentAt, now) : 0;
    const stopped = e.sev === 1 && cfgFor(e.lob).escalation ? (lvl < 2 ? ` Escalation to ${LADDER[lvl + 1]} stopped.` : "") : "";
    setToast({ key: e.key, text: `✓ ${who} is on it: ${displayName(e.agent)}.${stopped} The Floor now shows this alert as handled.` });
  };

  return (
    <main className="view">
      <div className="view-head">
        <h1>{tl === UNASSIGNED ? "No Team Lead found" : `${tl}'s team`}</h1>
        <span className="count">{onSchedule} of {size} on schedule</span>
        {!wall && (
          <label className="viewing">Viewing as
            <select value={tl} onChange={(e) => onTl(e.target.value)} aria-label="Team Lead">
              {ordered.map((t) => <option key={t} value={t}>{optionLabel(t)}</option>)}
            </select>
          </label>
        )}
      </div>
      {tl === UNASSIGNED ? (
        <p className="legend">These agents have no Team Lead on file: the TL comes from GTT, and they have no GTT record in the last 3 days. <b>RTA: route each one to its TL</b>, or press <b>On it</b> to handle it yourself.</p>
      ) : !wall && (
        <p className="legend"><b>On it</b> = "I'm handling this". It stops the escalation to the Ops Manager and shows the alert as handled on the Floor. It does not message anyone.</p>
      )}

      {rows.length === 0 && <div className="allclear">All {size} on schedule ✓</div>}
      {rows.map((e) => {
        const t = track[e.key] ?? {};
        const cfg = cfgFor(e.lob);
        const lvl = e.sev === 1 && !t.ackAt && t.sentAt ? escalationLevel(cfg, t.sentAt, now) : 0;
        const left = e.sev === 1 && cfg.escalation && t.sentAt && !t.ackAt && lvl === 0 ? Math.max(1, Math.ceil(cfg.ackSlaMin - (now - t.sentAt) / 60000)) : null;
        return (
          <div key={e.key}>
            <div className={`alert ${t.ackAt ? "done" : e.sev === 1 ? "red" : ""}`}>
              <button className="what" onClick={() => setOpen(open === e.key ? null : e.key)} title="Show planned vs actual">
                <b>{displayName(e.agent)}</b> {sentence(e)}
              </button>
              <span className="for">{e.kind === "no-show" ? "missed shift" : `${e.minutes} min`}</span>
              {t.ackAt ? <span className="done-lbl">✓ On it</span>
                : !wall && <button className="primary" onClick={() => onIt(e)} title={`Tell the floor ${who} is handling this`}>On it</button>}
              <span className="delivery">
                {t.ackAt ? <>✓ <b>{t.ackBy ?? who}</b> is on it since {hhmm(t.ackAt)}{t.reason ? ` · ${t.reason}` : ""}{e.sev === 1 ? " · escalation stopped" : ""}</>
                  : <>
                      For <b>{who}</b> · {t.chatAt ? `posted to Google Chat at ${hhmm(t.chatAt)}` : chatOn && e.sev === 1 ? "on the board (older alerts are not posted to Chat)" : "on this board only"}
                      {left !== null && <> · <span className="mid">escalates to {LADDER[1]} in {left} min unless someone presses On it</span></>}
                    </>}
              </span>
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
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          <button onClick={() => { onTrack(toast.key, { ackAt: undefined, ackBy: undefined, reason: undefined }); setToast(null); }}>Undo</button>
        </div>
      )}
    </main>
  );
}
