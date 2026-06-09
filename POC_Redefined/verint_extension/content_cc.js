// content_cc.js — ISOLATED world on http://localhost:5173/* (the Command Center).
// Receives cards from the extension background and hands them to the React app
// via window.postMessage (the app's useExtensionBridge hook listens for these).
function inject(cards, syncedAt) {
  window.postMessage(
    { __rtaLiveBridge: true, kind: "cards", cards: cards || [], syncedAt: syncedAt || null },
    window.location.origin
  );
}

// Pushed live whenever a new capture arrives.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "cards") inject(msg.cards, msg.syncedAt);
});

// On (re)load of the Command Center tab, pull whatever's already captured.
chrome.runtime.sendMessage({ type: "get-cards" }, (resp) => {
  if (chrome.runtime.lastError) return;
  if (resp && resp.cards && resp.cards.length) inject(resp.cards, resp.lastSyncedAt);
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
  }
});
