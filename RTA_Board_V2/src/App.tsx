import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Board } from "./screens/Board";
import { Report } from "./screens/Report";
import { Sources } from "./screens/Sources";

const GTT_POLL_MS = 5 * 60000;
type Gtt = { state: "off" } | { state: "loading" } | { state: "error"; error: string } | { state: "live"; events: GttEvent[]; totalRows: number; at: number };

export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [fixtures] = useState<Data>(() => makeFixtures(Date.now()));
  const [live, setLive] = useState<VerintAgent[] | null>(null);
  const [screen, setScreen] = useState<"board" | "report" | "sources">("board");
  const [wall, setWall] = useState(false);
  const [accountId, setAccountId] = useState("DEMO");
  const [gtt, setGtt] = useState<Gtt>({ state: "off" });
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
    () => (account ? { verint: roster, gtt: gtt.state === "live" ? gtt.events : [], workday: [] } : fixtures),
    [account, roster, gtt, fixtures],
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
        <b className="brand">RTA Board</b>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="DEMO">Demo (sample data)</option>
          {PILOT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <nav>
          <button className={screen === "board" ? "on" : ""} onClick={() => setScreen("board")}>Alert Board</button>
          <button className={screen === "report" ? "on" : ""} onClick={() => setScreen("report")}>Report Composition</button>
          <button className={screen === "sources" ? "on" : ""} onClick={() => setScreen("sources")}>Data Sources</button>
        </nav>
        <button onClick={() => setWall((w) => !w)}>{wall ? "Exit wall mode" : "Wall mode"}</button>
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
      {screen !== "sources" && <KpiStrip k={kpis} now={asOf} fresh={fresh} />}
      {account && snap && (
        <div className="snap muted">{"file" in snap ? <>Snapshot saved {hhmm(snap.at)} → <code>POC_Redefined/{snap.file}</code> (and <code>{account.id}_latest.json</code>)</> : <span className="bad">Snapshot not saved: {snap.error}</span>}</div>
      )}
      {screen === "board" ? <Board key={accountId} data={data} now={now} wall={wall} /> : screen === "report" ? <Report key={accountId} data={data} now={now} /> : <Sources />}
    </div>
  );
}
