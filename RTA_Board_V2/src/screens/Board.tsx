// Airport-departures-style board (layout borrowed from command-center's Board):
// one ranked row per agent in trouble — SEV | AGENT | DOING → SHOULD | FOR | STATUS.
// Rules and routing: docs/ALERT_RULES.md. Sev 1 goes to the TL automatically and
// climbs the escalation ladder if unacknowledged; Sev 2 rides the TL's digest;
// Sev 3 is board only. A LOB incident replaces its members' direct alerts.
// State is in-memory. ponytail: swap notify/ack for Chat delivery + an ack endpoint.
import { useEffect, useMemo, useState } from "react";
import type { Data } from "../data/types";
import { buildBoard, cfgFor, escalationLevel } from "../domain/exceptions";
import type { Exception, Kind } from "../domain/exceptions";
import { Timeline } from "./Timeline";

// ANA Bot SOP §4.1 valid reasons + the debrief's "approved, not in system"
const REASONS = ["VPN issue", "GTT glitch", "Windows glitch", "Power / internet outage", "Hardware", "Long chat / call", "Approved, not in system", "Other"];
const KIND: Record<Kind, string> = { "no-clock-in": "NOT CLOCKED IN", ooa: "OUT OF ADHERENCE", "break-overrun": "BREAK OVERRUN", "no-clock-out": "NOT CLOCKED OUT" };
const LADDER = ["TL", "Ops Manager", "WFM Director"];
type Track = { sentAt?: number; ackAt?: number; reason?: string };

export function Board({ data, now, wall }: { data: Data; now: number; wall: boolean }) {
  const [outage, setOutage] = useState<Set<string>>(new Set());
  const model = useMemo(() => buildBoard(data, now, outage), [data, now, outage]);
  const [role, setRole] = useState<"rta" | "tl">("rta");
  const tls = [...new Set(model.teams.map((t) => t.tl))];
  const [tl, setTl] = useState(tls[0] ?? "");
  const [track, setTrack] = useState<Record<string, Track>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const set = (k: string, p: Track) => setTrack((t) => ({ ...t, [k]: { ...t[k], ...p } }));

  // Sev 1 (outside an incident) is sent to the TL the moment it appears — no manual "Notify".
  const direct = model.exceptions.filter((e) => e.sev === 1 && !e.incident);
  useEffect(() => {
    const fresh = direct.filter((e) => !track[e.key]?.sentAt).map((e) => e.key);
    if (fresh.length) setTrack((t) => Object.fromEntries([...Object.entries(t), ...fresh.map((k) => [k, { ...t[k], sentAt: Date.now() }])]));
  }, [direct.map((e) => e.key).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const teams = model.teams.filter((t) => role === "rta" || t.tl === tl);
  const bySev = (s: number) => model.exceptions.filter((e) => e.sev === s).length;

  const status = (e: Exception) => {
    const t = track[e.key] ?? {};
    if (e.incident) return { text: "In LOB incident", cls: "muted" };
    if (e.sev === 3) return { text: "Board only", cls: "muted" };
    if (e.sev === 2) return { text: "In TL digest", cls: "muted" };
    if (t.ackAt) return { text: `ACK ✓ ${t.reason}`, cls: "ok" };
    if (!t.sentAt) return { text: "Sending…", cls: "wait" };
    const lvl = escalationLevel(cfgFor(e.lob), t.sentAt, now);
    if (lvl) return { text: `NO ACK → ${LADDER[lvl]}`, cls: "esc" };
    return { text: `Sent to TL ${Math.max(0, Math.round((now - t.sentAt) / 60000))}m ago`, cls: "wait" };
  };

  const action = (e: Exception) => {
    const st = status(e);
    const label = <span className={`st ${st.cls}`}>{st.text}</span>;
    const t = track[e.key] ?? {};
    if (wall || role === "rta" || e.sev !== 1 || e.incident || t.ackAt || !t.sentAt) return label;
    return (
      <span className="ack">
        {st.cls === "esc" && label}
        <select value={reason[e.key] ?? ""} onChange={(ev) => setReason((r) => ({ ...r, [e.key]: ev.target.value }))}>
          <option value="">Reason…</option>
          {REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <button disabled={!reason[e.key]} onClick={() => set(e.key, { ackAt: Date.now(), reason: reason[e.key] })}>Acknowledge</button>
      </span>
    );
  };

  return (
    <main className="board">
      <div className="bar">
        <div className="roles">
          <button className={role === "rta" ? "on" : ""} onClick={() => setRole("rta")}>RTA</button>
          <button className={role === "tl" ? "on" : ""} onClick={() => setRole("tl")}>Team Lead</button>
          {role === "tl" && (
            <select value={tl} onChange={(e) => setTl(e.target.value)}>
              {tls.map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
        </div>
        <div className="counts">
          <span className="c-crit">{bySev(1)} Sev 1</span>
          <span className="c-warn">{bySev(2)} Sev 2</span>
          <span className="muted">{bySev(3)} Sev 3</span>
          <span className="muted" title={model.suppressed.map((s) => `${s.agent}: ${s.reason}`).join("\n")}>{model.suppressed.length} suppressed</span>
          {model.unmapped.length > 0 && (
            <span className="dq" title={model.unmapped.map((u) => `${u.agent}: ${u.label}`).join("\n") + "\n→ WFM: add to the activity map"}>
              {model.unmapped.length} unmapped activity → WFM
            </span>
          )}
        </div>
      </div>

      {model.incidents.map((i) => (
        <div key={i.lob} className="incident">
          <b>LOB INCIDENT</b> {i.lob} — {i.agents} of {i.of} agents at Sev 1–2 at once. One alert to the LOB's TLs + Ops Manager instead of {i.agents}.
          {!wall && role === "rta" && <button onClick={() => setOutage((s) => new Set(s).add(i.lob))}>Declare known outage</button>}
        </div>
      ))}
      {[...outage].map((lob) => (
        <div key={lob} className="incident quiet">
          Known outage declared for <b>{lob}</b> — its agents are suppressed.
          {!wall && <button onClick={() => setOutage((s) => { const n = new Set(s); n.delete(lob); return n; })}>Clear</button>}
        </div>
      ))}

      {teams.map((t) => {
        const rows = model.exceptions
          .filter((e) => e.lob === t.lob && e.tl === t.tl)
          .sort((x, y) => Number(!!track[x.key]?.ackAt) - Number(!!track[y.key]?.ackAt)); // acked rows sink
        const digest = rows.filter((e) => e.sev === 2 && !e.incident);
        const calm = model.calm[`${t.lob}|${t.tl}`] ?? 0;
        return (
          <section key={`${t.lob}|${t.tl}`} className="team">
            <h2>
              {t.lob} <span className="tl">· {t.tl}</span>
              <span className="calm">{calm} on schedule</span>
            </h2>
            {digest.length > 0 && (
              <div className="digest">TL digest: {digest.length} of your agents need attention · longest {Math.max(...digest.map((e) => e.minutes))}m</div>
            )}
            {rows.length === 0 ? <div className="clear">All clear</div> : (
              <div className="row head"><span>Sev</span><span>Agent</span><span>Doing → Should</span><span>For</span><span>Status</span></div>
            )}
            {rows.map((e) => (
              <div key={e.key}>
                <div className={`row s${e.sev}${track[e.key]?.ackAt ? " acked" : ""}`}>
                  <span className="sev">SEV {e.sev}</span>
                  <button className="who link" onClick={() => setOpen(open === e.key ? null : e.key)} title="Planned vs actual">
                    {open === e.key ? "▾" : "▸"} {e.agent}
                    <small>{KIND[e.kind]}{e.repeat ? ` · ${e.repeat}× today` : ""}{e.also.length ? ` · +${e.also.map((k) => KIND[k].toLowerCase()).join(", ")}` : ""}</small>
                  </button>
                  <span className="doing"><span className="on" title="Doing now">{e.on}</span> → <span className="should" title="Scheduled">{e.should}</span></span>
                  <span className="mins">{e.minutes}m</span>
                  <span className="act">{action(e)}</span>
                </div>
                {open === e.key && (() => { const a = data.verint.find((v) => v.name === e.agent); return a ? <Timeline agent={a} now={now} /> : null; })()}
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
