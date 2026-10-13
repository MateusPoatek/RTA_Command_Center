// Data checks (Details tab): the daily attendance line per agent, assembled from GTT +
// Verint + Workday, with a source chip on every cell. Click a cell to see its
// lineage. The LOB rollup + "scorecard feed preview" is the shape that would be
// written to the Scorecard instead of hand-typed collection files.
import { useMemo, useState } from "react";
import type { Data } from "../data/types";
import { composeReport } from "../domain/report";
import type { Cell } from "../domain/report";

const COLS = ["scheduled", "shiftStart", "productive", "adherence", "attendance"] as const;
const HEAD: Record<(typeof COLS)[number], string> = {
  scheduled: "Scheduled", shiftStart: "Shift start", productive: "Productive", adherence: "Adherence", attendance: "Attendance",
};
const SRC_CLS = { GTT: "g", Verint: "v", Workday: "w" } as const;

export function Report({ data, now }: { data: Data; now: number }) {
  const { lines, lobs } = useMemo(() => composeReport(data, now), [data, now]);
  const [filter, setFilter] = useState<"all" | "issues" | "unpublished">("all");
  const [sel, setSel] = useState<{ who: string; col: string; cell: Cell } | null>(null);
  const shown = lines.filter((l) => filter === "all" || (filter === "issues" ? l.passed < l.total : l.unpublished));
  const nUnpub = lines.filter((l) => l.unpublished).length;
  const date = new Date(now).toISOString().slice(0, 10);

  const feed = lobs.map((l) => ({
    date, lob: l.lob, absenteeism_pct: l.absenteeismPct, adherence_pct: l.adherence,
    confidence_pct: l.confidence, sources: ["GTT", "Verint", "Workday"],
  }));

  return (
    <main className={`report${sel ? " drawer-open" : ""}`}>
      <details className="explain">
        <summary>How confidence is calculated</summary>
        <p>Each agent has three facts the scorecard depends on. Each one is a <b>check</b>:</p>
        <ul>
          <li><b>Scheduled</b>: Verint has a published schedule for today.</li>
          <li><b>Shift start</b>: the GTT clock-in and Verint's first activity agree within 10 minutes.</li>
          <li><b>Attendance</b>: present with clock evidence, or absent with an approved reason in Workday.</li>
        </ul>
        <p>A check <b className="ok">passes</b> only when it is backed the way it should be. A fact from one source only (GTT or Verint, not both) is <b className="mid">single source</b> and does not pass. A <b className="bad">conflict</b> (sources disagree) or a <b className="bad">missing</b> value fails. Checks that are not due yet (shift not started) are skipped. Productive and adherence are not checked because only Verint has them.</p>
        <p><b>Confidence = passed checks ÷ evaluated checks.</b> The 97% target is the WFM Scorecard SOP's publishing threshold. The SOP computes 1 − (flags − validated flags) ÷ evaluations; we have no flag validation step yet, so every failed check counts against the score.</p>
        <p className="muted">Two ceilings to keep in mind. A Verint-only account (e.g. Epic Games Philippines) can never corroborate shift start, so it tops out near 67%. While Workday is not connected, every absence is unexplained and fails. In both cases the low score is correct: it says the number rests on fewer sources than the scorecard requires.</p>
      </details>

      <section className="rollup">
        {lobs.map((l) => (
          <div key={l.lob} className="card">
            <h3>{l.lob}</h3>
            <div className={`big ${l.confidence >= 97 ? "ok" : l.confidence >= 85 ? "mid" : "bad"}`}>{l.confidence}%</div>
            <div className="muted">confidence · target 97%</div>
            <div className="checks">
              <b className="ok">{l.checks.ok} passed</b> of {l.checks.ok + l.checks.unverified + l.checks.conflict + l.checks.missing} checks
              {l.checks.unverified > 0 && <> · <span className="mid">{l.checks.unverified} single source</span></>}
              {l.checks.conflict > 0 && <> · <span className="bad">{l.checks.conflict} conflict</span></>}
              {l.checks.missing > 0 && <> · <span className="bad">{l.checks.missing} missing</span></>}
            </div>
            <dl>
              <dt>Agents</dt><dd>{l.agents}</dd>
              <dt>Adherence</dt><dd>{l.adherence ?? "—"}%</dd>
              <dt>Absenteeism</dt><dd>{l.absenteeismPct}%</dd>
              <dt>Unexplained</dt><dd>{l.absentUnexplained}</dd>
            </dl>
          </div>
        ))}
      </section>

      <div className="bar">
        <label>Show{" "}
          <select id="report-filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All agents ({lines.length})</option>
            <option value="issues">Provenance issues ({lines.filter((l) => l.passed < l.total).length})</option>
            <option value="unpublished">Unpublished schedule ({nUnpub})</option>
          </select>
        </label>
        <span className="legend">
          <i className="chip g">GTT</i><i className="chip v">Verint</i><i className="chip w">Workday</i>
          <span className="muted">· border: <b className="ok">corroborated</b> · <b className="mid">single source</b> · <b className="bad">conflict / missing</b></span>
        </span>
      </div>

      <table>
        <thead>
          <tr><th>Agent</th><th>LOB · TL</th>{COLS.map((c) => <th key={c}>{HEAD[c]}</th>)}<th>Confidence</th></tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={l.name}>
              <td>{l.name}</td>
              <td className="muted">{l.lob.replace("EPIC - ", "")} · {l.tl}</td>
              {COLS.map((c) => {
                const cell = l[c];
                return (
                  <td key={c}>
                    <button className={`cell s-${cell.status}`} onClick={() => setSel({ who: l.name, col: HEAD[c], cell })}>
                      <span>{cell.value}</span>
                      {cell.provs.map((p) => <i key={p.source} className={`chip ${SRC_CLS[p.source]}`}>{p.source[0]}</i>)}
                    </button>
                  </td>
                );
              })}
              <td>{l.total ? Math.round((100 * l.passed) / l.total) : 100}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
        <aside className="drawer">
          <button className="x" onClick={() => setSel(null)}>×</button>
          <h3>{sel.who} — {sel.col}</h3>
          <p><b>{sel.cell.value}</b> <span className={`st s-${sel.cell.status}`}>{sel.cell.status}</span></p>
          {sel.cell.note && <p className="muted">{sel.cell.note}</p>}
          {sel.cell.provs.length === 0 && <p className="muted">No source recorded a value.</p>}
          {sel.cell.provs.map((p, i) => (
            <dl key={i} className="prov">
              <dt>Source</dt><dd><i className={`chip ${SRC_CLS[p.source]}`}>{p.source}</i> {p.system}</dd>
              <dt>Field</dt><dd>{p.field}</dd>
              <dt>Value</dt><dd>{p.value}</dd>
              <dt>Joined on</dt><dd>{p.joinKey === "workday_id" ? "Workday ID" : p.joinKey === "name_loose" ? "name, loose (accents ignored, 2+ shared names, unique) — no ID in this source yet" : "name (exact) — no ID in this source yet"}</dd>
              <dt>Fetched</dt><dd>{new Date(p.fetchedAt).toLocaleTimeString()} · {p.origin}</dd>
            </dl>
          ))}
        </aside>
      )}

      <details className="feed">
        <summary>Scorecard feed preview — what would be written instead of hand-typed collection files</summary>
        <pre>{JSON.stringify(feed, null, 2)}</pre>
      </details>
    </main>
  );
}
