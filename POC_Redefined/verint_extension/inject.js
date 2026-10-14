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
    // Clear any named account filter so the census is GENUINELY the whole floor
    // — otherwise the index (and the cross-page/cross-LOB claim of V2/V3) could
    // be silently constrained to the filtered cohort.
    if ("employeeFilterName" in c.workResourceWorkspaceCriteria) {
      c.workResourceWorkspaceCriteria.employeeFilterName = null;
    }
  }
  function orgsList() {
    return [...new Set(probeIndex.map((x) => x.org))];
  }
  function pickIds(n, org) {
    const pool = org ? probeIndex.filter((x) => x.org === org) : probeIndex;
    return pool.slice(0, n).map((x) => x.id);
  }

  // Fire ONE read. Sequential lock + abort-on-5xx. Returns a name-free row.
  // opts.emitFull: also hand the REAL response body to emit() — this is what
  // lets Full Capture (below) feed the same read into the real capture
  // pipeline (captures.calendarFilters → rebuild()), not just a count.
  async function probeFire(label, requested, mutate, opts) {
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
      if (opts && opts.emitFull) emit(lastCalReq.url, res.status, txt);
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
    if (probe.running || capture.running) return;
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

  // ====================== FULL CAPTURE (one pass, no paging) ===============
  // Read-only. Same primitive as the gate probe above (self-composed,
  // sequential, authenticated reads) but instead of summarising to counts, it
  // feeds every real response through emit() — the same hook the passive tee
  // uses — so it lands in the actual capture pipeline (captures.calendarFilters
  // → rebuild()) exactly as if the RTA had paged to see it. This is what
  // replaces "page through the calendar every few minutes" with one click.
  //
  // This is ACTIVE POLLING (ADR-0004/0005) at real-capture scale, not the
  // gate's ~10-call diagnostic burst — coordinate with governance/Dione before
  // running this against a live account's tenant (see ACCOUNT_ONBOARDING_PLAN.md).
  //
  // Longer-term: this is a bridge, not the final architecture. The real fix is
  // server-side Verint API access (Track B, SERVER_SIDE_ARCHITECTURE.md), which
  // removes the browser/extension dependency entirely once credentials land.

  const capture = { running: false };

  function postProgress(phase, done, total) {
    window.postMessage(
      { __rtaLiveBridge: true, kind: "capture-progress", phase, done, total },
      window.location.origin
    );
  }

  async function runFullCapture() {
    if (capture.running || probe.running) return;
    capture.running = true;
    probe.aborted = false;
    const gap = 800; // ms between fires — same gentle, sequential cadence as the gate probe
    try {
      // Census phase: page until Verint returns a short (< 50) page. Bounded
      // implicitly by whatever date-view (day vs. multi-week) was on screen
      // when lastCalReq was captured — keep the calendar on a 1-day view
      // before triggering this (see VERINT_EXTRACTION_CAPABILITIES.md F1).
      let offset = 0;
      let page = 0;
      while (true) {
        page++;
        postProgress("census", page, null);
        const row = await probeFire(
          `census offset=${offset}`,
          "page",
          (c) => makeCensus(c, offset),
          { emitFull: true }
        );
        if (probe.aborted || row.error) {
          postProgress("aborted", page, null);
          return;
        }
        if ((row.returned || 0) < 50) break; // last page
        offset += 50;
        await _sleep(gap);
      }

      // Targeted phase: chunk every indexed id (built during census, above)
      // into groups of 50 — the same neighbourhood size already proven live
      // (ADR-0003 V4) — and pull the adherence/schedule detail per chunk.
      const allIds = probeIndex.map((x) => x.id);
      const chunks = [];
      for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));

      for (let i = 0; i < chunks.length; i++) {
        await _sleep(gap);
        postProgress("targeted", i + 1, chunks.length);
        const row = await probeFire(
          `targeted chunk ${i + 1}/${chunks.length}`,
          chunks[i].length,
          (c) => setSelection(c, chunks[i]),
          { emitFull: true }
        );
        if (probe.aborted || row.error) {
          postProgress("aborted", i + 1, chunks.length);
          return;
        }
      }
      postProgress("done", chunks.length, chunks.length);
    } finally {
      capture.running = false;
    }
  }

  // ====================== SKILL LOOKUP (agent languages) ===================
  // Verint has no read endpoint that returns an employee's skills (probed
  // 2026-10-14: calendar-filter, work-resources and their includes don't carry
  // them; skill filters on /api/wfm 500). The only way is the one the UI uses:
  // a saved employee filter with wfmInfo.skill, evaluated by
  // work-resource-filter-set. So this scan WRITES to exactly one filter that
  // the extension owns — SKILL_FILTER — and never to any other (the RTA's
  // "Last unsaved filter" is only ever READ, as the scope). Sequential, one
  // request at a time, stops on the first non-2xx. Posts ids + skill names
  // only (no employee names); background.js turns them into the language map.
  const SKILL_FILTER = "RTA_Skill_Lookup";
  const CORE = "/wfo/rest/core-api/empfilter/";
  const FILTER_SET = "/api/wfm/main/v1/work-resource-filter-set";
  const skillScan = { running: false };

  function coreHeaders() {
    const h = lastCalReq.headers || {};
    const pick = (name) => h[name] || h[name.toLowerCase()];
    const out = { "Content-Type": "application/json", Accept: "application/json" };
    for (const k of ["Impact360AuthToken", "X-CSRF-Header", "X-CSRF-Login"]) if (pick(k)) out[k] = pick(k);
    return out;
  }

  async function runSkillLookup(pattern) {
    if (skillScan.running || capture.running || probe.running) return;
    if (!lastCalReq) {
      window.postMessage({ __rtaLiveBridge: true, kind: "languages", error: "no captured request yet — page the calendar first" }, window.location.origin);
      return;
    }
    skillScan.running = true;
    const post = (extra) =>
      window.postMessage({ __rtaLiveBridge: true, kind: "languages", scannedAt: new Date().toISOString(), ...extra }, window.location.origin);
    const fail = (where, status) => { post({ error: `${where} → HTTP ${status}` }); };
    try {
      const re = new RegExp(pattern || "^TIB EPIC ", "i");
      const ws = parseBody(lastCalReq.body).criteria.workResourceWorkspaceCriteria || {};
      const scopeFilter = ws.employeeFilterName || "Last_Unsaved_Filter";
      const evalFilter = async (filterName) => {
        const body = { data: { type: "v1/work-resource-filter-set", attributes: {
          start: ws.startTime, end: ws.endTime, workResourceIds: [],
          useAllEmployees: true, useAllPoolers: false, useAllPhantoms: false, filterName } } };
        const r = await _fetch.call(window, FILTER_SET, { method: "POST", credentials: "include", headers: lastCalReq.headers, body: JSON.stringify(body) });
        if (!r.ok) return { status: r.status };
        const a = ((await r.json()).data || {}).attributes || {};
        return { status: r.status, ids: (a.workResourceEntities || []).map((e) => String(e.id)) };
      };
      const core = (path, method, body) =>
        _fetch.call(window, CORE + path + (path.includes("?") ? "&" : "?") + "_dc=" + Date.now(), {
          method, credentials: "include", headers: coreHeaders(), body: body ? JSON.stringify(body) : undefined });

      // 1. Skill catalogue (names + ids) from the filter metadata.
      const g = await core("get?filterName=Last_Unsaved_Filter", "GET");
      if (!g.ok) return fail("empfilter/get", g.status);
      const skills = (((await g.json()).empFilter || {}).wfmInfo || {}).skillList || [];
      const wanted = skills.filter((s) => re.test(s.name || ""));
      if (!wanted.length) return post({ bySkill: [], scopeIds: [], skills: 0 });

      // 2. Scope = the agents in the RTA's own filter (read only).
      const scope = await evalFilter(scopeFilter);
      if (!scope.ids) return fail("filter-set(scope)", scope.status);

      // 3. Make sure our own filter exists (create once, never anything else).
      const n = await core("filterNames?page=1&start=0&limit=100", "GET");
      if (!n.ok) return fail("empfilter/filterNames", n.status);
      const exists = ((await n.json()).ArrayList || []).some((f) => f.filterName === SKILL_FILTER || f.id === SKILL_FILTER);
      if (!exists) {
        const a = await core("add", "POST", { name: SKILL_FILTER, wfmInfo: { skill: String(wanted[0].id) } });
        if (!a.ok) return fail("empfilter/add", a.status);
      }

      // 4. One skill at a time: point our filter at it, evaluate, record ids.
      const bySkill = [];
      for (let i = 0; i < wanted.length; i++) {
        const s = wanted[i];
        const u = await core("update", "POST", { id: SKILL_FILTER, name: SKILL_FILTER, wfmInfo: { skill: String(s.id) } });
        if (!u.ok) return fail("empfilter/update", u.status);
        const ev = await evalFilter(SKILL_FILTER);
        if (!ev.ids) return fail("filter-set(" + s.name + ")", ev.status);
        bySkill.push({ name: s.name, ids: ev.ids });
        window.postMessage({ __rtaLiveBridge: true, kind: "capture-progress", phase: "languages", done: i + 1, total: wanted.length }, window.location.origin);
        await _sleep(400);
      }
      post({ bySkill, scopeIds: scope.ids, skills: wanted.length });
    } catch (err) {
      post({ error: String((err && err.message) || err) });
    } finally {
      skillScan.running = false;
    }
  }

  // Background → content_verint → here: trigger a re-fetch ("Sync now" / timer),
  // run the gate probe ("Run gate probe"), or run a full one-pass capture
  // ("Full Capture") from the popup.
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__rtaLiveBridge !== true) return;
    if (d.kind === "refetch") refetch();
    else if (d.kind === "probe") runProbe();
    else if (d.kind === "full-capture") runFullCapture();
    else if (d.kind === "skill-lookup") runSkillLookup(d.pattern);
  });

  // Let the page know the hook is live (debug only).
  window.postMessage({ __rtaLiveBridge: true, kind: "hook-ready" }, window.location.origin);
})();
