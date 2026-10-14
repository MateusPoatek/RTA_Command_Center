// popup.js — shows capture status and a "Push to Command Center" button.
const countEl = document.getElementById("count");
const listEl = document.getElementById("list");
const pushBtn = document.getElementById("push");
const autopushEl = document.getElementById("autopush");
const lobEl = document.getElementById("lob");

function render(cards, rosterCount) {
  countEl.textContent = String(cards.length);
  // A roster with 0 alerts is still worth pushing — it's what the report reconciles against GTT.
  pushBtn.disabled = cards.length === 0 && !rosterCount;
  pushBtn.textContent = cards.length || rosterCount
    ? `Push ${cards.length} alerts + ${rosterCount || 0} agents → Command Center`
    : "Push to Command Center";
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
    render((resp && resp.cards) || [], ((resp && resp.roster) || []).length);
    if (autopushEl) autopushEl.checked = !!(resp && resp.autoPush);
    hbLastSynced = (resp && resp.lastSyncedAt) || null;
    hbCount = (resp && resp.captureLog && resp.captureLog.length) || 0;
    paintHeartbeat();
  });
}

// Accumulate-then-push vs auto-push-every-page (persisted in the background).
autopushEl.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "set-autopush", on: autopushEl.checked }, () => void chrome.runtime.lastError);
});

// Which account's Verint filter is currently applied — labels cards/roster
// accordingly (was hardcoded to "EPIC" regardless of the account being captured).
// Switching this re-derives cards/roster from the current capture under the new label.
if (lobEl) {
  chrome.runtime.sendMessage({ type: "get-lob" }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.lob) lobEl.value = resp.lob;
  });
  lobEl.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "set-lob", lob: lobEl.value }, () => void chrome.runtime.lastError);
  });
}

// ---------------------- Full Capture (one pass, no paging) --------------
// Composes and fires its own sequential Verint reads (census + targeted)
// instead of relying on the RTA paging the calendar. This is active polling
// (ADR-0004/0005) — confirm before firing, same spirit as the gate probe's
// "keep this popup open" hint, so it's never triggered silently.
const captureBtn = document.getElementById("full-capture");
const captureStatusEl = document.getElementById("capture-status");

function renderCaptureProgress(p) {
  if (!captureStatusEl) return;
  if (!p) { captureStatusEl.textContent = ""; return; }
  if (p.phase === "starting") captureStatusEl.textContent = "Starting…";
  else if (p.phase === "census") captureStatusEl.textContent = `Census: page ${p.done}…`;
  else if (p.phase === "targeted") captureStatusEl.textContent = `Targeted: chunk ${p.done}/${p.total}…`;
  else if (p.phase === "languages") captureStatusEl.textContent = p.done < p.total ? `Languages: skill ${p.done}/${p.total}…` : "";
  else if (p.phase === "done") captureStatusEl.textContent = `✓ Full Capture complete (${p.total} targeted chunk(s)).`;
  else if (p.phase === "aborted") captureStatusEl.textContent = "⚠ Aborted (5xx) — see console.";
}

// Agent languages (Verint skills) — only shown for accounts that scan them (EPIC_BG).
const langsEl = document.getElementById("langs");
const langsTextEl = document.getElementById("langs-text");
function renderLanguages() {
  chrome.runtime.sendMessage({ type: "get-languages" }, (s) => {
    if (chrome.runtime.lastError || !langsEl) return;
    langsEl.style.display = s && s.supported ? "block" : "none";
    if (!s || !s.supported) return;
    const when = s.scannedAt ? new Date(s.scannedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
    langsTextEl.textContent = s.running
      ? "Languages: scanning Verint skills…"
      : s.error
        ? `Languages: last scan failed (${s.error})`
        : when ? `Languages: ${s.agents} agents · scanned ${when}` : "Languages: not scanned yet (page Verint)";
  });
}
document.getElementById("langs-refresh")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: "run-skill-lookup" }, () => { void chrome.runtime.lastError; renderLanguages(); });
});
renderLanguages();
setInterval(renderLanguages, 2000);

function pollCaptureProgress() {
  chrome.runtime.sendMessage({ type: "get-capture-progress" }, (p) => {
    if (chrome.runtime.lastError) return;
    renderCaptureProgress(p);
  });
}

if (captureBtn) {
  captureBtn.addEventListener("click", () => {
    const ok = window.confirm(
      "Full Capture issues a sequence of automated reads against Verint (census + targeted pulls) instead of paging manually.\n\n" +
      "Only run this against an account once cleared with the team (see ACCOUNT_ONBOARDING_PLAN.md).\n\n" +
      "Proceed?"
    );
    if (!ok) return;
    chrome.runtime.sendMessage({ type: "run-full-capture" }, () => void chrome.runtime.lastError);
  });
}

refreshState(); // initial paint
pollCaptureProgress();
setInterval(pollCaptureProgress, 1000); // frequent — the run itself only lasts seconds
setInterval(paintHeartbeat, 1000); // tick "Ns ago" every second
setInterval(refreshState, 3000); // re-poll for fresh captures while the popup is open

pushBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "push-now" }, (resp) => {
    if (chrome.runtime.lastError) return;
    pushBtn.textContent = resp && (resp.count || resp.rosterCount)
      ? `Pushed ${resp.count} alerts + ${resp.rosterCount || 0} agents ✓`
      : "Nothing captured yet";
    setTimeout(refreshState, 1800); // restore the "Push N →" label with the live count
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
