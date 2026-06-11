// popup.js — shows capture status and a "Push to Command Center" button.
const countEl = document.getElementById("count");
const listEl = document.getElementById("list");
const pushBtn = document.getElementById("push");

function render(cards) {
  countEl.textContent = String(cards.length);
  pushBtn.disabled = cards.length === 0;
  listEl.innerHTML = "";
  for (const c of cards.slice(0, 12)) {
    const li = document.createElement("li");
    li.className = c.severity || "";
    const ag = (c.agent && c.agent.name) || "?";
    const sched = (c.agent && c.agent.scheduledActivity) || "?";
    const actual = (c.agent && c.agent.currentStatus) || "?";
    li.textContent = `${ag}: scheduled ${sched} → actually ${actual}`;
    listEl.appendChild(li);
  }
}

// Liveness heartbeat — mirrors the Command Center banner. While the popup is
// open it ticks "♥ synced Ns ago" (resets on each capture) and flips to a grey
// "idle" when the bridge goes quiet, so liveness is visible here too.
let hbLastSynced = null;
let hbCount = 0;

function paintHeartbeat() {
  const el = document.getElementById("sync");
  if (!el) return;
  if (!hbLastSynced) {
    el.style.color = "#888";
    el.textContent = "no capture yet — open the Verint calendar and page once";
    return;
  }
  const agoSec = Math.max(0, Math.round((Date.now() - Date.parse(hbLastSynced)) / 1000));
  const fresh = agoSec < 90; // the heartbeat alarm is ~1 min
  const rel = agoSec < 60 ? `${agoSec}s ago` : `${Math.floor(agoSec / 60)}m ${agoSec % 60}s ago`;
  const color = fresh ? "#16a34a" : "#9ca3af";
  const label = fresh
    ? `♥ synced ${rel} · ${hbCount} capture(s) this session`
    : `idle — no fresh capture (${rel}) · page Verint to resume`;
  el.style.color = color;
  el.innerHTML =
    `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px"></span>` +
    label;
}

function refreshState() {
  chrome.runtime.sendMessage({ type: "get-cards" }, (resp) => {
    if (chrome.runtime.lastError) return;
    render((resp && resp.cards) || []);
    hbLastSynced = (resp && resp.lastSyncedAt) || null;
    hbCount = (resp && resp.captureLog && resp.captureLog.length) || 0;
    paintHeartbeat();
  });
}

refreshState(); // initial paint
setInterval(paintHeartbeat, 1000); // tick "Ns ago" every second
setInterval(refreshState, 3000); // re-poll for fresh captures while the popup is open

pushBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "push-now" }, (resp) => {
    if (chrome.runtime.lastError) return;
    pushBtn.textContent = resp && resp.count ? `Pushed ${resp.count} cards ✓` : "No cards yet";
    setTimeout(() => (pushBtn.textContent = "Push to Command Center"), 1800);
  });
});

// ---------------------- Floor View — gate probe -------------------------
// Read-only. Triggers inject.js's probe, polls the background for the result,
// renders a sanitised table (NO names) + a one-line verdict. See ADR-0005.
const probeBtn = document.getElementById("probe");
const verdictEl = document.getElementById("probe-verdict");
const probeResultEl = document.getElementById("probe-result");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function renderProbe(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
    verdictEl.textContent = "";
    verdictEl.className = "";
    probeResultEl.innerHTML = "";
    return;
  }
  const rows = result.rows;
  const byPrefix = (p) => rows.find((r) => (r.label || "").indexOf(p) === 0);
  const ok2xx = (r) => r && typeof r.status === "number" && r.status >= 200 && r.status < 300;
  const hits = (r) => r && ok2xx(r) && typeof r.returned === "number" && r.returned === r.requested && r.requested > 0;

  const v2 = byPrefix("V2"), v3 = byPrefix("V3");
  const green = hits(v2) && hits(v3);
  verdictEl.className = green ? "go" : "fallback";
  verdictEl.textContent = green ? "✅ GREEN-LIGHT — Verint honoured our composed workResourceIds" : "🟠 FALLBACK — composed set not honoured (see rows)";

  const orgN = result.meta && result.meta.orgs;
  const note = orgN != null && orgN < 2 ? ` · only ${orgN} LOB in view (V3 ≈ V2)` : "";

  let html = '<table class="probe"><tr><th>variant</th><th>status</th><th>req/ret</th><th>ms</th></tr>';
  for (const r of rows) {
    const statusCell = r.error
      ? `<td class="bad">${esc(r.error)}</td>`
      : `<td class="${ok2xx(r) ? "ok" : "bad"}">${esc(r.status != null ? r.status : (r.note || "—"))}${r.retryAfter ? " ⏳" : ""}</td>`;
    const reqRet = r.error ? "—" : `${esc(r.requested)}/${esc(r.returned)}`;
    html += `<tr><td>${esc(r.label)}</td>${statusCell}<td>${reqRet}</td><td>${esc(r.latencyMs != null ? r.latencyMs : "")}</td></tr>`;
  }
  html += "</table>";
  html += `<div class="hint">indexed ${esc(result.meta && result.meta.indexed)} resources${esc(note)} · at ${esc(result.ts ? new Date(result.ts).toLocaleTimeString() : "")}</div>`;
  probeResultEl.innerHTML = html;
}

let probePoll = null;
function pollProbe(triesLeft) {
  chrome.runtime.sendMessage({ type: "get-probe-result" }, (result) => {
    if (chrome.runtime.lastError) return;
    if (result) {
      clearInterval(probePoll);
      probePoll = null;
      probeBtn.disabled = false;
      probeBtn.textContent = "Run gate probe";
      renderProbe(result);
    } else if (triesLeft <= 0) {
      clearInterval(probePoll);
      probePoll = null;
      probeBtn.disabled = false;
      probeBtn.textContent = "Run gate probe";
      verdictEl.className = "fallback";
      verdictEl.textContent = "No result — is the Verint calendar tab open? Page it once, then retry.";
    }
  });
}

probeBtn.addEventListener("click", () => {
  probeBtn.disabled = true;
  probeBtn.textContent = "Running… keep open ~15s";
  verdictEl.textContent = "";
  verdictEl.className = "";
  probeResultEl.innerHTML = "";
  chrome.runtime.sendMessage({ type: "run-probe" }, () => {
    if (chrome.runtime.lastError) return;
    let tries = 30; // ~30s @ 1s
    probePoll = setInterval(() => pollProbe(--tries), 1000);
  });
});

// On open, show the most recent probe result (if a run already completed).
chrome.runtime.sendMessage({ type: "get-probe-result" }, (result) => {
  if (chrome.runtime.lastError) return;
  if (result) renderProbe(result);
});
