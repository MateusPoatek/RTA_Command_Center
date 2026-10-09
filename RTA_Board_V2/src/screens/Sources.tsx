// Engineering reference: which fields come from GTT, which GTT carries from
// Workday, which come from the Verint extension, and what we derive. Data: src/data/lineage.ts.
import { DOCS, FIELDS, FORMULAS, PRIORITIES } from "../data/lineage";
import type { Src } from "../data/lineage";

const COLS: Array<{ src: Src; cls: string; blurb: string }> = [
  { src: "GTT", cls: "g", blurb: "Google Global Time Tracker post-mortem report. 22 columns per row, one row per aux event." },
  { src: "Workday via GTT", cls: "w", blurb: "HR master columns GTT carries on every row. Not a Workday connection — a copy." },
  { src: "Verint extension", cls: "v", blurb: "RTA browser extension intercepting Verint calendar-filter responses. No Workday ID." },
  { src: "Derived", cls: "d", blurb: "Computed by us from the three above. Never read from a source." },
];

export function Sources() {
  return (
    <main className="sources">
      <p className="flow">
        <span className="chip g">GTT</span> cols 2–5 carry <span className="chip w">Workday</span> → join on <b>workdayId</b> ←{" "}
        <span className="chip v">Verint</span> (name only today, fuzzy) → <span className="chip d">Derived</span> report + alerts
      </p>

      <div className="src-cols">
        {COLS.map((c) => (
          <section key={c.src} className="src-col">
            <h3><span className={`chip ${c.cls}`}>{c.src}</span></h3>
            <p className="muted small">{c.blurb}</p>
            {FIELDS.filter((f) => f.src === c.src).map((f) => (
              <details key={f.name} className="fcard">
                <summary>
                  {f.col !== undefined && <code className="col">col {f.col}</code>} <b>{f.name}</b>
                  {f.inferred && <span className="muted small"> · origin inferred</span>}
                </summary>
                <dl>
                  <dt>Example</dt><dd><code>{f.example}</code></dd>
                  <dt>Parsed at</dt><dd><code>{f.parsedAt}</code></dd>
                  {f.feeds.length > 0 && <><dt>Feeds</dt><dd>{f.feeds.join(" · ")}</dd></>}
                  {f.note && <><dt>Note</dt><dd>{f.note}</dd></>}
                </dl>
              </details>
            ))}
          </section>
        ))}
      </div>

      <h2>Formulas</h2>
      <div className="formulas">
        {FORMULAS.map((f) => (
          <div key={f.name} className={`card fx${f.status ? ` ${f.status}` : ""}`}>
            <h3>{f.name}{f.status === "target" && <span className="tag">scorecard target</span>}{f.status === "fixed" && <span className="tag fixed">fixed</span>}</h3>
            <pre>{f.formula}</pre>
            <dl>
              <dt>Inputs</dt><dd>{f.inputs}</dd>
              <dt>Where</dt><dd><code>{f.at}</code></dd>
              {f.doc && <><dt>Ref</dt><dd>{f.doc}</dd></>}
            </dl>
          </div>
        ))}
      </div>

      <h2>What to extract first (WFM Weekly Scorecard)</h2>
      <table>
        <thead><tr><th>#</th><th>Extraction</th><th>From</th><th>Scorecard metrics unlocked</th><th>Effort</th><th>Blocker</th></tr></thead>
        <tbody>
          {PRIORITIES.map((p) => (
            <tr key={p.rank}><td>{p.rank}</td><td><b>{p.what}</b></td><td>{p.from}</td><td>{p.unlocks}</td><td>{p.effort}</td><td className="muted">{p.blocker}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Out of reach for GTT + Verint: Transactions / TPH (ACD), Required / Planned FTE (planning tools).</p>

      <h2>Referenced documentation</h2>
      <ul className="docs">
        {DOCS.map((d) => <li key={d.path}><b>{d.title}</b> — <code>{d.path}</code></li>)}
      </ul>
    </main>
  );
}
