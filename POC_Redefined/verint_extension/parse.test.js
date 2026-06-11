// parse.test.js — golden tests for the LIVE data path (parse.js).
//
// parse.js is the JS twin of the Python verint_calendar_parse + triage +
// card_builder, and it's what the extension actually runs in the RTA's browser.
// It had ZERO tests; this locks the contract:
//   1. card shape matches the CommandCard contract the Command Center expects,
//   2. the 2026-06-11 derivations (adherence% / shift open-close / productive
//      minutes) compute correctly from real Verint field shapes,
//   3. the field-merge unions the census + targeted response shapes per
//      employee (the bug we fixed: keeping one shape dropped adherenceSummary),
//   4. the filters/caps hold (Deleted Timeline, planned==actual, variety cap).
//
// FIXTURE IS SYNTHETIC — invented ids/names, no real employee data.
// RUN:  node --test verint_extension/parse.test.js   (from POC_Redefined/)
//   or: cd verint_extension && node --test parse.test.js

const { test } = require("node:test");
const assert = require("node:assert/strict");
const RTAParse = require("./parse.js");

// --- synthetic capture, in the real calendar-filter wire shape -------------
// Two payloads, exactly as Verint splits them: a CENSUS response (identity +
// adherenceSummary) and a TARGETED response (actualSchedule.events + adherence
// .violations). Same employees appear in BOTH — the parser must merge fields.

const census = {
  data: { attributes: { resourceData: [
    { id: 1001,
      workResourceDetails: { id: 1001, name: { first: "Alpha", last: "Tester" }, organizationName: "BPO_Global_DEMO_Cards" },
      // 600 published, 150 violation -> 75% in-adherence.
      adherenceSummary: { publishedMinutesPerInterval: [600], violationMinutesPerInterval: [150] } },
    { id: 1002,
      workResourceDetails: { id: 1002, name: { first: "Beta", last: "Sample" }, organizationName: "BPO_Global_DEMO_Fraud" },
      // 600 published, 300 violation -> 50% in-adherence.
      adherenceSummary: { publishedMinutesPerInterval: [600], violationMinutesPerInterval: [300] } },
    { id: 1003,
      // present in census for identity only — NO adherenceSummary (day-off-ish);
      // exercises the adherence fallback (should stay 0, not crash).
      workResourceDetails: { id: 1003, name: { first: "Gamma", last: "Empty" }, organizationName: "BPO_Global_DEMO_TLB" } },
  ] } },
};

const targeted = {
  data: { attributes: { resourceData: [
    { id: 1001,
      // shift 14:00->19:00 = 300 min span. paid = 240+30 = 270; work = 240.
      actualSchedule: { events: [
        { activityId: 1, startTime: "2025-05-12T14:00:00Z", endTime: "2025-05-12T18:00:00Z", durationMinutes: 240, isPaid: true, isWork: true },
        { activityId: 2, startTime: "2025-05-12T18:00:00Z", endTime: "2025-05-12T18:30:00Z", durationMinutes: 30, isPaid: true, isWork: false },
        { activityId: 3, startTime: "2025-05-12T18:30:00Z", endTime: "2025-05-12T19:00:00Z", durationMinutes: 30, isPaid: false, isWork: false },
      ] },
      adherence: { violations: [
        // real mismatch -> 20 min OOA -> high
        { employeeId: 1001, plannedActivityName: "Email", startTime: "2025-05-12T15:00:00Z", endTime: "2025-05-12T15:20:00Z", actualEventData: [{ label: "Break" }] },
        // planned == actual -> skipped
        { employeeId: 1001, plannedActivityName: "Email", startTime: "2025-05-12T16:00:00Z", endTime: "2025-05-12T16:10:00Z", actualEventData: [{ label: "Email" }] },
        // Deleted Timeline -> skipped
        { employeeId: 1001, plannedActivityName: "Email", startTime: "2025-05-12T17:00:00Z", endTime: "2025-05-12T17:05:00Z", actualEventData: [{ label: "Deleted Timeline" }] },
      ] } },
    { id: 1002,
      // shift 13:00->17:00 = 240 min. paid = 180+60 = 240; work = 180.
      actualSchedule: { events: [
        { activityId: 1, startTime: "2025-05-12T13:00:00Z", endTime: "2025-05-12T16:00:00Z", durationMinutes: 180, isPaid: true, isWork: true },
        { activityId: 2, startTime: "2025-05-12T16:00:00Z", endTime: "2025-05-12T17:00:00Z", durationMinutes: 60, isPaid: true, isWork: false },
      ] },
      adherence: { violations: [
        { employeeId: 1002, plannedActivityName: "Blended", startTime: "2025-05-12T13:30:00Z", endTime: "2025-05-12T14:00:00Z", actualEventData: [{ label: "Lunch" }] },    // 30m
        { employeeId: 1002, plannedActivityName: "Blended", startTime: "2025-05-12T14:30:00Z", endTime: "2025-05-12T14:40:00Z", actualEventData: [{ label: "Coaching" }] }, // 10m
        { employeeId: 1002, plannedActivityName: "Blended", startTime: "2025-05-12T15:00:00Z", endTime: "2025-05-12T15:05:00Z", actualEventData: [{ label: "Meeting" }] },  // 5m -> dropped by variety cap (>=2)
      ] } },
    { id: 1003,
      // NO actualSchedule (no shift fields), and no adherenceSummary anywhere
      // -> adherence stays at the buildCard default (0), shift fields absent.
      adherence: { violations: [
        { employeeId: 1003, plannedActivityName: "Blended", startTime: "2025-05-12T20:00:00Z", endTime: "2025-05-12T20:08:00Z", actualEventData: [{ label: "TIG Offline" }] }, // 8m
      ] } },
  ] } },
};

const workResources = [
  { data: [
    { id: 1001, attributes: { name: { first: "Alpha", last: "Tester" } } },
    { id: 1002, attributes: { name: { first: "Beta", last: "Sample" } } },
    { id: 1003, attributes: { name: { first: "Gamma", last: "Empty" } } },
  ] },
];

function build() {
  return RTAParse.buildCards(
    { calendarFilters: [census, targeted], workResources },
    { lob: "DEMO", target: 15, snapshotTime: "2026-06-11T12:00:00Z" }
  );
}
const cardFor = (cards, id) => cards.filter((c) => c.agent.id === String(id));

// --------------------------------------------------------------------------

test("emits one card per real violation, after filters + variety cap", () => {
  const cards = build();
  // 1001: 1 (the 2 extra violations are planned==actual and Deleted Timeline)
  // 1002: 2 (3 violations, capped at 2)   1003: 1   => 4 total
  assert.equal(cards.length, 4);
  assert.equal(cardFor(cards, 1001).length, 1, "1001: planned==actual + Deleted Timeline filtered");
  assert.equal(cardFor(cards, 1002).length, 2, "1002: variety cap holds at 2");
  assert.equal(cardFor(cards, 1003).length, 1);
});

test("cards are sorted by OOA duration (desc)", () => {
  const cards = build();
  // 1002-Lunch 30m, 1001-Break 20m, 1002-Coaching 10m, 1003-TIG 8m
  assert.deepEqual(
    cards.map((c) => c.agent.currentStatus),
    ["Lunch", "Break", "Coaching", "TIG Offline"]
  );
});

test("adherence % derived from adherenceSummary ((pub-vio)/pub)", () => {
  const cards = build();
  const a = cardFor(cards, 1001)[0].agent;
  assert.equal(a.adherenceInPercent, 75); // (600-150)/600
  assert.equal(a.adherenceOutPercent, 25);
  const b = cardFor(cards, 1002)[0].agent;
  assert.equal(b.adherenceInPercent, 50); // (600-300)/600
  assert.equal(b.adherenceOutPercent, 50);
});

test("shift open/close + span + productive minutes from actualSchedule.events", () => {
  const a = cardFor(build(), 1001)[0].agent;
  assert.equal(a.shiftStartIso, "2025-05-12T14:00:00Z");
  assert.equal(a.shiftEndIso, "2025-05-12T19:00:00Z");
  assert.equal(a.shiftSpanMinutes, 300);
  assert.equal(a.productivePaidMinutes, 270); // 240 + 30 (the unpaid 30 excluded)
  assert.equal(a.productiveWorkMinutes, 240); // only the isWork block
});

test("field-merge unions census + targeted per employee", () => {
  // The crux: 1001's adherenceSummary is ONLY in the census payload and its
  // actualSchedule.events ONLY in the targeted payload. One merged card must
  // carry BOTH — proving we union fields rather than pick one shape.
  const a = cardFor(build(), 1001)[0].agent;
  assert.ok(a.adherenceInPercent === 75 && a.shiftSpanMinutes === 300,
    "merged card has adherence% (census) AND shift (targeted)");
});

test("fallback: no adherenceSummary -> adherence stays 0, no shift fields", () => {
  const a = cardFor(build(), 1003)[0].agent;
  assert.equal(a.adherenceInPercent, 0);   // buildCard default, not a crash
  assert.equal(a.adherenceOutPercent, 100);
  assert.equal(a.shiftSpanMinutes, undefined);
  assert.equal(a.productivePaidMinutes, undefined);
});

test("severity bands: >=20m high, >=5m medium", () => {
  const cards = build();
  assert.equal(cardFor(cards, 1001)[0].severity, "high");   // 20m
  const b = cardFor(cards, 1002);
  assert.equal(b.find((c) => c.agent.currentStatus === "Lunch").severity, "high");    // 30m
  assert.equal(b.find((c) => c.agent.currentStatus === "Coaching").severity, "medium"); // 10m
});

test("card matches the CommandCard contract (required fields + provenance)", () => {
  const c = cardFor(build(), 1001)[0];
  for (const k of ["id", "lane", "type", "title", "summary", "owner", "status",
    "severity", "dataClass", "confidence", "lob", "agent", "rule",
    "recommendedAction", "availableActions", "targetChannels", "selectedChannel",
    "draftMessage", "auditEvents"]) {
    assert.ok(k in c, `missing field: ${k}`);
  }
  assert.equal(c.lane, "real-time-adherence");
  assert.equal(c.type, "alert");
  assert.equal(c.dataClass, "evidence-backed");
  assert.equal(c.agent.name, "Tester, Alpha"); // joined from workResources
  assert.equal(c.title, "Out-of-adherence: Break");
  assert.match(c.draftMessage, /DEMO alert: Tester, Alpha — Break 20:00/);
  assert.ok(Array.isArray(c.auditEvents) && c.auditEvents.length >= 1);
  assert.equal(c.__ooa, undefined, "internal sort key is stripped from output");
});

test("deterministic: same input -> identical output", () => {
  assert.deepEqual(build(), build());
});

// Build a one-employee capture (census + targeted) for edge-case derivations.
function oneEmployee(events) {
  const census = { data: { attributes: { resourceData: [
    { id: 9001, workResourceDetails: { id: 9001, name: { first: "Edge", last: "Case" }, organizationName: "DEMO" } },
  ] } } };
  const targeted = { data: { attributes: { resourceData: [
    { id: 9001, actualSchedule: { events },
      adherence: { violations: [{ employeeId: 9001, plannedActivityName: "Blended",
        startTime: "2025-05-12T10:00:00Z", endTime: "2025-05-12T10:10:00Z", actualEventData: [{ label: "Break" }] }] } },
  ] } } };
  return RTAParse.buildCards({ calendarFilters: [census, targeted] }, { lob: "DEMO", target: 5 })[0].agent;
}

test("shift open/close uses Date value, not lexicographic ISO (mixed UTC offsets)", () => {
  // A: 09:00Z .. 16:00-05:00 (=21:00Z);  B: 08:00-05:00 (=13:00Z) .. 20:00Z.
  // Temporal min-start and max-end are both A; lexicographic text-sort would
  // wrongly pick B for both. Also: string "false" flags must not count.
  const a = oneEmployee([
    { activityId: 1, startTime: "2025-05-12T09:00:00Z", endTime: "2025-05-12T16:00:00-05:00", durationMinutes: 100, isPaid: true, isWork: true },
    { activityId: 2, startTime: "2025-05-12T08:00:00-05:00", endTime: "2025-05-12T20:00:00Z", durationMinutes: 50, isPaid: "false", isWork: "false" },
  ]);
  assert.equal(a.shiftStartIso, "2025-05-12T09:00:00Z");
  assert.equal(a.shiftEndIso, "2025-05-12T16:00:00-05:00");
  assert.equal(a.shiftSpanMinutes, 720); // 09:00Z -> 21:00Z = 12h
  assert.equal(a.productivePaidMinutes, 100); // the "false" string excluded
  assert.equal(a.productiveWorkMinutes, 100);
});

test("events without timestamps -> productive set, shift fields omitted (no 0h0m)", () => {
  const a = oneEmployee([{ activityId: 1, durationMinutes: 120, isPaid: true, isWork: true }]);
  assert.equal(a.productivePaidMinutes, 120);
  assert.equal(a.shiftStartIso, undefined);
  assert.equal(a.shiftSpanMinutes, undefined, "no misleading 0h 0m when bounds absent");
});

test("empty / malformed captures don't throw", () => {
  assert.deepEqual(RTAParse.buildCards({ calendarFilters: [] }, { lob: "DEMO" }), []);
  assert.deepEqual(RTAParse.buildCards({}, {}), []);
  assert.deepEqual(RTAParse.buildCards({ calendarFilters: [{}] }, {}), []);
});
