/* ============================================================================
 * floor_probe.js — the Floor View dry-run instrument
 * ----------------------------------------------------------------------------
 * WHAT  A console-pasteable, READ-ONLY probe that answers the one gate question:
 *       "Will Verint accept a workResourceIds set that WE compose — cross-page,
 *        cross-LOB — in a calendar-filter POST?"  (see docs/DRY_RUN_PROTOCOL.md)
 *
 * WHY SELF-CONTAINED  The RTA Live Bridge extension keeps its captured request
 *       (`lastCalReq`) in a private closure — unreachable from the console. So
 *       this probe tees window.fetch ITSELF to (a) capture a real calendar-filter
 *       request to use as a template, and (b) build an {id, org} index from the
 *       response so you can pick IDs for the variants. It does NOT depend on the
 *       extension being loaded.
 *
 * HOW TO USE  (full procedure: dry_run/README.md)
 *       1) Paste this whole file into the DevTools console of the Verint tab.
 *       2) __floorProbe.arm()         // start listening
 *       3) Page / re-filter in Verint so real calendar-filter calls fire.
 *       4) __floorProbe.show()        // see captured template + LOB index (NO names)
 *       5) Run variants in order:
 *            await __floorProbe.v1()                 // pagination (offset=50)
 *            await __floorProbe.v2()                 // arbitrary IDs across 2 pages  ⭐
 *            await __floorProbe.v3()                 // IDs across >=2 LOBs            ⭐
 *            await __floorProbe.v4('<orgName>')      // one whole neighbourhood
 *            await __floorProbe.v5()                 // light health probe (sequential)
 *
 * SAFETY (binding — see DRY_RUN_PROTOCOL.md §Safety rails)
 *       • READ-ONLY: only ever re-issues calendar-filter (a read). Never a write.
 *       • SEQUENTIAL: a hard in-flight lock forbids concurrent requests. No fan-out.
 *       • ABORT ON 5xx: a server error trips a kill-switch that blocks further fires.
 *       • PII NEVER PRINTED: employee names are stripped before any log/dump. The
 *         index keys on numeric id + organizationName only.
 *       • This is "active polling" — coordinate with Dione; low-traffic window.
 * ==========================================================================*/

(function () {
  "use strict";

  const CAL = "/api/wfm/main/v2/calendar-filter";

  // --- shared probe state ---------------------------------------------------
  const probe = {
    template: null, // { url, method, headers, body(string) } — a real captured request
    index: [], // [{ id:Number, org:String }] — built from responses; NO names
    _inFlight: false, // sequential lock: only one request at a time
    _aborted: false, // kill-switch: set true on any 5xx; blocks further fires
    _armed: false, // whether the tees are installed
    _origFetch: null, // saved window.fetch (for firing + restore)
    _origOpen: null, // saved XHR.prototype.open (for restore)
    _origSend: null, // saved XHR.prototype.send (for restore)
    _origSetHdr: null, // saved XHR.prototype.setRequestHeader (for restore)
  };

  // Called whenever we successfully capture a request template, so the operator
  // gets immediate feedback (the whole point of arm() → page → see this line).
  let _announced = false;
  function noteTemplateCaptured(source) {
    if (!_announced) {
      console.log(`%c[floor-probe] ✓ captured a calendar-filter request via ${source} — template ready.`, "color:#2e7d32;font-weight:bold");
      _announced = true;
    }
  }

  // --- helpers --------------------------------------------------------------

  // Parse the request body and locate the calendarFilterCriteria. Verint wraps
  // it JSON:API-style as { data: { attributes: { calendarFilterCriteria } } };
  // we also accept a top-level fallback for robustness. Returns BOTH the full
  // body (to re-serialise) and a reference to the criteria (to mutate in place).
  function parseBody(bodyStr) {
    const body = JSON.parse(bodyStr);
    const criteria =
      (body.data && body.data.attributes && body.data.attributes.calendarFilterCriteria) ||
      body.calendarFilterCriteria;
    if (!criteria) {
      throw new Error("captured body has no calendarFilterCriteria — wrong request?");
    }
    return { body, criteria };
  }

  // The response mirrors the wrapper: data.attributes.{ resourceData, total | calendarFilterCriteria.total }.
  function totalFromResponse(json) {
    const a = ((json || {}).data || {}).attributes || {};
    return a.total ?? (a.calendarFilterCriteria && a.calendarFilterCriteria.total) ?? null;
  }

  // Pull an {id, org} list out of a calendar-filter response — names discarded.
  function indexFromResponse(json) {
    const out = [];
    const rows = ((json.data || {}).attributes || {}).resourceData || [];
    for (const r of rows) {
      const id = Number(r.id);
      const org = (r.workResourceDetails && r.workResourceDetails.organizationName) || "Unknown";
      if (!Number.isNaN(id)) out.push({ id, org });
    }
    return out;
  }

  // Merge new {id,org} rows into the index, de-duping by id.
  function mergeIndex(rows) {
    const seen = new Set(probe.index.map((x) => x.id));
    for (const row of rows) {
      if (!seen.has(row.id)) {
        probe.index.push(row);
        seen.add(row.id);
      }
    }
  }

  // The ONLY function that touches the network. Sequential, timed, sanitised.
  async function fire(label, criteriaMutator) {
    if (probe._aborted) {
      console.warn(`[floor-probe] ABORTED earlier (5xx). Refusing to fire "${label}". Call __floorProbe.reset() to clear.`);
      return null;
    }
    if (probe._inFlight) {
      console.warn(`[floor-probe] a request is already in flight — refusing concurrent fire (sequential-only).`);
      return null;
    }
    if (!probe.template) {
      console.warn(`[floor-probe] no template captured yet. Run __floorProbe.arm() then page/filter in Verint.`);
      return null;
    }

    // Build the mutated body from the captured template (never from scratch).
    // `criteria` is a live reference INTO `body`, so mutating it mutates body.
    const { body, criteria } = parseBody(probe.template.body);
    criteriaMutator(criteria); // caller mutates in place

    probe._inFlight = true;
    const t0 = performance.now();
    let res, json, count, total;
    try {
      // Re-issue through the ORIGINAL fetch when armed (so we don't re-trigger
      // our own capture path); fall back to window.fetch on the manual path.
      // credentials:"include" rides the RTA's own session — the same read the
      // app makes.
      const fetchFn = probe._origFetch || window.fetch;
      res = await fetchFn.call(window, probe.template.url, {
        method: probe.template.method || "POST",
        headers: probe.template.headers,
        body: JSON.stringify(body),
        credentials: "include",
      });
      const dt = Math.round(performance.now() - t0);

      // Abort-on-5xx kill switch.
      if (res.status >= 500) {
        probe._aborted = true;
        console.error(`[floor-probe] ${label}: HTTP ${res.status} (5xx) — KILL SWITCH tripped. No further fires.`);
        return { label, status: res.status, latencyMs: dt };
      }

      json = await res.clone().json().catch(() => null);
      const rows = json ? indexFromResponse(json) : [];
      if (rows.length) mergeIndex(rows); // opportunistically grow the index
      count = rows.length;
      total = json ? totalFromResponse(json) : null;

      // Surface rate-limit signalling if Verint sends it.
      const retryAfter = res.headers.get("retry-after");
      const result = {
        label,
        status: res.status,
        latencyMs: dt,
        returnedCount: count,
        total,
        retryAfter: retryAfter || null,
      };
      console.table([result]);
      if (res.status === 429 || retryAfter) {
        console.warn(`[floor-probe] ${label}: rate-limited (429 / Retry-After=${retryAfter}). Back off; record it.`);
      }
      return result;
    } catch (err) {
      console.error(`[floor-probe] ${label}: network error`, err && err.message);
      return { label, error: String(err && err.message) };
    } finally {
      probe._inFlight = false; // release the sequential lock no matter what
    }
  }

  // Set an explicit employee selection on the criteria. CRITICAL: in the real
  // captured request, workResourceIds + useAllEmployees live INSIDE
  // workResourceWorkspaceCriteria — NOT at the top level of
  // calendarFilterCriteria. We also clear employeeFilterName so a lingering
  // named filter can't override our explicit IDs (we want OUR set to be
  // authoritative — that's the whole point of the gate).
  function setSelection(c, ids) {
    if (!c.workResourceWorkspaceCriteria) c.workResourceWorkspaceCriteria = {};
    const w = c.workResourceWorkspaceCriteria;
    w.useAllEmployees = false;
    w.workResourceIds = ids;
    if ("employeeFilterName" in w) w.employeeFilterName = null;
  }

  // Pick `n` ids from the index, optionally filtered to one org.
  function pickIds(n, org) {
    const pool = org ? probe.index.filter((x) => x.org === org) : probe.index;
    return pool.slice(0, n).map((x) => x.id);
  }

  // Distinct org names currently known.
  function orgs() {
    return [...new Set(probe.index.map((x) => x.org))];
  }

  // --- public API -----------------------------------------------------------

  const api = {
    // Tee BOTH window.fetch AND XMLHttpRequest to capture the next
    // calendar-filter request (as a template) + index its response. Verint may
    // use either transport — the extension's inject.js hooks both for exactly
    // this reason, so we do too. Reversible via disarm(). Read-only.
    arm() {
      if (probe._armed) {
        console.warn("[floor-probe] already armed.");
        return;
      }
      _announced = false;

      // Try to index a response body (string); ignore non-JSON / partials.
      const indexText = (text) => {
        try {
          mergeIndex(indexFromResponse(JSON.parse(text)));
        } catch (_) {}
      };

      // --- fetch tee ---------------------------------------------------------
      // NOTE: if the app captured a reference to window.fetch before we ran,
      // this tee may be bypassed — which is why the XHR hook below (patched on
      // the prototype, robust to reference-capture) is the real workhorse.
      probe._origFetch = window.fetch;
      const origFetch = probe._origFetch;
      window.fetch = async function (...args) {
        const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        const init = args[1] || {};
        if (url.includes(CAL) && init.body != null) {
          probe.template = {
            url,
            method: init.method || "POST",
            headers: init.headers,
            body: typeof init.body === "string" ? init.body : String(init.body),
          };
          noteTemplateCaptured("fetch");
        }
        const res = await origFetch.apply(this, args);
        if (url.includes(CAL)) res.clone().text().then(indexText).catch(() => {});
        return res;
      };

      // --- XHR tee (the robust path) ----------------------------------------
      probe._origOpen = XMLHttpRequest.prototype.open;
      probe._origSend = XMLHttpRequest.prototype.send;
      probe._origSetHdr = XMLHttpRequest.prototype.setRequestHeader;
      const { _origOpen, _origSend, _origSetHdr } = probe;

      XMLHttpRequest.prototype.open = function (method, url) {
        this.__fpMethod = method;
        this.__fpUrl = url;
        this.__fpHeaders = {}; // collect request headers for faithful replay
        return _origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        try {
          if (this.__fpHeaders) this.__fpHeaders[name] = value;
        } catch (_) {}
        return _origSetHdr.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const url = this.__fpUrl || "";
        if (url.includes(CAL) && body != null) {
          probe.template = {
            url,
            method: this.__fpMethod || "POST",
            headers: this.__fpHeaders || undefined,
            body: typeof body === "string" ? body : String(body),
          };
          noteTemplateCaptured("XHR");
        }
        if (url.includes(CAL)) {
          this.addEventListener("load", function () {
            try {
              indexText(this.responseText);
            } catch (_) {}
          });
        }
        return _origSend.apply(this, arguments);
      };

      probe._armed = true;
      console.log("[floor-probe] ARMED (fetch + XHR). Now page / re-filter in Verint — watch for the green ✓ capture line — then call __floorProbe.show().");
    },

    // MANUAL CAPTURE (the iframe-proof path). Grab the real calendar-filter
    // request from the Network tab via "Copy → Copy as fetch", paste it here,
    // and change the leading `fetch(` to `__floorProbe.capture(`. This stores
    // the exact request the browser made — real URL, headers, cookies-by-ref,
    // and body — sidestepping all frame/timing issues. After this, bootstrap
    // the index with two census reads:  await __floorProbe.v1(0); await __floorProbe.v1(50);
    capture(url, opts) {
      opts = opts || {};
      if (!url || !url.includes(CAL)) {
        console.warn("[floor-probe] capture(): that URL isn't a calendar-filter request. Copy the right one.");
        return;
      }
      if (opts.body == null) {
        console.warn("[floor-probe] capture(): no body in the pasted request — make sure it's the POST, not a GET.");
        return;
      }
      probe.template = {
        url,
        method: opts.method || "POST",
        headers: opts.headers || undefined,
        body: typeof opts.body === "string" ? opts.body : String(opts.body),
      };
      probe._origFetch = probe._origFetch || window.fetch; // enable fire() without arm()
      noteTemplateCaptured("manual paste");
      console.log("[floor-probe] template set. Next: await __floorProbe.v1(0); await __floorProbe.v1(50); __floorProbe.show()");
    },

    // Restore fetch + XHR to their originals.
    disarm() {
      if (!probe._armed) return;
      window.fetch = probe._origFetch;
      XMLHttpRequest.prototype.open = probe._origOpen;
      XMLHttpRequest.prototype.send = probe._origSend;
      XMLHttpRequest.prototype.setRequestHeader = probe._origSetHdr;
      probe._origFetch = probe._origOpen = probe._origSend = probe._origSetHdr = null;
      probe._armed = false;
      console.log("[floor-probe] disarmed (fetch + XHR restored).");
    },

    // Sanitised view of what we have. NO names — ids + org counts only.
    show() {
      const byOrg = {};
      for (const { org } of probe.index) byOrg[org] = (byOrg[org] || 0) + 1;
      console.log("[floor-probe] template captured:", !!probe.template);
      console.log("[floor-probe] indexed resources (id+org only):", probe.index.length);
      console.table(Object.entries(byOrg).map(([org, count]) => ({ org, count })));
      return { hasTemplate: !!probe.template, indexed: probe.index.length, orgs: orgs() };
    },

    // V1 — pagination + index bootstrap. Forces a CENSUS read (whole floor
    // page) so it works no matter which calendar-filter you captured, and so
    // its response carries workResourceDetails (org names) to build the index.
    v1(offset = 50) {
      return fire(`V1 census offset=${offset}`, (c) => {
        c.offset = offset;
        if (!c.workResourceWorkspaceCriteria) c.workResourceWorkspaceCriteria = {};
        c.workResourceWorkspaceCriteria.useAllEmployees = true;
        c.workResourceWorkspaceCriteria.workResourceIds = [];
      });
    },

    // V2 — ARBITRARY IDS across two pages (the first ⭐ gate). Picks 5 from the
    // first half of the index and 5 from beyond offset 50, to span census pages.
    v2() {
      const page0 = probe.index.slice(0, 5).map((x) => x.id);
      const page1 = probe.index.slice(50, 55).map((x) => x.id);
      const ids = [...page0, ...page1];
      if (ids.length < 6) {
        console.warn("[floor-probe] V2 needs IDs from 2 pages — index too small. Page further in Verint first.");
      }
      return fire(`V2 arbitrary IDs (n=${ids.length}, cross-page)`, (c) => {
        setSelection(c, ids);
      });
    },

    // V3 — CROSS-LOB set (the second ⭐ gate). Picks IDs from >=2 distinct orgs.
    v3() {
      const distinct = orgs();
      if (distinct.length < 2) {
        console.warn("[floor-probe] V3 needs >=2 LOBs in the index. Capture a broader filter first.");
      }
      const ids = [];
      for (const org of distinct.slice(0, 2)) ids.push(...pickIds(3, org));
      return fire(`V3 cross-LOB IDs (n=${ids.length}, orgs=${distinct.slice(0, 2).length})`, (c) => {
        setSelection(c, ids);
      });
    },

    // V4 — one whole neighbourhood: all IDs (<=50) of a single org.
    v4(org) {
      if (!org) {
        console.warn("[floor-probe] v4 needs an org name. Pick one from __floorProbe.show():", orgs());
        return null;
      }
      const ids = pickIds(50, org);
      return fire(`V4 single-LOB "${org}" (n=${ids.length})`, (c) => {
        setSelection(c, ids);
      });
    },

    // V5 — light health probe: repeat a small targeted pull sequentially with a
    // gap, to characterise latency + surface any rate-limit signalling. NOT a
    // stress test — a handful of calls only.
    async v5(times = 4, gapMs = 3000) {
      const org = orgs()[0];
      const ids = pickIds(10, org);
      const results = [];
      for (let i = 0; i < times; i++) {
        if (probe._aborted) break;
        const r = await fire(`V5 health ${i + 1}/${times}`, (c) => {
          setSelection(c, ids);
        });
        results.push(r);
        if (i < times - 1) await new Promise((res) => setTimeout(res, gapMs));
      }
      console.log("[floor-probe] V5 latency summary:");
      console.table(results);
      return results;
    },

    // Clear the kill-switch / state (does not disarm).
    reset() {
      probe._aborted = false;
      probe._inFlight = false;
      console.log("[floor-probe] state reset (kill-switch cleared).");
    },

    // Escape hatch for inspection (still name-free).
    _state: probe,
  };

  window.__floorProbe = api;
  console.log("[floor-probe] loaded. Start with: __floorProbe.arm()  →  page in Verint  →  __floorProbe.show()");
})();
