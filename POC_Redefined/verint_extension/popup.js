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

function renderSync(resp) {
  const el = document.getElementById("sync");
  if (!el) return;
  const last = resp && resp.lastSyncedAt ? new Date(resp.lastSyncedAt).toLocaleTimeString() : "—";
  const n = resp && resp.captureLog ? resp.captureLog.length : 0;
  el.textContent = `last capture: ${last}  ·  ${n} capture(s) this session`;
}

chrome.runtime.sendMessage({ type: "get-cards" }, (resp) => {
  if (chrome.runtime.lastError) return;
  render((resp && resp.cards) || []);
  renderSync(resp);
});

pushBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "push-now" }, (resp) => {
    if (chrome.runtime.lastError) return;
    pushBtn.textContent = resp && resp.count ? `Pushed ${resp.count} cards ✓` : "No cards yet";
    setTimeout(() => (pushBtn.textContent = "Push to Command Center"), 1800);
  });
});
