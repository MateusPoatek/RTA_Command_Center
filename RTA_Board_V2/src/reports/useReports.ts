// Report state for the active account, ported from the old command-center App.tsx:
// read the latest runs/reports/reconciliation_<ACC>_<date>.json, generate a fresh one via
// local_api.py (POST /api/generate-report), and run the browser-side schedule.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account } from "../data/accounts";
import { defaultReportConfigFor, todayIn } from "../data/accounts";
import type { RosterRow } from "../data/bridge";
import { bridgeSend } from "../data/bridge";
import type { ReconciliationReport, ReportConfig, ReportHistoryEntry } from "./types";
import { loadReportConfig, saveHistoryEntry } from "./ReportConfigPanel";
import { useReportScheduler } from "./useReportScheduler";

export type GenState = { state: "idle" } | { state: "running" } | { state: "error"; error: string };

/** Walk back up to 3 days for the newest report file for this account. */
async function fetchLatest(a: Account): Promise<ReconciliationReport | null> {
  for (let back = 0; back < 4; back++) {
    const date = todayIn(a.timezone, Date.now() - back * 86400000);
    const r = await fetch(`/runs/reports/reconciliation_${a.id}_${date}.json`).catch(() => null);
    if (r?.ok && r.headers.get("content-type")?.includes("json")) return r.json();
  }
  return null;
}

export function useReports(account: Account | undefined, rows: RosterRow[]) {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [snapshots, setSnapshots] = useState<ReportHistoryEntry[]>([]);
  const [gen, setGen] = useState<GenState>({ state: "idle" });
  // The scheduler's setTimeout chain must see the roster and account as they are when it fires.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const accountRef = useRef(account);
  accountRef.current = account;
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    setReport(null);
    setSnapshots([]);
    setGen({ state: "idle" });
    if (!account) return setConfig(null);
    setConfig(loadReportConfig(account.id, defaultReportConfigFor(account.id)));
    let stop = false;
    fetchLatest(account).then((r) => !stop && setReport(r));
    return () => { stop = true; };
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async () => {
    const a = accountRef.current, cfg = configRef.current;
    if (!a || !cfg) return;
    setGen({ state: "running" });
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayIn(a.timezone, Date.now()), account: a.id, source: cfg.source, functional_area: cfg.functionalArea, sites: cfg.sites, verint_rows: rowsRef.current }),
      });
      const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status} — is local_api.py running on :5050?` }));
      if (!d.ok) throw new Error(d.error || `HTTP ${res.status}`);
      const r = await fetchLatest(a);
      if (accountRef.current?.id !== a.id) return; // switched account mid-run
      setReport(r);
      if (r) {
        const entry: ReportHistoryEntry = { date: r.date, gtt_total: r.gtt_total, verint_total: r.verint_total, matched: r.matched, discrepancy_count: r.discrepancy_count, intelligence: r.intelligence, generated_at: r.generated_at };
        setSnapshots((s) => [...s.filter((x) => x.date === r.date), entry]); // today only
        saveHistoryEntry(a.id, entry);
      }
      setGen({ state: "idle" });
    } catch (e) {
      setGen({ state: "error", error: (e as Error).message });
    }
  }, []);

  // Scheduled run: a fresh Full Capture first (GTT keeps growing through the day, so a stale
  // Verint roster makes the two totals drift apart), force a push, then generate.
  const scheduled = useCallback(() => {
    bridgeSend("run-full-capture");
    setTimeout(() => { bridgeSend("push-now"); setTimeout(generate, 2000); }, 20000);
  }, [generate]);
  useReportScheduler(config?.schedule ?? { mode: "off" }, scheduled);

  return { report, config, setConfig, snapshots, gen, generate };
}
