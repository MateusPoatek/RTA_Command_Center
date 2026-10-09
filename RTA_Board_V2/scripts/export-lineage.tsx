// npm run export-lineage — renders the Data Sources tab (same component, same
// src/data/lineage.ts) to one self-contained page for sharing with engineering.
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Sources } from "../src/screens/Sources";

const OUT = new URL("../../POC_Redefined/Product_and_Architecture_docs/data-sources-reference.html", import.meta.url);

const css = `
/* Layout: one reading column; source columns as a wrapping grid, formulas as cards, priorities as a table. */
:root {
  --bg: #f6f7f9; --panel: #ffffff; --line: #dde1e8; --fg: #1b2230; --muted: #5d6779; --code-bg: #eef1f5;
  --gtt: #0b7fa8; --wd: #a86a00; --vt: #6b4fc8; --dv: #5d6779; --ok: #1f8a5b;
  --sans: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #11151c; --panel: #181e28; --line: #2a3242; --fg: #e6e9ef; --muted: #96a0b3; --code-bg: #0d1117;
  --gtt: #5cc4ea; --wd: #f0b648; --vt: #b39cff; --dv: #a5aec0; --ok: #4fc58f; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #11151c; --panel: #181e28; --line: #2a3242; --fg: #e6e9ef; --muted: #96a0b3; --code-bg: #0d1117;
  --gtt: #5cc4ea; --wd: #f0b648; --vt: #b39cff; --dv: #a5aec0; --ok: #4fc58f; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--sans); padding-inline: 16px; padding-block: 24px 48px; }
.wrap { max-width: 1280px; margin: 0 auto; }
h1 { font-size: 28px; margin: 0 0 4px; text-wrap: balance; }
h2 { font-size: 19px; margin: 36px 0 12px; text-wrap: balance; }
h3 { font-size: 15px; margin: 0 0 6px; }
.lede { color: var(--muted); max-width: 70ch; margin: 0 0 16px; }
code, pre { font-family: var(--mono); font-size: 12.5px; }
.muted { color: var(--muted); } .small { font-size: 13px; }
.flow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.chip { font: 600 11px/1.6 var(--mono); letter-spacing: .04em; padding: 1px 7px; border-radius: 4px; border: 1px solid currentColor; }
.chip.g { color: var(--gtt); } .chip.w { color: var(--wd); } .chip.v { color: var(--vt); } .chip.d { color: var(--dv); }
.src-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr)); gap: 14px; margin-top: 16px; }
.src-col { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.fcard { border-top: 1px solid var(--line); padding: 7px 0; font-size: 14px; }
.fcard summary { cursor: pointer; } .fcard summary:focus-visible { outline: 2px solid var(--gtt); outline-offset: 2px; }
.col { color: var(--muted); font-size: 11.5px; }
dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 12px; margin: 8px 0 0; font-size: 13px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.formulas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 14px; }
.card { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.fx.target { border-style: dashed; }
.fx h3 { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fx pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--code-bg); padding: 8px 10px; border-radius: 6px; margin: 6px 0; }
.tag { font: 600 10.5px/1.6 var(--mono); padding: 0 6px; border-radius: 4px; color: var(--muted); border: 1px solid var(--line); }
.tag.fixed { color: var(--ok); border-color: var(--ok); }
.tbl { overflow-x: auto; }
table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th { text-align: left; color: var(--muted); font-weight: 600; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; padding: 8px; border-bottom: 1px solid var(--line); }
td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.docs { line-height: 1.9; padding-left: 20px; } .docs code { overflow-wrap: anywhere; }
`;

const body = renderToStaticMarkup(<Sources />).replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>");
const html = `<title>RTA Data Sources Reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap">
<style>${css}</style>
<div class="wrap">
<h1>RTA Data Sources Reference</h1>
<p class="lede">Where each field on the RTA Board and the attendance report comes from: GTT, the Workday columns GTT carries, the Verint RTA extension, or our own derivation. Each field lists its GTT column, a synthetic example, where the code parses it, and what it feeds. Generated ${new Date().toISOString().slice(0, 10)} from <code>RTA_Board_V2/src/data/lineage.ts</code>.</p>
${body}
</div>
`;
writeFileSync(OUT, html);
console.log("wrote", OUT.pathname);
