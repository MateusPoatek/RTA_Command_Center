// parse.js — Verint calendar-filter payload -> CommandCard[] (client-side).
//
// Faithful JS port of the Python path (verint_calendar_parse + verint_triage +
// card_builder): consume Verint's OWN adherence verdict (resourceData[].adherence
// .violations) and emit cards matching the Command Center CommandCard contract
// (dataClass "evidence-backed"). Deterministic, no network.
//
// Works in the extension (window.RTAParse) and under node (module.exports) for
// testing against captured fixtures.
(function (root) {
  "use strict";

  // Verint marks segments with no recorded actual as "Deleted Timeline" — not a
  // real worked activity, so not a meaningful adherence alert.
  const NO_ACTUAL = new Set(["Deleted Timeline", "", null, undefined]);

  const HIGH_OOA = 20 * 60; // >= 20 min -> high
  const MED_OOA = 5 * 60; //  >= 5 min  -> medium ; else low

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function secondsBetween(startIso, endIso) {
    return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 1000));
  }

  function fmtDuration(seconds) {
    const s = Math.abs(seconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function severityFromOoa(ooa) {
    if (ooa >= HIGH_OOA) return "high";
    if (ooa >= MED_OOA) return "medium";
    return "low";
  }

  function namesFromWorkResources(workResources) {
    const names = {};
    for (const obj of workResources || []) {
      for (const r of (obj && obj.data) || []) {
        const n = (r.attributes && r.attributes.name) || {};
        names[Number(r.id)] = `${n.last || ""}, ${n.first || ""}`.replace(/^,\s*|,\s*$/g, "").trim();
      }
    }
    return names;
  }

  function buildCard(v, name, lob, snapshotTime) {
    const actual = ((v.actualEventData || [{}])[0] || {}).label || "Unknown";
    const planned = v.plannedActivityName || "Unknown";
    const ooa = secondsBetween(v.startTime, v.endTime);
    const severity = severityFromOoa(ooa);
    const ruleId = `verint_ooa_${slug(actual)}`;
    const eid = v.employeeId;
    const cardId = `live-c1-${eid}-${ruleId}`;
    const title = `Out-of-adherence: ${actual}`;
    return {
      id: cardId,
      lane: "real-time-adherence",
      type: "alert",
      title: title,
      summary: `${name} (${lob}) — scheduled ${planned} but currently in ${actual}.`,
      owner: "shared",
      status: "needs-review",
      severity: severity,
      dataClass: "evidence-backed",
      source: {
        dataClass: "evidence-backed",
        label: `Live Verint browser extension | LOB ${lob} | rule: ${ruleId}`,
        detail:
          "Captured in-browser from Verint's calendar-filter API " +
          "(adherence.violations) by the RTA Live Bridge extension; parsed " +
          "client-side. No connectors, no Citrix, no GScripts.",
        artifact: `live-extension capture | employee ${eid}`,
      },
      confidence: 0.74,
      lob: lob,
      geo: "Unknown",
      agent: {
        name: name,
        id: String(eid),
        lob: lob,
        geo: "Unknown",
        currentStatus: actual,
        scheduledActivity: planned,
        adherenceInPercent: 0,
        adherenceOutPercent: 100,
        coachingSessionsThisWeek: 0,
        huddlesThisWeek: 0,
        openTickets: 0,
        recommendedAction:
          "Review and send alert to LOB channel. Suppress if a known exception applies.",
        schedulePreview: [`Today: ${planned}`, "Tomorrow: —", "Next week: schedule TBD"],
      },
      rule: { id: ruleId, description: title, threshold: "Verint OOA" },
      recommendedAction:
        "Review and send alert to LOB channel. Suppress if a known exception applies.",
      availableActions: [
        "approve-send", "edit-message", "suppress",
        "add-to-handoff", "ask-ai-why", "teach-ai-correct-rule",
      ],
      targetChannels: ["google-chat-lob", "supervisor", "audit-only"],
      selectedChannel: "google-chat-lob",
      draftMessage: `${lob} alert: ${name} — ${actual} ${fmtDuration(ooa)} (scheduled: ${planned}). Please check.`,
      auditEvents: [
        {
          id: `audit-${cardId}-created`,
          timestamp: snapshotTime,
          actor: "ai",
          action: "Card created by live extension capture",
          detail: `Rule: ${ruleId} | Duration: ${ooa}s | Cycle: 1`,
          dataClass: "evidence-backed",
        },
      ],
    };
  }

  // Merge resourceData across one or more calendar-filter payloads, keeping the
  // richest entry per employee (the post-filter response has the real data; an
  // earlier/empty one must not clobber it).
  function mergeResourceData(calendarFilters) {
    const byId = {};
    for (const cf of calendarFilters) {
      const rd = (cf && cf.data && cf.data.attributes && cf.data.attributes.resourceData) || [];
      for (const r of rd) {
        const id = Number(r.id);
        const score =
          ((r.adherence && r.adherence.violations) || []).length +
          ((r.actualSchedule && r.actualSchedule.events) || []).length;
        const prev = byId[id];
        if (!prev || score > prev.__score) byId[id] = Object.assign({ __score: score }, r);
      }
    }
    return Object.values(byId);
  }

  // captures: { calendarFilter|calendarFilters: <obj>|[<obj>...], workResources: [<obj>...] }
  // opts: { lob, target, snapshotTime }
  function buildCards(captures, opts) {
    opts = opts || {};
    const lob = opts.lob || "EPIC";
    const target = opts.target || 15;
    const snapshotTime = opts.snapshotTime || new Date().toISOString();

    const names = namesFromWorkResources(captures.workResources || []);
    let cfs = captures.calendarFilters || captures.calendarFilter || [];
    if (!Array.isArray(cfs)) cfs = [cfs];
    const resourceData = mergeResourceData(cfs);

    const cards = [];
    const perAgent = {};
    for (const r of resourceData) {
      const eid = Number(r.id);
      const name = names[eid] || String(eid);
      const violations = (r.adherence && r.adherence.violations) || [];
      for (const v of violations) {
        const actual = ((v.actualEventData || [{}])[0] || {}).label;
        if (NO_ACTUAL.has(actual)) continue; // no real actual -> skip
        if (actual === v.plannedActivityName) continue; // not a real mismatch
        if ((perAgent[eid] || 0) >= 2) continue; // variety cap per agent
        const card = buildCard({ ...v, employeeId: v.employeeId || eid }, name, lob, snapshotTime);
        card.__ooa = secondsBetween(v.startTime, v.endTime); // sort key (stripped later)
        cards.push(card);
        perAgent[eid] = (perAgent[eid] || 0) + 1;
      }
    }

    // Sort by impact, cap, ensure unique ids, strip sort key.
    cards.sort((a, b) => b.__ooa - a.__ooa);
    const seen = {};
    const out = [];
    for (const c of cards.slice(0, target)) {
      delete c.__ooa;
      if (seen[c.id] != null) {
        seen[c.id] += 1;
        c.id = `${c.id}-${seen[c.id]}`;
      } else {
        seen[c.id] = 0;
      }
      out.push(c);
    }
    return out;
  }

  const api = { buildCards, buildCard, severityFromOoa, fmtDuration, slug, namesFromWorkResources };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RTAParse = api;
})(typeof self !== "undefined" ? self : this);
