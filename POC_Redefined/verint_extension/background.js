// background.js — MV3 service worker. Accumulates captured Verint payloads,
// rebuilds CommandCards (parse.js), updates the badge, and pushes cards to an
// open Command Center tab (localhost:5173). All local; nothing leaves the machine.
importScripts("parse.js");

const captures = { calendarFilters: [], workResources: [] };
let latestCards = [];
let lastSyncedAt = null;          // ISO ts of the last capture (observability)
let captureLog = [];              // metadata only: [{ ts, count }] — no PII
let captureFrequencySeconds = 0;  // hub frequency (page drives the timer in Phase A)
let lastProbeResult = null;       // Floor-View gate probe result (ids/counts only, no PII)

function classify(url) {
  if (url.includes("/api/wfm/main/v2/calendar-filter")) return "cf";
  if (url.includes("/api/wfm/main/v1/work-resources")) return "wr";
  return null;
}

// Ask the Verint tab(s) to replay the calendar-filter request (Phase B re-fetch).
function requestRefetch() {
  chrome.tabs.query({ url: "*://*.verintcloudservices.com/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "refetch" }, () => void chrome.runtime.lastError);
    }
  });
}

// Ask the Verint tab(s) to run the read-only Floor-View gate probe (inject.js).
function requestProbe() {
  chrome.tabs.query({ url: "*://*.verintcloudservices.com/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "probe" }, () => void chrome.runtime.lastError);
    }
  });
}

function pushToCommandCenter() {
  chrome.tabs.query({ url: "http://localhost:5173/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(
        t.id,
        { type: "cards", cards: latestCards, syncedAt: lastSyncedAt },
        () => void chrome.runtime.lastError
      );
    }
  });
}

function rebuild() {
  try {
    latestCards = self.RTAParse.buildCards(
      { calendarFilters: captures.calendarFilters, workResources: captures.workResources },
      { lob: "EPIC", target: 12 }
    );
  } catch (e) {
    latestCards = [];
  }
  chrome.action.setBadgeText({ text: latestCards.length ? String(latestCards.length) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
  lastSyncedAt = new Date().toISOString();
  captureLog.unshift({ ts: lastSyncedAt, count: latestCards.length });
  captureLog = captureLog.slice(0, 20); // keep the last 20 captures (metadata only)
  pushToCommandCenter();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "verint-response") {
    const kind = classify(msg.url || "");
    if (kind) {
      try {
        const obj = JSON.parse(msg.body);
        if (kind === "cf") captures.calendarFilters.push(obj);
        else if (kind === "wr") captures.workResources.push(obj);
        rebuild();
      } catch (_) {}
    }
  } else if (msg.type === "get-cards") {
    sendResponse({
      cards: latestCards,
      captured: captures.calendarFilters.length,
      lastSyncedAt: lastSyncedAt,
      captureLog: captureLog,
    });
  } else if (msg.type === "push-now") {
    pushToCommandCenter();
    sendResponse({ ok: true, count: latestCards.length });
  } else if (msg.type === "trigger-capture") {
    // Hub "Sync now" / scheduled tick. Phase A: re-push latest captured cards.
    // Phase B also asks the Verint tab to re-fetch (requestRefetch, added later).
    pushToCommandCenter();
    if (typeof requestRefetch === "function") requestRefetch();
    sendResponse({ ok: true, count: latestCards.length });
  } else if (msg.type === "run-probe") {
    // Popup "Run gate probe" → tell the Verint tab(s) to run the probe.
    lastProbeResult = null; // clear stale result so the popup polls for the new run
    requestProbe();
    sendResponse({ ok: true });
  } else if (msg.type === "probe-result") {
    // inject.js (via content_verint) returns the name-free rows/meta.
    lastProbeResult = { rows: msg.rows || [], meta: msg.meta || null, ts: new Date().toISOString() };
    // no response needed
  } else if (msg.type === "get-probe-result") {
    sendResponse(lastProbeResult); // null until a run completes
  } else if (msg.type === "set-frequency") {
    captureFrequencySeconds = Number(msg.seconds) || 0; // stored; page drives the timer in Phase A
    sendResponse({ ok: true, seconds: captureFrequencySeconds });
  } else if (msg.type === "reset") {
    captures.calendarFilters = [];
    captures.workResources = [];
    latestCards = [];
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ ok: true });
  }
  return true; // keep the message channel open for async sendResponse
});
