import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeFixtures } from "./data/fixtures";
import { bridgeSend, useBridge } from "./data/bridge";
import type { RosterRow } from "./data/bridge";
import { PILOT, fetchGtt } from "./data/accounts";
import type { Data, GttEvent, VerintAgent } from "./data/types";
import { buildBoard } from "./domain/exceptions";
import { computeKpis } from "./domain/kpis";
import { joinAll } from "./domain/join";
import { KpiStrip } from "./screens/Kpis";
import type { Freshness } from "./screens/Kpis";
import { TeamLead } from "./screens/TeamLead";
import { Floor } from "./screens/Floor";
import type { Track } from "./domain/exceptions";
import { Report } from "./screens/Report";
import { Sources } from "./screens/Sources";
import { Reports } from "./screens/Reports";
import { useReports } from "./reports/useReports";
import { buildAdherenceSummary } from "./reports/adherenceSummary";
import { CHAT_FRESH_MIN, alertCard, chatDue, digestCard, dispatch, escalationCard } from "./alerts/chat";
import type { ChatResult } from "./alerts/chat";

const GTT_POLL_MS = 5 * 60000;
type Gtt = { state: "off" } | { state: "loading" } | { state: "error"; error: string } | { state: "live"; events: GttEvent[]; totalRows: number; at: number };

export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [fixtures] = useState<Data>(() => makeFixtures(Date.now()));
  const [live, setLive] = useState<VerintAgent[] | null>(null);
  const [screen, setScreen] = useState<"team" | "floor" | "reports" | "details">("floor");
  const [detail, setDetail] = useState<"numbers" | "checks" | "sources" | "capture">("numbers");
  const [track, setTrack] = useState<Record<string, Track>>({});
  const [outage, setOutage] = useState<Set<string>>(new Set());
  const [tl, setTlState] = useState(() => { try { return localStorage.getItem("rta.tl") ?? ""; } catch { return ""; } });
  const setTl = (t: string) => { setTlState(t); try { localStorage.setItem("rta.tl", t); } catch { /* private window */ } };
  const [wall, setWall] = useState(false);
  const [accountId, setAccountId] = useState("DEMO");
  const [gtt, setGtt] = useState<Gtt>({ state: "off" });
  const [directory, setDirectory] = useState<NonNullable<Data["directory"]>>([]);
  // Google Chat is opt-in per account: a board left open should not post to a client's space by surprise.
  const chatKey = `rta.chat.${accountId}`;
  const [chatOn, setChatOnState] = useState(false);
  useEffect(() => { try { setChatOnState(localStorage.getItem(chatKey) === "on"); } catch { setChatOnState(false); } }, [chatKey]);
  const setChatOn = (on: boolean) => { setChatOnState(on); try { localStorage.setItem(chatKey, on ? "on" : "off"); } catch { /* private window */ } };
  const account = PILOT.find((a) => a.id === accountId);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const [raw, setRaw] = useState<{ rows: RosterRow[]; at: number } | null>(null);
  const [snap, setSnap] = useState<{ at: number; file: string } | { error: string } | null>(null);
  useBridge(useCallback((agents: VerintAgent[], rows: RosterRow[], at: number) => { setLive(agents); setRaw({ rows, at }); }, []));

  // The extension accumulates and only pushes when asked (autoPush is off by default), so:
  // switch its capture LOB, ask the Verint tab to re-read, then keep asking for a push.
  // ponytail: 30 s poll; drop it if the extension gains a "page subscribed" push.
  useEffect(() => {
    if (!account) return;
    bridgeSend("set-lob", { lob: account.id });
    bridgeSend("trigger-capture");
    const id = setInterval(() => bridgeSend("push-now"), 30000);
    const first = setTimeout(() => bridgeSend("push-now"), 3000);
    return () => { clearInterval(id); clearTimeout(first); };
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Account switch: tell the extension which LOB to capture, drop the old roster, fetch real GTT.
  useEffect(() => {
    setLive(null);
    setTrack({});
    setOutage(new Set());
    setDirectory([]);
    if (!account) return setGtt({ state: "off" });
    if (!account.gttFunctionalArea) return setGtt({ state: "off" });
    let stop = false;
    setGtt({ state: "loading" }); // never show the previous account's GTT while this one loads
    const load = () => {
      fetchGtt(account, Date.now())
        .then((r) => !stop && setGtt({ state: "live", ...r, at: Date.now() }))
        .catch((e: Error) => !stop && setGtt({ state: "error", error: e.message }));
    };
    load();
    // TL directory: the last 3 days of GTT (once per account), so agents who have not clocked in today still have a TL.
    Promise.all([1, 2, 3].map((k) => fetchGtt(account, Date.now() - k * 86400000).then((r) => r.events).catch(() => [])))
      .then((days) => { if (stop) return; const by = new Map(days.flat().map((e) => [e.workdayId, { workdayId: e.workdayId, employee: e.employee, supervisor: e.supervisor }])); setDirectory([...by.values()].filter((e) => e.supervisor)); });
    const id = setInterval(load, GTT_POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo = fixtures. A pilot account = real sources only: the extension's roster for THIS account
  // (rows tagged with another LOB are dropped), real GTT, and no Workday until Kraken access lands.
  const roster = useMemo(() => (live ?? []).filter((a) => a.lob.split(" - ")[0] === accountId), [live, accountId]);
  // Verint orgs that do not name this account (the June "EPIC" capture had a Ludia and a Walmart agent).
  // ponytail: name match on the account's first word; map account -> Verint org ids if that misfires.
  const foreign = useMemo(() => {
    const key = (accountId.split("_")[0] ?? "").toLowerCase();
    const n = new Map<string, number>();
    for (const r of raw?.rows ?? []) if (r.lob === accountId && r.organization && !r.organization.toLowerCase().replace(/\s/g, "").includes(key)) n.set(r.organization, (n.get(r.organization) ?? 0) + 1);
    return [...n];
  }, [raw, accountId]);
  const data = useMemo<Data>(
    () => (account ? { verint: roster, gtt: gtt.state === "live" ? gtt.events : [], workday: [], directory } : fixtures),
    [account, roster, gtt, directory, fixtures],
  );
  const gttOnly = useMemo(() => {
    if (!account || gtt.state !== "live") return 0;
    const seen = new Set(joinAll(data).flatMap((j) => j.gtt.map((e) => e.workdayId)));
    return new Set(data.gtt.filter((e) => !seen.has(e.workdayId)).map((e) => e.workdayId)).size;
  }, [account, gtt, data]);
  const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // Live KPIs are as of the Verint capture, not the wall clock: productive minutes only move when a capture
  // arrives, so measuring them against a base that grows every 15 s made shrinkage climb on its own.
  const asOf = account && roster.length ? Math.max(...roster.map((a) => a.capturedAt)) : now;
  const kpis = useMemo(() => computeKpis(data, asOf, buildBoard(data, asOf)), [data, asOf]);

  // Diagnosis: after each NEW capture for this account, save what the board received and what it
  // computed to POC_Redefined/runs/snapshots/<ACCOUNT>_latest.json (gitignored; contains names).
  useEffect(() => {
    if (!account || !raw || !roster.length) return;
    fetch("/api/snapshot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: account.id, saved_at: new Date().toISOString(), extension_synced_at: new Date(raw.at).toISOString(),
        extension_roster: raw.rows, // exactly as pushed, all LOBs (the board keeps only this account's rows)
        gtt: gtt.state === "live" ? { fetched_at: new Date(gtt.at).toISOString(), total_rows: gtt.totalRows, events: gtt.events } : gtt,
        computed: kpis,
      }),
    }).then((r) => r.json()).then((d) => setSnap(d.ok ? { at: Date.now(), file: d.file } : { error: d.error }))
      .catch(() => setSnap({ error: "local_api.py not reachable" }));
  }, [raw?.at, accountId, gtt.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Alerts run on the wall clock (minutes keep counting between captures); KPIs above are as of the capture.
  const model = useMemo(() => buildBoard(data, now, outage), [data, now, outage]);
  const tls = useMemo(() => [...new Set(model.teams.map((t) => t.tl))].sort(), [model]);
  const myTl = tls.includes(tl) ? tl : ""; // no silent default: My team asks who you are
  const onTrack = (k: string, p: Track) => setTrack((t) => ({ ...t, [k]: { ...t[k], ...p } }));
  // Sev 1 (outside a LOB incident) goes to the TL the moment it appears — nobody has to press "notify".
  // sentAt starts the escalation clock; the Google Chat post follows in the next one-minute batch (below).
  const direct = model.exceptions.filter((e) => e.sev === 1 && !e.incident).map((e) => e.key);
  useEffect(() => {
    const fresh = direct.filter((k) => !track[k]?.sentAt);
    if (fresh.length) setTrack((t) => ({ ...t, ...Object.fromEntries(fresh.map((k) => [k, { ...t[k], sentAt: Date.now() }])) }));
  }, [direct.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reports send the raw extension rows for THIS account (local_api normalizes them itself).
  const accountRows = useMemo(() => (raw?.rows ?? []).filter((r) => r.lob === accountId), [raw, accountId]);
  const reports = useReports(account, accountRows);

  // TL Alert System -> Google Chat (alerts/chat.ts). Once a minute: one card with that minute's new Sev 1s,
  // one with escalations that rose a level. Sev 2 only goes in the 30-min digest; Sev 3 is never sent.
  // The interval reads the latest state from a ref; it is marked as posted even when simulated, so no re-spam.
  const [chat, setChat] = useState<ChatResult | null>(null);
  const chatRef = useRef({ account, model, track, kpis, asOf, report: reports.report, chatOn });
  chatRef.current = { account, model, track, kpis, asOf, report: reports.report, chatOn };
  useEffect(() => {
    setChat(null);
    if (!account) return;
    const id = setInterval(() => {
      const { account: a, model: m, track: tr, chatOn: on } = chatRef.current;
      if (!a || !on) return;
      const t = Date.now();
      const { fresh, escalate } = chatDue(m, tr, t);
      if (!fresh.length && !escalate.length) return;
      setTrack((cur) => {
        const n = { ...cur };
        for (const e of fresh) n[e.key] = { ...n[e.key], chatAt: t };
        for (const { e, level } of escalate) n[e.key] = { ...n[e.key], chatLevel: level };
        return n;
      });
      if (fresh.length) dispatch(a.id, alertCard(fresh, a.label), `${fresh.length} new alert(s)`).then(setChat);
      if (escalate.length) dispatch(a.id, escalationCard(escalate, a.label), `${escalate.length} escalation(s)`).then(setChat);
    }, 60000);
    return () => clearInterval(id);
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sendDigest = useCallback(() => {
    const { account: a, model: m, track: tr, kpis: k, asOf: at, report } = chatRef.current;
    if (a) dispatch(a.id, digestCard(m, tr, k, at, report, a.label), "digest").then(setChat);
  }, []);
  const digestOn = chatOn && !!reports.config?.chatDigestEnabled;
  useEffect(() => {
    if (!digestOn) return;
    const id = setInterval(sendDigest, 30 * 60000);
    return () => clearInterval(id);
  }, [digestOn, accountId, sendDigest]);

  const ago = (t: number) => Math.max(0, Math.round((now - t) / 60000));
  const fresh: Freshness[] = !account
    ? (["Verint", "GTT", "Workday"] as const).map((src) => ({ src, text: "sample data" }))
    : [
        roster.length
          ? { src: "Verint", ageMin: ago(Math.max(...roster.map((a) => a.capturedAt))), text: `${roster.length} agents · captured ${ago(Math.max(...roster.map((a) => a.capturedAt)))} min ago` }
          : { src: "Verint", text: "waiting for the extension" },
        !account.gttFunctionalArea ? { src: "GTT", text: `none — ${account.clockSystem}` }
          : gtt.state === "live" ? { src: "GTT", ageMin: ago(gtt.at), text: `${gtt.events.filter((e) => e.event === "clock_in").length} clock-ins · fetched ${ago(gtt.at)} min ago${gtt.events.length ? ` · newest clock event ${hhmm(Math.max(...gtt.events.map((e) => e.at)))} (${ago(Math.max(...gtt.events.map((e) => e.at)))} min old)` : ""} · refresh 5 min` }
          : gtt.state === "error" ? { src: "GTT", text: `error: ${gtt.error}` }
          : { src: "GTT", text: "fetching…" },
        { src: "Workday", text: "not connected — approved absences unknown" },
      ];

  return (
    <div className={`app${wall ? " app--wall" : ""}`}>
      <header className="top">
        <span className="wordmark">TELUS <i>Digital</i></span>
        <b className="brand">RTA Board</b>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="DEMO">Demo (sample data)</option>
          {PILOT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <nav>
          <button className={screen === "team" ? "on" : ""} onClick={() => setScreen("team")}>My team</button>
          <button className={screen === "floor" ? "on" : ""} onClick={() => setScreen("floor")}>Floor</button>
          <button className={screen === "reports" ? "on" : ""} onClick={() => setScreen("reports")}>Reports</button>
          <button className={screen === "details" ? "on" : ""} onClick={() => setScreen("details")}>Details</button>
        </nav>
        <button onClick={() => { setWall((w) => !w); setScreen("floor"); }}>{wall ? "Exit wall mode" : "Wall mode"}</button>
      </header>
      {account && (
        <div className="notice">
          {!roster.length && !!live?.length && <>The extension is sending a roster for <b>{[...new Set(live.map((a) => a.lob || "untagged"))].join(", ")}</b>, not {account.id}: run Full Capture in the Verint tab for this account. </>}
          {!roster.length && !live?.length && <>No Verint roster for <b>{account.label}</b> yet: open Verint for this account with the RTA Live Bridge extension and run Full Capture. After reloading the extension, reload this tab too. </>}
          {gtt.state === "live" && !account.confirmed && gtt.totalRows === 0 && <>GTT returned 0 rows and this account's GTT sites are unconfirmed, so 0 may mean a wrong site string, not no data. </>}
          {foreign.length > 0 && <>Agents from other Verint organizations are in this capture and counted here: {foreign.map(([o, c]) => `${o} (${c})`).join(", ")}. </>}
          {gttOnly > 0 && <>{gttOnly} employee(s) clocked in on GTT are not in the Verint roster. </>}
        </div>
      )}
      {account && !wall && screen !== "details" && (
        <div className="snap muted chatline">
          {chatOn ? <>Google Chat <b className="ok">on</b>: new red alerts (under {CHAT_FRESH_MIN} min old) go to {account.label}'s space once a minute.</>
            : <>Google Chat <b>off</b>: alerts stay on this board.</>}
          {chat && <> Last: {hhmm(chat.at)} · {chat.what} · {chat.ok ? "posted" : chat.error?.includes("simulated") ? "simulated (no webhook set)" : <span className="bad">not posted ({chat.error})</span>}.</>}
          <button onClick={() => setChatOn(!chatOn)}>{chatOn ? "Turn Chat off" : "Send alerts to Google Chat"}</button>
        </div>
      )}
      {screen === "team" && !wall && (
        <TeamLead data={data} model={model} now={now} wall={wall} tl={myTl} tls={tls} onTl={setTl} track={track} onTrack={onTrack} chatOn={chatOn} />
      )}
      {(screen === "floor" || wall) && (
        <Floor model={model} now={now} asOf={asOf} kpis={kpis} fresh={fresh} wall={wall} track={track} outage={outage}
          onOutage={(lob, on) => setOutage((s) => { const n = new Set(s); if (on) n.add(lob); else n.delete(lob); return n; })}
          onOpen={(t) => { setTl(t); setScreen("team"); }} />
      )}
      {screen === "reports" && !wall && (
        <Reports account={account} r={reports} adherence={buildAdherenceSummary(model, track, roster, now)}
          alertAgents={model.exceptions.map((e) => e.agent)} kpis={kpis} asOf={asOf} hasRoster={roster.length > 0} onDigest={sendDigest} />
      )}
      {screen === "details" && !wall && (
        <>
          <div className="subnav">
            <button className={detail === "numbers" ? "on" : ""} onClick={() => setDetail("numbers")}>Numbers &amp; funnel</button>
            <button className={detail === "checks" ? "on" : ""} onClick={() => setDetail("checks")}>Data checks</button>
            <button className={detail === "sources" ? "on" : ""} onClick={() => setDetail("sources")}>Data sources</button>
            <button className={detail === "capture" ? "on" : ""} onClick={() => setDetail("capture")}>Capture</button>
          </div>
          {detail === "numbers" && <KpiStrip k={kpis} now={asOf} fresh={fresh} />}
          {detail === "checks" && <Report key={accountId} data={data} now={now} />}
          {detail === "sources" && <Sources />}
          {detail === "capture" && (
            <div className="capture">
              <ul>{fresh.map((f) => <li key={f.src}><b>{f.src}</b>: {f.text}</li>)}</ul>
              {account ? (
                <>
                  <p><button onClick={() => bridgeSend("run-full-capture")}>Run Full Capture</button> <button onClick={() => bridgeSend("push-now")}>Ask the extension to push</button>
                    <span className="muted"> Both need the Verint tab open with the RTA Live Bridge extension.</span></p>
                  {snap && <p className="muted">{"file" in snap ? <>Snapshot saved {hhmm(snap.at)} → <code>POC_Redefined/{snap.file}</code> (and <code>{account.id}_latest.json</code>)</> : <span className="bad">Snapshot not saved: {snap.error}</span>}</p>}
                </>
              ) : <p className="muted">Demo uses sample data: pick an account to capture.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
