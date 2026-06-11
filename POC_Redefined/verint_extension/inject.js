// inject.js — runs in the PAGE's MAIN world on *.verintcloudservices.com.
// Passively tees fetch() and XHR responses so we can read Verint's OWN API data
// (the JSON the calendar SPA downloads to draw itself). READ-ONLY: we observe
// response bodies; we never block, modify, or send anything to Verint.
//
// We only forward the endpoints we care about, to keep noise + memory low.
//
// FLOOR-VIEW GATE PROBE (additive, read-only) — see floor_view/dry_run/EXTENSION_PROBE.md
// + ADR-0005. The probe re-fires body-rewritten COPIES of the captured
// calendar-filter request FROM THIS MAIN-world context (where the session auth
// is valid and the rotating impact360authtoken is fresh), to answer one
// question: will Verint honour a workResourceIds set WE compose (cross-page,
// cross-LOB)? It never writes — it only re-issues the same READ with a
// different employee selection. The console can't do this (wrong frame + stale
// token → 401); inject.js can, because it lives where the app's own calls live.
(function () {
  "use strict";

  const WANTED = [
    "/api/wfm/main/v2/calendar-filter",
    "/api/wfm/main/v1/work-resources",
    "/api/wfm/main/v1/activities",
  ];

  function wanted(url) {
    try {
      return WANTED.some((p) => url.includes(p));
    } catch (_) {
      return false;
    }
  }

  const CAL = "/api/wfm/main/v2/calendar-filter";

  // Name-free {id, org} index, grown from the calendar-filter responses we
  // already observe. Holds ONLY numeric ids + organizationName — never employee
  // names. The probe composes its workResourceIds sets from this.
  const probeIndex = [];
  const _seenIds = new Set();
  function indexFromResponseText(text) {
    try {
      const json = JSON.parse(text);
      const rows = ((json.data || {}).attributes || {}).resourceData || [];
      for (const r of rows) {
        const id = Number(r.id);
        if (Number.isNaN(id) || _seenIds.has(id)) continue;
        const org = (r.workResourceDetails && r.workResourceDetails.organizationName) || "Unknown";
        probeIndex.push({ id, org });
        _seenIds.add(id);
      }
    } catch (_) {}
  }

  function emit(url, status, bodyText) {
    // Hand the captured body to the isolated content script via the DOM.
    window.postMessage(
      { __rtaLiveBridge: true, kind: "verint-response", url, status, body: bodyText },
      window.location.origin
    );
    // Grow the name-free index for the probe (calendar-filter responses only).
    if (url.includes(CAL)) indexFromResponseText(bodyText);
  }

  // Remember the last calendar-filter REQUEST so we can REPLAY it on demand
  // (the "gentle re-fetch" / the probe — same read the app already makes, in
  // the user's session). Captured from BOTH fetch and XHR: the calendar uses
  // XHR, so the XHR branch below is what actually populates this in practice.
  let lastCalReq = null;

  // --- fetch ---------------------------------------------------------------
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const u = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const init = args[1] || {};
      if (u.includes(CAL) && init.body != null) {
        lastCalReq = {
          url: u,
          method: init.method || (typeof args[0] === "object" && args[0].method) || "POST",
          body: typeof init.body === "string" ? init.body : String(init.body),
          headers: init.headers || undefined,
        };
      }
    } catch (_) {}
    const res = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (wanted(url)) {
        res.clone().text().then((t) => emit(url, res.status, t)).catch(() => {});
      }
    } catch (_) {}
    return res;
  };

  // --- XMLHttpRequest ------------------------------------------------------
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setHdr = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__rtaMethod = method;
    this.__rtaUrl = url;
    this.__rtaHeaders = {}; // collected via setRequestHeader, for faithful replay
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (this.__rtaHeaders) this.__rtaHeaders[name] = value;
    } catch (_) {}
    return _setHdr.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    // Capture the calendar-filter REQUEST. The calendar uses XHR, so THIS — not
    // the fetch branch — is what actually populates lastCalReq (incl. the
    // impact360authtoken + x-csrf-* headers needed for an authenticated replay).
    try {
      if ((this.__rtaUrl || "").includes(CAL) && body != null) {
        lastCalReq = {
          url: this.__rtaUrl,
          method: this.__rtaMethod || "POST",
          headers: this.__rtaHeaders || undefined,
          body: typeof body === "string" ? body : String(body),
        };
      }
    } catch (_) {}
    this.addEventListener("load", function () {
      try {
        if (wanted(this.__rtaUrl || "")) {
          emit(this.__rtaUrl, this.status, this.responseText);
        }
      } catch (_) {}
    });
    return _send.apply(this, arguments);
  };

  // Replay the last calendar-filter request through the (wrapped) fetch, so its
  // response is captured normally. Read-only: the same request the app issues.
  function refetch() {
    if (!lastCalReq) return;
    try {
      window.fetch(lastCalReq.url, {
        method: lastCalReq.method || "POST",
        body: lastCalReq.body != null ? lastCalReq.body : undefined,
        headers: lastCalReq.headers,
        credentials: "include",
      });
    } catch (_) {}
  }

  // ====================== FLOOR-VIEW GATE PROBE ============================
  // Read-only. Re-fires body-rewritten COPIES of the captured calendar-filter
  // request, SEQUENTIALLY, from this authenticated MAIN-world context. Reports
  // ids/counts only — never names. Fires through the ORIGINAL fetch (_fetch) so
  // it doesn't recurse through our own tee. See EXTENSION_PROBE.md / ADR-0005.

  const probe = { inFlight: false, aborted: false, running: false };

  // Locate calendarFilterCriteria — Verint wraps it as data.attributes.{...}.
  function parseBody(bodyStr) {
    const body = JSON.parse(bodyStr);
    const criteria =
      (body.data && body.data.attributes && body.data.attributes.calendarFilterCriteria) ||
      body.calendarFilterCriteria;
    if (!criteria) throw new Error("no calendarFilterCriteria in captured body");
    return { body, criteria };
  }
  function respCounts(json) {
    const a = ((json || {}).data || {}).attributes || {};
    const rows = a.resourceData || [];
    const total = (a.total != null ? a.total : (a.calendarFilterCriteria && a.calendarFilterCriteria.total)) ?? null;
    return { returned: rows.length, total };
  }
  // Set an explicit employee selection (INSIDE workResourceWorkspaceCriteria,
  // clearing the named filter so OUR ids are authoritative — that's the gate).
  function setSelection(c, ids) {
    if (!c.workResourceWorkspaceCriteria) c.workResourceWorkspaceCriteria = {};
    const w = c.workResourceWorkspaceCriteria;
    w.useAllEmployees = false;
    w.workResourceIds = ids;
    if ("employeeFilterName" in w) w.employeeFilterName = null;
  }
  function makeCensus(c, offset) {
    c.offset = offset;
    if (!c.workResourceWorkspaceCriteria) c.workResourceWorkspaceCriteria = {};
    c.workResourceWorkspaceCriteria.useAllEmployees = true;
    c.workResourceWorkspaceCriteria.workResourceIds = [];
  }
  function orgsList() {
    return [...new Set(probeIndex.map((x) => x.org))];
  }
  function pickIds(n, org) {
    const pool = org ? probeIndex.filter((x) => x.org === org) : probeIndex;
    return pool.slice(0, n).map((x) => x.id);
  }

  // Fire ONE read. Sequential lock + abort-on-5xx. Returns a name-free row.
  async function probeFire(label, requested, mutate) {
    if (probe.aborted) return { label, requested, note: "skipped (aborted after 5xx)" };
    if (!lastCalReq) return { label, requested, error: "no captured request yet — page the calendar first" };
    if (probe.inFlight) return { label, requested, error: "concurrent fire blocked" };
    probe.inFlight = true;
    const t0 = performance.now();
    try {
      const { body, criteria } = parseBody(lastCalReq.body);
      mutate(criteria);
      const res = await _fetch.call(window, lastCalReq.url, {
        method: lastCalReq.method || "POST",
        headers: lastCalReq.headers,
        body: JSON.stringify(body),
        credentials: "include",
      });
      const latencyMs = Math.round(performance.now() - t0);
      if (res.status >= 500) {
        probe.aborted = true; // kill-switch: no further fires this run
        return { label, requested, status: res.status, latencyMs, returned: 0, note: "5xx — aborting run" };
      }
      const txt = await res.text();
      let json = null;
      try { json = JSON.parse(txt); } catch (_) {}
      const { returned, total } = json ? respCounts(json) : { returned: 0, total: null };
      if (json) indexFromResponseText(txt); // opportunistically grow the index
      const retryAfter = res.headers.get("retry-after");
      return { label, requested, status: res.status, latencyMs, returned, total, retryAfter: retryAfter || null };
    } catch (err) {
      return { label, requested, error: String((err && err.message) || err) };
    } finally {
      probe.inFlight = false;
    }
  }

  const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Run the full V1–V5 gate sequence and post the rows back (no names).
  // RE-ENTRANCY GUARD: if a run is already in progress, ignore the trigger.
  // (A single popup click can fan out to >1 "probe" message; without this guard
  // a second loop runs concurrently, every fire trips the sequential lock, and
  // that all-blocked loop — which only sleeps — finishes first and overwrites
  // the real result. Guarding here means exactly one loop ever runs + posts.)
  async function runProbe() {
    if (probe.running) return;
    probe.running = true;
    probe.aborted = false;
    try {
      const rows = [];
      const gap = 800; // ms between fires — gentle, sequential, never parallel

      // V1 — census pages. Also (re)seeds the index so V2 has cross-page ids.
      rows.push(await probeFire("V1 census offset=0", "page", (c) => makeCensus(c, 0)));
      await _sleep(gap);
      rows.push(await probeFire("V1 census offset=50", "page", (c) => makeCensus(c, 50)));
      await _sleep(gap);

      // V2 — ARBITRARY ids across two census pages (the first ⭐ gate).
      const v2ids = [...probeIndex.slice(0, 5), ...probeIndex.slice(50, 55)].map((x) => x.id);
      rows.push(await probeFire("V2 arbitrary cross-page", v2ids.length, (c) => setSelection(c, v2ids)));
      await _sleep(gap);

      // V3 — ids spanning >=2 LOBs (the second ⭐ gate). Degrades to same-LOB if
      // the filtered view only contains one org (we surface the org count below).
      const distinct = orgsList();
      const v3ids = [];
      for (const org of distinct.slice(0, 2)) v3ids.push(...pickIds(3, org));
      rows.push(await probeFire("V3 cross-LOB", v3ids.length, (c) => setSelection(c, v3ids)));
      await _sleep(gap);

      // V4 — one whole neighbourhood (all ids, <=50, of a single org).
      const v4ids = pickIds(50, distinct[0]);
      rows.push(await probeFire("V4 single-LOB", v4ids.length, (c) => setSelection(c, v4ids)));
      await _sleep(gap);

      // V5 — light health probe: repeat a small pull 3x to characterise latency.
      const v5ids = pickIds(10, distinct[0]);
      for (let i = 0; i < 3; i++) {
        rows.push(await probeFire("V5 health " + (i + 1) + "/3", v5ids.length, (c) => setSelection(c, v5ids)));
        if (i < 2) await _sleep(gap);
      }

      const meta = { indexed: probeIndex.length, orgs: orgsList().length, hadRequest: !!lastCalReq };
      window.postMessage({ __rtaLiveBridge: true, kind: "probe-result", rows, meta }, window.location.origin);
    } finally {
      probe.running = false;
    }
  }

  // Background → content_verint → here: trigger a re-fetch ("Sync now" / timer)
  // or run the gate probe ("Run gate probe" from the popup).
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__rtaLiveBridge !== true) return;
    if (d.kind === "refetch") refetch();
    else if (d.kind === "probe") runProbe();
  });

  // Let the page know the hook is live (debug only).
  window.postMessage({ __rtaLiveBridge: true, kind: "hook-ready" }, window.location.origin);
})();
