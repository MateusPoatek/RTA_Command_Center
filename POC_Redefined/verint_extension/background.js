// background.js — MV3 service worker. Accumulates captured Verint payloads,
// rebuilds CommandCards (parse.js), updates the badge, and pushes cards to an
// open Command Center tab (localhost:5173). All local; nothing leaves the machine.
//
// HARDENING (2026-06-11): MV3 evicts the service worker after ~30s idle, which
// wiped the in-memory state and made the bridge feel "unstable" (popup shows 0,
// Push greyed, no Last Sync after the worker slept). We now:
//  (1) persist the small DERIVED state (cards + sync metadata + probe result) to
//      chrome.storage.SESSION — RAM, cleared on browser close — so it survives a
//      worker eviction WITHOUT writing employee PII to disk. The large raw
//      response bodies stay transient (in-memory only), as before.
//  (2) gate every message on hydration, so a cold-woken worker restores state
//      before answering the popup/CC.
//  (3) add a chrome.alarms heartbeat for the idle case (capture is otherwise
//      interaction-driven — calendar-filter only fires when the RTA pages).
importScripts("parse.js");

// Each entry is { lob, data } — tagged with whichever LOB was ACTIVE AT THE
// MOMENT it was captured (not relabeled later). This is the real account
// boundary: Verint's own calendar/work-resource views are scoped to whatever
// LOB you paged to when you captured them, so the LOB a row belongs to is a
// property of the capture, not something a later `set-lob` can safely
// rewrite. rebuild() below filters to the CURRENT activeLob's own tagged
// entries — switching LOB switches to that LOB's own previously-captured
// data (if any), never someone else's relabeled as yours.
const captures = { calendarFilters: [], workResources: [] }; // transient (raw bodies, PII) — NOT persisted
let latestCards = [];
let latestRoster = [];            // all agents in Verint fixture format (for reconciliation)
let lastSyncedAt = null;          // ISO ts of the last capture (observability)
let captureLog = [];              // metadata only: [{ ts, count }] — no PII
let captureFrequencySeconds = 0;  // hub frequency; also drives the heartbeat alarm
let lastProbeResult = null;       // Floor-View gate probe result (ids/counts only, no PII)
let autoPush = false;             // false = accumulate while paging, push on demand; true = push every capture
let activeLob = "EPIC";           // which account's Verint filter is currently being captured (label only)
let captureProgress = null;       // Full Capture progress: { phase, done, total } — null when idle/never run

// Agent languages (Verint skills) for the Chat alerts. Only accounts listed here
// get a skill scan; the value is the skill-name pattern that counts as a language.
const SKILL_LOOKUP_LOBS = { EPIC_BG: "^TIB EPIC " };
// { [lob]: { map: {workResourceId: "Skill A, Skill B"}, day, scannedAt, skills, error } }
// Kept in chrome.storage.LOCAL so it survives Chrome restarts: ids + skill names
// only, no employee names. One scan per account per local day.
let languages = {};
const LANG_KEY = "rtaLanguages";
let skillScanRequested = null;    // { lob, at } — the scan in flight (one at a time)
const todayStr = () => new Date().toLocaleDateString("en-CA");

// ---- persistence: survive SW eviction without disk PII --------------------
// chrome.storage.session is in-memory (RAM), cleared on browser close. We store
// ONLY the small derived state — never the raw calendarFilters/workResources
// bodies (large + full PII; they stay transient and rebuild on the next capture).
const STATE_KEY = "rtaState";
const HEARTBEAT = "rta-heartbeat";

function snapshot() {
  return { latestCards, latestRoster, lastSyncedAt, captureLog, captureFrequencySeconds, lastProbeResult, autoPush, activeLob, captureProgress };
}
function persist() {
  try {
    chrome.storage.session.set({ [STATE_KEY]: snapshot() }, () => void chrome.runtime.lastError);
  } catch (_) {}
}

let _hydrated = null;
function hydrate() {
  if (_hydrated) return _hydrated;
  _hydrated = new Promise((resolve) => {
    try {
      chrome.storage.session.get(STATE_KEY, (o) => {
        const s = o && o[STATE_KEY];
        if (s) {
          latestCards = s.latestCards || [];
          latestRoster = s.latestRoster || [];
          lastSyncedAt = s.lastSyncedAt || null;
          captureLog = s.captureLog || [];
          captureFrequencySeconds = s.captureFrequencySeconds || 0;
          lastProbeResult = s.lastProbeResult || null;
          autoPush = !!s.autoPush;
          activeLob = s.activeLob || "EPIC";
          captureProgress = s.captureProgress || null;
          // restore the toolbar badge after a cold wake
          try {
            chrome.action.setBadgeText({ text: latestCards.length ? String(latestCards.length) : "" });
            chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
          } catch (_) {}
        }
        chrome.storage.local.get(LANG_KEY, (l) => {
          languages = (l && l[LANG_KEY]) || {};
          resolve();
        });
      });
    } catch (_) {
      resolve();
    }
  });
  return _hydrated;
}

function persistLanguages() {
  try {
    chrome.storage.local.set({ [LANG_KEY]: languages }, () => void chrome.runtime.lastError);
  } catch (_) {}
}

// Ask ONE Verint tab to scan skills for the active account, if it's opted in and
// today's scan hasn't happened yet. force=true (popup button) ignores the day.
function maybeRequestSkillLookup(force) {
  const pattern = SKILL_LOOKUP_LOBS[activeLob];
  if (!pattern) return false;
  const cur = languages[activeLob];
  if (!force && cur && cur.day === todayStr() && !cur.error) return false;
  // One scan at a time; a stuck/failed one may be retried after 10 minutes.
  if (skillScanRequested && Date.now() - skillScanRequested.at < 10 * 60 * 1000) return false;
  skillScanRequested = { lob: activeLob, at: Date.now() };
  chrome.tabs.query({ url: "*://*.verintcloudservices.com/*" }, (tabs) => {
    if (!tabs.length) { skillScanRequested = null; return; }
    chrome.tabs.sendMessage(tabs[0].id, { type: "skill-lookup", pattern }, () => void chrome.runtime.lastError);
  });
  return true;
}
hydrate(); // kick off as soon as the worker spins up

// ---- heartbeat: chrome.alarms (min period 1 min) for the idle case ---------
function applyHeartbeat() {
  try {
    chrome.alarms.clear(HEARTBEAT, () => {
      void chrome.runtime.lastError;
      if (captureFrequencySeconds > 0) {
        const minutes = Math.max(1, Math.round(captureFrequencySeconds / 60)); // MV3 floor is 1 min
        chrome.alarms.create(HEARTBEAT, { periodInMinutes: minutes });
      }
    });
  } catch (_) {}
}
chrome.alarms.onAlarm.addListener((a) => {
  if (!a || a.name !== HEARTBEAT) return;
  hydrate().then(() => {
    // Best-effort: ask the Verint tab to replay its read, then re-push to CC.
    requestRefetch();
    pushToCommandCenter();
  });
});
chrome.runtime.onStartup.addListener(() => hydrate().then(applyHeartbeat));
chrome.runtime.onInstalled.addListener(() => hydrate().then(applyHeartbeat));

// ---------------------------------------------------------------------------

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

// Ask the Verint tab(s) to run a one-pass Full Capture (census + targeted
// pulls, no manual paging) — see inject.js's runFullCapture().
function requestFullCapture() {
  chrome.tabs.query({ url: "*://*.verintcloudservices.com/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "full-capture" }, () => void chrome.runtime.lastError);
    }
  });
}

function pushToCommandCenter() {
  chrome.tabs.query({ url: "http://localhost:5173/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(
        t.id,
        { type: "cards", cards: latestCards, roster: latestRoster, syncedAt: lastSyncedAt, languages: languageMap() },
        () => void chrome.runtime.lastError
      );
    }
  });
}

function languageMap() {
  return (languages[activeLob] && languages[activeLob].map) || {};
}

function rebuild() {
  // Only this LOB's own tagged captures — never another LOB's relabeled.
  const captureData = {
    calendarFilters: captures.calendarFilters.filter((e) => e.lob === activeLob).map((e) => e.data),
    workResources: captures.workResources.filter((e) => e.lob === activeLob).map((e) => e.data),
  };
  try {
    latestCards = self.RTAParse.buildCards(captureData, { lob: activeLob, target: Infinity }); // uncapped
  } catch (e) {
    latestCards = [];
  }
  try {
    latestRoster = self.RTAParse.extractRoster(captureData, { lob: activeLob });
  } catch (e) {
    latestRoster = [];
  }
  // Badge always reflects the live staged count — visible on the toolbar even
  // while the popup is closed (it closes the moment you click the page).
  chrome.action.setBadgeText({ text: latestCards.length ? String(latestCards.length) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
  lastSyncedAt = new Date().toISOString();
  captureLog.unshift({ ts: lastSyncedAt, count: latestCards.length });
  captureLog = captureLog.slice(0, 20); // keep the last 20 captures (metadata only)
  // Only auto-stream to the Command Center when the RTA opted in. By default we
  // ACCUMULATE while paging and push the whole load once (push-now / trigger).
  if (autoPush) pushToCommandCenter();
  persist(); // survive a worker eviction
}

// Hydrate state BEFORE handling any message — a cold-woken worker must restore
// the persisted cards/metadata before answering the popup or Command Center.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  hydrate().then(() => handleMessage(msg || {}, sendResponse));
  return true; // async: keep the channel open until hydration + handling finish
});

function handleMessage(msg, sendResponse) {
  if (msg.type === "verint-response") {
    const kind = classify(msg.url || "");
    if (kind) {
      try {
        const obj = JSON.parse(msg.body);
        if (kind === "cf") captures.calendarFilters.push({ lob: activeLob, data: obj });
        else if (kind === "wr") captures.workResources.push({ lob: activeLob, data: obj });
        rebuild(); // persists
        // A calendar read means the Verint tab has a fresh authenticated request
        // to borrow — the moment to run today's skill scan (no-op if done).
        if (kind === "cf") maybeRequestSkillLookup(false);
      } catch (_) {}
    }
  } else if (msg.type === "languages") {
    // inject.js skill scan result (ids + skill names only) → language map.
    const lob = (skillScanRequested && skillScanRequested.lob) || activeLob;
    skillScanRequested = null;
    if (msg.error) {
      languages[lob] = { ...(languages[lob] || {}), error: msg.error, scannedAt: msg.scannedAt || new Date().toISOString() };
    } else {
      const map = self.RTAParse.buildLanguageMap(msg.bySkill || [], msg.scopeIds || null);
      languages[lob] = { map, day: todayStr(), scannedAt: msg.scannedAt, skills: msg.skills || 0, agents: Object.keys(map).length, error: null };
    }
    persistLanguages();
    if (lob === activeLob && !msg.error) pushToCommandCenter();
  } else if (msg.type === "run-skill-lookup") {
    // Popup "Refresh languages": rescan now, even if today's scan exists.
    skillScanRequested = null;
    sendResponse({ ok: maybeRequestSkillLookup(true), supported: !!SKILL_LOOKUP_LOBS[activeLob] });
  } else if (msg.type === "get-languages") {
    const cur = languages[activeLob] || null;
    sendResponse({
      supported: !!SKILL_LOOKUP_LOBS[activeLob],
      running: !!skillScanRequested,
      agents: cur ? cur.agents || 0 : 0,
      scannedAt: cur ? cur.scannedAt || null : null,
      error: cur ? cur.error || null : null,
    });
  } else if (msg.type === "get-cards") {
    sendResponse({
      cards: latestCards,
      roster: latestRoster,
      // Current LOB's own capture count, not the total across every LOB
      // ever captured this session.
      captured: captures.calendarFilters.filter((e) => e.lob === activeLob).length,
      lastSyncedAt: lastSyncedAt,
      captureLog: captureLog,
      autoPush: autoPush,
      languages: languageMap(),
    });
  } else if (msg.type === "push-now") {
    pushToCommandCenter();
    sendResponse({ ok: true, count: latestCards.length, rosterCount: latestRoster.length });
  } else if (msg.type === "trigger-capture") {
    // Hub "Sync now" / scheduled tick: re-push latest cards + ask Verint to re-fetch.
    pushToCommandCenter();
    requestRefetch();
    sendResponse({ ok: true, count: latestCards.length });
  } else if (msg.type === "run-probe") {
    // Popup "Run gate probe" → tell the Verint tab(s) to run the probe.
    lastProbeResult = null; // clear stale result so the popup polls for the new run
    persist();
    requestProbe();
    sendResponse({ ok: true });
  } else if (msg.type === "probe-result") {
    // inject.js (via content_verint) returns the name-free rows/meta.
    lastProbeResult = { rows: msg.rows || [], meta: msg.meta || null, ts: new Date().toISOString() };
    persist();
    // no response needed
  } else if (msg.type === "get-probe-result") {
    sendResponse(lastProbeResult); // null until a run completes
  } else if (msg.type === "run-full-capture") {
    // Popup "Full Capture" → tell the Verint tab(s) to run the one-pass capture.
    // Real responses stream back as ordinary "verint-response" messages (same
    // path as passive paging), so no separate result-collection is needed here
    // — only progress, for the popup to show while it runs.
    captureProgress = { phase: "starting", done: 0, total: null };
    persist();
    requestFullCapture();
    sendResponse({ ok: true });
  } else if (msg.type === "capture-progress") {
    captureProgress = { phase: msg.phase, done: msg.done, total: msg.total };
    persist();
    // no response needed
  } else if (msg.type === "get-capture-progress") {
    sendResponse(captureProgress); // null until a run has started
  } else if (msg.type === "set-autopush") {
    autoPush = !!msg.on;
    persist();
    if (autoPush) pushToCommandCenter(); // flush the staged load immediately on enable
    sendResponse({ ok: true, autoPush: autoPush });
  } else if (msg.type === "set-frequency") {
    captureFrequencySeconds = Number(msg.seconds) || 0;
    persist();
    applyHeartbeat(); // (re)arm or clear the heartbeat alarm to match
    sendResponse({ ok: true, seconds: captureFrequencySeconds });
  } else if (msg.type === "set-lob") {
    activeLob = (msg.lob || "EPIC").trim() || "EPIC";
    rebuild(); // re-label + re-derive cards/roster from the current capture under the new LOB
    sendResponse({ ok: true, lob: activeLob });
  } else if (msg.type === "get-lob") {
    sendResponse({ lob: activeLob });
  } else if (msg.type === "reset") {
    captures.calendarFilters = [];
    captures.workResources = [];
    latestCards = [];
    chrome.action.setBadgeText({ text: "" });
    persist();
    sendResponse({ ok: true });
  }
}
