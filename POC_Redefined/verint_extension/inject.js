// inject.js — runs in the PAGE's MAIN world on *.verintcloudservices.com.
// Passively tees fetch() and XHR responses so we can read Verint's OWN API data
// (the JSON the calendar SPA downloads to draw itself). READ-ONLY: we observe
// response bodies; we never block, modify, or send anything to Verint.
//
// We only forward the endpoints we care about, to keep noise + memory low.
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

  function emit(url, status, bodyText) {
    // Hand the captured body to the isolated content script via the DOM.
    window.postMessage(
      { __rtaLiveBridge: true, kind: "verint-response", url, status, body: bodyText },
      window.location.origin
    );
  }

  // Remember the last calendar-filter REQUEST so we can REPLAY it on demand
  // (the "gentle re-fetch" — same read the app already makes, in the user's
  // session). This is how a timer / "Sync now" gets genuinely fresh data.
  const CAL = "/api/wfm/main/v2/calendar-filter";
  let lastCalReq = null;

  // --- fetch ---------------------------------------------------------------
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const u = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const init = args[1] || {};
      if (u.includes(CAL)) {
        lastCalReq = {
          url: u,
          method: init.method || (typeof args[0] === "object" && args[0].method) || "GET",
          body: init.body != null ? init.body : null,
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
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__rtaUrl = url;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
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
        method: lastCalReq.method || "GET",
        body: lastCalReq.body != null ? lastCalReq.body : undefined,
        headers: lastCalReq.headers,
        credentials: "include",
      });
    } catch (_) {}
  }

  // Background → content_verint → here: trigger a re-fetch ("Sync now" / timer).
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (d && d.__rtaLiveBridge === true && d.kind === "refetch") refetch();
  });

  // Let the page know the hook is live (debug only).
  window.postMessage({ __rtaLiveBridge: true, kind: "hook-ready" }, window.location.origin);
})();
