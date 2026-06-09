// content_verint.js — ISOLATED world on *.verintcloudservices.com.
// Bridges captured API bodies from the page (MAIN world / inject.js) to the
// extension background. Read-only relay; sends nothing back to Verint.
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.__rtaLiveBridge !== true) return;
  if (d.kind === "verint-response") {
    try {
      chrome.runtime.sendMessage({ type: "verint-response", url: d.url, body: d.body });
    } catch (_) {
      /* background may be asleep; it will rebuild on next capture */
    }
  }
});

// Background → here → inject.js (MAIN world): relay a re-fetch command so the
// page replays the calendar-filter request in the user's session.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "refetch") {
    window.postMessage({ __rtaLiveBridge: true, kind: "refetch" }, window.location.origin);
  }
});
