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

  // Fallback name source: the SAME calendar-filter payload that drives the
  // violations we're alerting on also carries each employee's name at
  // resourceData[].workResourceDetails.name{first,last} (see
  // VERINT_EXTRACTION_CAPABILITIES.md) — no separate work-resources capture
  // required. Cards were falling back to a bare numeric employee id whenever
  // that separate capture hadn't happened to include this specific employee.
  function nameFromResourceRecord(r) {
    const n = r && r.workResourceDetails && r.workResourceDetails.name;
    if (!n) return null;
    const combined = `${n.last || ""}, ${n.first || ""}`.replace(/^,\s*|,\s*$/g, "").trim();
    return combined || null;
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
    // Raw minutes alongside the percentages — the report's "adherence minutes"
    // stat needs actual minute counts, not just a %, to aggregate across agents.
    return {
      inPct: inPct, outPct: 100 - inPct,
      adherenceMinutes: Math.round(pub - vio), violationMinutes: Math.round(vio),
    };
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

  // Scheduled (PLANNED) shift open/close, from publishedSchedule.events — NOT
  // the actual-worked timeline above. This is the one that exists for EVERY
  // agent regardless of whether they've generated any activity yet: an agent
  // who hasn't started their shift has an EMPTY actualSchedule (so
  // deriveShiftProductive returns no bounds at all), but their
  // publishedSchedule is populated the moment the day's schedule is published.
  // This is the correct source for "has this agent's shift started yet?".
  function deriveScheduledShift(rec) {
    const events = (rec.publishedSchedule && rec.publishedSchedule.events) || [];
    if (!events.length) return null;
    let startT = null, endT = null, startIso = null, endIso = null;
    for (const e of events) {
      const s = e.startTime ? new Date(e.startTime).getTime() : NaN;
      const en = e.endTime ? new Date(e.endTime).getTime() : NaN;
      if (!Number.isNaN(s) && (startT === null || s < startT)) { startT = s; startIso = e.startTime; }
      if (!Number.isNaN(en) && (endT === null || en > endT)) { endT = en; endIso = e.endTime; }
    }
    if (startT === null || endT === null || endT < startT) return null;
    return { scheduledStartIso: startIso, scheduledEndIso: endIso };
  }

  // Precedence-resolved published day. Verified on the 2026-06-04 capture
  // (runs/netcap_20260604T1610360300): a ShiftAssignment container (isPaid
  // unset, precedence 1) holds ShiftEventAssignment activities that override it
  // (paid breaks isPaid:true, unpaid lunch isPaid:false); CalendarEvent
  // (meetings) and TimeOffEvent (precedence 70, planned absence) sit on top.
  // At each instant the highest-precedence event wins. Paid = everything except
  // an explicit isPaid:false and time off; time off is reported apart because
  // the scorecard keeps planned absence inside the base schedule.
  // Full-day totals only — "elapsed so far" is the consumer's job (it knows
  // the current time; a roster can be pushed long after it was parsed).
  function deriveScheduleDetail(rec) {
    const pub = (rec.publishedSchedule && rec.publishedSchedule.events) || [];
    const draft = (rec.draftSchedule && rec.draftSchedule.events) || [];
    const state = pub.length ? "published" : draft.length ? "draft_only" : "none";
    const ev = pub
      .map((e) => ({ s: new Date(e.startTime).getTime(), e: new Date(e.endTime).getTime(), p: Number(e.precedence) || 0, raw: e }))
      .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s);
    const cuts = [...new Set(ev.flatMap((x) => [x.s, x.e]))].sort((a, b) => a - b);
    const out = { state: state, paid: 0, unpaid: 0, off: 0, segments: [] };
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      let w = null;
      for (const x of ev) if (x.s <= a && x.e >= b && (!w || x.p > w.p)) w = x;
      if (!w) continue;
      const unpaid = w.raw.isPaid === false || w.raw.isPaid === "false" || w.raw.isPaid === 0;
      const kind = w.raw.eventType === "TimeOffEvent" ? "off" : unpaid ? "unpaid" : w.raw.eventType === "ShiftAssignment" ? "work" : "paid";
      out[kind === "off" ? "off" : kind === "unpaid" ? "unpaid" : "paid"] += (b - a) / 60000;
      const prev = out.segments[out.segments.length - 1];
      if (prev && prev.e === a && prev.k === kind && prev.a === w.raw.activityId) prev.e = b;
      else out.segments.push({ a: w.raw.activityId, k: kind, s: a, e: b });
    }
    out.paid = Math.round(out.paid); out.unpaid = Math.round(out.unpaid); out.off = Math.round(out.off);
    return out;
  }

  // Next PLANNED activity that starts after now (publishedSchedule), so the
  // dashboard can alert BEFORE a planned change. Label field name on published
  // events is unverified against a live capture — falls back across the names
  // seen elsewhere in this file.
  function deriveNextActivity(rec, nowMs) {
    const events = (rec.publishedSchedule && rec.publishedSchedule.events) || [];
    let best = null, bestT = null;
    for (const e of events) {
      const t = e.startTime ? new Date(e.startTime).getTime() : NaN;
      if (Number.isNaN(t) || t <= nowMs) continue;
      if (bestT === null || t < bestT) { best = e; bestT = t; }
    }
    return best ? { name: best.label || best.activityName || best.plannedActivityName || "", startIso: best.startTime } : null;
  }

  // Intraday hour buckets from the actual-worked timeline (same source as
  // deriveShiftProductive) — for "what hour of the day is busiest" charts.
  // Simplification: each event's FULL duration is bucketed under the hour of
  // its start time (not split across an hour boundary). Events here are
  // typically well under an hour (breaks, tickets, calls), so the rare
  // boundary-spanning event is a small, acceptable approximation rather than
  // worth a more complex interval-splitting algorithm.
  function deriveHourlyBuckets(rec) {
    const events = (rec.actualSchedule && rec.actualSchedule.events) || [];
    const buckets = {};
    for (const e of events) {
      const s = e.startTime ? new Date(e.startTime) : null;
      if (!s || Number.isNaN(s.getTime())) continue;
      const hour = String(s.getHours());
      const m = Number(e.durationMinutes) || 0;
      if (!buckets[hour]) buckets[hour] = { activeMinutes: 0, productiveMinutes: 0 };
      buckets[hour].activeMinutes += m;
      if (flag(e.isPaid)) buckets[hour].productiveMinutes += m;
    }
    return buckets;
  }

  // Full Capture reads the whole floor the Verint user can see (every client). opts.org (a RegExp on the
  // Verint org name) keeps only the account's agents; records without an org name are kept.
  function inOrg(r, org) {
    const name = r.workResourceDetails && r.workResourceDetails.organizationName;
    return !org || !name || org.test(name);
  }

  // captures: { calendarFilter|calendarFilters: <obj>|[<obj>...], workResources: [<obj>...] }
  // opts: { lob, target, snapshotTime, org }
  function buildCards(captures, opts) {
    opts = opts || {};
    const lob = opts.lob || "EPIC";
    const target = opts.target || 15;
    const snapshotTime = opts.snapshotTime || new Date().toISOString();

    const names = namesFromWorkResources(captures.workResources || []);
    let cfs = captures.calendarFilters || captures.calendarFilter || [];
    if (!Array.isArray(cfs)) cfs = [cfs];
    const resourceData = mergeResourceData(cfs).filter((r) => inOrg(r, opts.org));

    const cards = [];
    const perAgent = {};
    for (const r of resourceData) {
      const eid = Number(r.id);
      const name = names[eid] || nameFromResourceRecord(r) || `Agent #${eid}`;
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

  // Format seconds as "H:MM:SS" for Verint fixture compatibility.
  function fmtHms(seconds) {
    const s = Math.abs(Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // Extract ALL agents from captured payloads in Verint fixture row format.
  // Unlike buildCards (OOA-violations only), this covers every agent Verint
  // reported — whether in adherence or not — so the reconciler can join on name.
  //
  // Output rows match verint_normalize.py's RAW_KEYS contract:
  //   { name, scheduled_activity, out_of_adherence, actual_activity,
  //     time_in_activity, days_adherence, shift_start, shift_end,
  //     scheduled_shift_start, scheduled_shift_end, productive_paid_minutes,
  //     productive_work_minutes, adherence_minutes, ooa_minutes,
  //     hourly_buckets_json }
  function extractRoster(captures, opts) {
    opts = opts || {};
    const lob = opts.lob || "EPIC";

    const names = namesFromWorkResources(captures.workResources || []);
    let cfs = captures.calendarFilters || captures.calendarFilter || [];
    if (!Array.isArray(cfs)) cfs = [cfs];
    const resourceData = mergeResourceData(cfs).filter((r) => inOrg(r, opts.org));

    const rows = [];
    for (const r of resourceData) {
      const eid = Number(r.id);
      // Same fallback as buildCards() — the calendar-filter payload already
      // carries the name via workResourceDetails, no separate work-resources
      // capture required. Only truly skip (can't join against GTT without a
      // real name) if NEITHER source resolves one.
      const name = names[eid] || nameFromResourceRecord(r);
      if (!name) continue;

      const adh = deriveAdherence(r);
      const adhPct = adh ? `${adh.inPct}%` : "";
      const sp = deriveShiftProductive(r); // shift_start/end from actualSchedule.events (same helper buildCards uses)
      const sched = deriveScheduledShift(r); // scheduled_shift_start/end from publishedSchedule.events — populated even before the agent has started
      const next = deriveNextActivity(r, Date.now());
      const hourly = deriveHourlyBuckets(r); // per-hour active/productive minutes, for intraday charts
      const sd = deriveScheduleDetail(r); // published vs draft, paid/unpaid/time-off minutes, resolved segments

      // Find the worst (longest) real OOA violation for this agent.
      const violations = (r.adherence && r.adherence.violations) || [];
      const realViolations = violations.filter((v) => {
        const act = ((v.actualEventData || [{}])[0] || {}).label;
        return !NO_ACTUAL.has(act) && act !== v.plannedActivityName;
      });
      realViolations.sort((a, b) =>
        secondsBetween(b.startTime, b.endTime) - secondsBetween(a.startTime, a.endTime)
      );

      let actualActivity = "";
      let scheduledActivity = "";
      let ooaSecs = 0;

      if (realViolations.length > 0) {
        const v = realViolations[0];
        actualActivity = ((v.actualEventData || [{}])[0] || {}).label || "";
        scheduledActivity = v.plannedActivityName || "";
        ooaSecs = secondsBetween(v.startTime, v.endTime);
      } else {
        // In-adherence agent: derive current activity from actual timeline.
        const events = (r.actualSchedule && r.actualSchedule.events) || [];
        if (events.length > 0) {
          const last = events[events.length - 1];
          actualActivity = last.label || last.activityName || "In Schedule";
          scheduledActivity = last.plannedActivityName || "In Schedule";
        } else {
          actualActivity = "In Schedule";
          scheduledActivity = "In Schedule";
        }
        ooaSecs = 0;
      }

      rows.push({
        name: name,
        scheduled_activity: scheduledActivity,
        out_of_adherence: fmtHms(ooaSecs),
        actual_activity: actualActivity,
        time_in_activity: fmtHms(ooaSecs),
        days_adherence: adhPct,
        lob: lob,
        // Verint org leaf the agent belongs to (e.g. "BPO_Global_EPIC_TISV_Player Support") = the real line of business.
        organization: (r.workResourceDetails && r.workResourceDetails.organizationName) || "",
        shift_start: (sp && sp.shiftStartIso) || "",
        shift_end: (sp && sp.shiftEndIso) || "",
        scheduled_shift_start: (sched && sched.scheduledStartIso) || "",
        scheduled_shift_end: (sched && sched.scheduledEndIso) || "",
        next_activity: (next && next.name) || "",
        next_activity_start: (next && next.startIso) || "",
        // Productive minutes so far today (paid vs work — see deriveShiftProductive's
        // note: the "productive" definition is a pending client-contract decision;
        // paid is the safer default). Adherence minutes from the same interval data
        // driving days_adherence, but as raw minutes instead of a percentage.
        productive_paid_minutes: (sp && sp.productivePaidMinutes) || 0,
        productive_work_minutes: (sp && sp.productiveWorkMinutes) || 0,
        adherence_minutes: (adh && adh.adherenceMinutes) || 0,
        ooa_minutes: (adh && adh.violationMinutes) || 0,
        // JSON-encoded — the one nested field in this otherwise-flat row
        // contract. Kept as a string so the existing flat RAW_KEYS pipe
        // doesn't need restructuring for one field; parsed once on the
        // Python side (verint_normalize.py).
        hourly_buckets_json: JSON.stringify(hourly),
        // Schedule detail (deriveScheduleDetail): "published" | "draft_only" | "none",
        // full-day minutes, and the resolved timeline as [{a: activityId, k: work|paid|unpaid|off, s, e}] (epoch ms).
        schedule_state: sd.state,
        published_paid_minutes: sd.paid,
        published_unpaid_minutes: sd.unpaid,
        time_off_minutes: sd.off,
        published_segments_json: JSON.stringify(sd.segments),
      });
    }
    return rows;
  }

  const api = { buildCards, buildCard, extractRoster, deriveScheduleDetail, severityFromOoa, fmtDuration, fmtHms, slug, namesFromWorkResources };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RTAParse = api;
})(typeof self !== "undefined" ? self : this);
