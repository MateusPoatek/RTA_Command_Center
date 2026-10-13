// content_cc.js — ISOLATED world on http://localhost:5174/* (the Command Center, RTA_Board_V2).
// Receives cards from the extension background and hands them to the React app
// via window.postMessage (RTA_Board_V2 src/data/bridge.ts listens for these).
function inject(cards, syncedAt, roster) {
  window.postMessage(
    {
      __rtaLiveBridge: true,
      kind: "cards",
      cards: cards || [],
      roster: roster || [],
      syncedAt: syncedAt || null,
    },
    window.location.origin
  );
}

// Pushed live whenever a new capture arrives.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "cards") inject(msg.cards, msg.syncedAt, msg.roster);
});

// On (re)load of the Command Center tab, pull whatever's already captured.
chrome.runtime.sendMessage({ type: "get-cards" }, (resp) => {
  if (chrome.runtime.lastError) return;
  if (resp && resp.cards && resp.cards.length) inject(resp.cards, resp.lastSyncedAt, resp.roster);
});

// Relay capture-control messages FROM the Command Center page TO the background
// (the "Capture Data" hub: Sync now + frequency). Page → content_cc → background.
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.__rtaLiveBridge !== true) return;
  if (d.kind === "trigger-capture") {
    chrome.runtime.sendMessage({ type: "trigger-capture" }, () => void chrome.runtime.lastError);
  } else if (d.kind === "set-frequency") {
    chrome.runtime.sendMessage({ type: "set-frequency", seconds: d.seconds }, () => void chrome.runtime.lastError);
  } else if (d.kind === "run-full-capture") {
    // Scheduled report generation asking for a fresh Verint read before it
    // runs (same one-pass census+targeted capture as the popup's button).
    chrome.runtime.sendMessage({ type: "run-full-capture" }, () => void chrome.runtime.lastError);
  } else if (d.kind === "push-now") {
    // Force-deliver whatever's staged, regardless of the autoPush setting —
    // the scheduler needs a guaranteed "cards" push after a full capture.
    chrome.runtime.sendMessage({ type: "push-now" }, () => void chrome.runtime.lastError);
  } else if (d.kind === "set-lob") {
    // Keep the extension's capture LOB in lockstep with the Command Center's
    // activeAccount — otherwise the two can silently diverge (RTA switches
    // accounts in the app, extension keeps capturing under the old LOB).
    chrome.runtime.sendMessage({ type: "set-lob", lob: d.lob }, () => void chrome.runtime.lastError);
  }
});
