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

  // Crude "richness" of a value: nested array elements + non-null leaves. Used
  // to pick the more-informative value when merging keys across payloads.
  function signal(v) {
    if (v == null) return 0;
    if (Array.isArray(v)) return v.reduce(function (n, x) { return n + 1 + signal(x); }, 0);
    if (typeof v === "object") {
      var n = 0;
      for (var k in v) n += signal(v[k]);
      return n;
    }
    return 1;
  }

  function sumNums(arr) {
    return (arr || []).reduce(function (n, x) { return n + (typeof x === "number" ? x : 0); }, 0);
  }

  // FIELD-LEVEL merge per employee across all calendar-filter payloads. Verint
  // splits a person's data across TWO response shapes: the census shape
  // (workResourceDetails + adherenceSummary + publishedSchedule) and the
  // targeted shape (adherence.violations + actualSchedule.events). Picking one
  // record per id (the old behaviour) silently dropped half the data — e.g. the
  // adherenceSummary we need for adherence %. So we UNION keys per id, keeping
  // the richer value for each.
  function mergeResourceData(calendarFilters) {
    const byId = {};
    for (const cf of calendarFilters) {
      const rd = (cf && cf.data && cf.data.attributes && cf.data.attributes.resourceData) || [];
      for (const r of rd) {
        const id = Number(r.id);
        const cur = byId[id] || { id: id };
        for (const k in r) {
          if (k === "id") continue;
          if (!(k in cur) || signal(r[k]) > signal(cur[k])) cur[k] = r[k];
        }
        byId[id] = cur;
      }
    }
    return Object.values(byId);
  }

  // adherence % from adherenceSummary: in% = (published − violation) / published.
  // Returns null when there's no published schedule (e.g. day off) so callers
  // can fall back instead of showing a misleading 0%.
  function deriveAdherence(rec) {
    const a = rec.adherenceSummary;
    if (!a) return null;
    const pub = sumNums(a.publishedMinutesPerInterval);
    if (pub <= 0) return null;
    const vio = sumNums(a.violationMinutesPerInterval);
    let inPct = Math.round(((pub - vio) / pub) * 100);
    inPct = Math.max(0, Math.min(100, inPct));
    return { inPct: inPct, outPct: 100 - inPct };
  }

  // Normalise a Verint boolean flag — the REST API can serialise booleans as
  // strings ("true"/"false") or 0/1, and raw truthiness would count an explicit
  // "false" as true (inflating productive minutes). Only genuine true passes.
  function flag(v) {
    return v === true || v === "true" || v === 1;
  }

  // Shift open/close + productive minutes from the actual worked timeline.
  // Productive is reported TWO ways (paid vs work) because the exact "productive"
  // definition is a config decision with the team (Evelyn Brooks' ask).
  function deriveShiftProductive(rec) {
    const events = (rec.actualSchedule && rec.actualSchedule.events) || [];
    if (!events.length) return null;
    // Compare by epoch (Date value), NOT lexicographically: ISO strings with
    // mixed UTC offsets (…Z vs …-05:00) do not sort in time order as text.
    let startT = null, endT = null, startIso = null, endIso = null, paid = 0, work = 0;
    for (const e of events) {
      const s = e.startTime ? new Date(e.startTime).getTime() : NaN;
      const en = e.endTime ? new Date(e.endTime).getTime() : NaN;
      if (!Number.isNaN(s) && (startT === null || s < startT)) { startT = s; startIso = e.startTime; }
      if (!Number.isNaN(en) && (endT === null || en > endT)) { endT = en; endIso = e.endTime; }
      const m = Number(e.durationMinutes) || 0;
      if (flag(e.isPaid)) paid += m;
      if (flag(e.isWork)) work += m;
    }
    const out = { productivePaidMinutes: Math.round(paid), productiveWorkMinutes: Math.round(work) };
    // Only emit shift open/close when BOTH bounds are valid — otherwise a
    // missing/unparseable timestamp would render a misleading "Shift 0h 0m".
    if (startT !== null && endT !== null && endT >= startT) {
      out.shiftStartIso = startIso;
      out.shiftEndIso = endIso;
      out.shiftSpanMinutes = Math.round((endT - startT) / 60000);
    }
    return out;
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
      // Per-agent Verint-derived metrics (computed once per employee).
      const adh = deriveAdherence(r);
      const sp = deriveShiftProductive(r);
      const violations = (r.adherence && r.adherence.violations) || [];
      for (const v of violations) {
        const actual = ((v.actualEventData || [{}])[0] || {}).label;
        if (NO_ACTUAL.has(actual)) continue; // no real actual -> skip
        if (actual === v.plannedActivityName) continue; // not a real mismatch
        if ((perAgent[eid] || 0) >= 2) continue; // variety cap per agent
        const card = buildCard({ ...v, employeeId: v.employeeId || eid }, name, lob, snapshotTime);
        // Replace the placeholder agent metrics with REAL Verint-derived values.
        if (adh) { card.agent.adherenceInPercent = adh.inPct; card.agent.adherenceOutPercent = adh.outPct; }
        if (sp) Object.assign(card.agent, sp);
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
