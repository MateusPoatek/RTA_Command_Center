// npm run check — asserts the board rules and the report's provenance statuses
// against the fixture scenarios (each fixture agent exists to exercise one rule).
import assert from "node:assert";
import { makeFixtures } from "../src/data/fixtures";
import { buildBoard, cfgFor, escalationLevel } from "../src/domain/exceptions";
import { composeReport } from "../src/domain/report";
import { computeKpis } from "../src/domain/kpis";
import { looseNameMatch } from "../src/domain/join";
import { summarizeTeams } from "../src/domain/exceptions";
import type { Exception } from "../src/domain/exceptions";
import { activity, displayName, lobLabel, sentence } from "../src/domain/wording";
import { analyzeDay } from "../src/domain/timeline";

const now = Date.parse("2026-10-09T15:00:00Z");
const d = makeFixtures(now);
const b = buildBoard(d, now);
const ex = (n: string) => b.exceptions.find((e) => e.agent.startsWith(n));

// Alert rules v1 — docs/ALERT_RULES.md
assert.equal(ex("Soto")?.sev, 1);                 // A2: 38 min on Lunch
assert.equal(ex("Mejia")?.sev, 3);                // A2: 12 min coaching -> board only
assert.equal(ex("Castro"), undefined);            // 3 min < 5 min buffer
assert.equal(ex("Flores")?.kind, "no-clock-in");
assert.equal(ex("Flores")?.sev, 1);               // A1: 14 min late
assert.equal(ex("Duran")?.sev, 2);                // A1: 5 min late
assert.deepStrictEqual([ex("Benitez")?.kind, ex("Benitez")?.sev, ex("Benitez")?.also], ["break-overrun", 2, ["ooa"]]); // A3 wins over A2, one card
assert.deepStrictEqual([ex("Menjivar")?.kind, ex("Menjivar")?.minutes], ["no-clock-out", 20]); // A4
assert.equal(ex("Henriquez"), undefined);         // clocked out properly
assert.deepStrictEqual([ex("Guardado")?.sev, ex("Guardado")?.repeat], [2, 3]); // 7 min = Sev 3, 3rd episode -> Sev 2
assert.deepStrictEqual(b.unmapped.map((u) => u.label), ["EPIC_Special Project"]); // A6
assert.equal(ex("Zelaya")?.sev, 3);               // unmapped label still evaluated as OOA
assert.deepStrictEqual(b.incidents, [{ lob: "EPIC - Payments", agents: 5, of: 8 }]); // A5
assert.ok(b.exceptions.filter((e) => e.lob === "EPIC - Payments").every((e) => e.incident));
assert.ok(!b.exceptions.some((e) => e.lob !== "EPIC - Payments" && e.incident));
assert.deepStrictEqual(b.suppressed.map((s) => s.agent.split(" ")[0]).sort(), ["Aguilar", "Portillo"]); // PTO + trainee
assert.ok(b.exceptions.every((e, i, a) => i === 0 || a[i - 1].sev < e.sev || (a[i - 1].sev === e.sev && a[i - 1].minutes >= e.minutes)));
const quiet = buildBoard(d, now, new Set(["EPIC - Payments"]));         // RTA declares a known outage
assert.deepStrictEqual([quiet.incidents.length, quiet.suppressed.length], [0, 2 + 8]);
const epic = cfgFor("EPIC - Tickets"), t0 = now;
assert.deepStrictEqual([4, 6, 16].map((m) => escalationLevel(epic, t0, t0 + m * 60000)), [0, 1, 2]);
assert.equal(escalationLevel(cfgFor("OTHER - X"), t0, t0 + 60 * 60000), 0); // escalation is per-account opt-in

const r = composeReport(d, now);
const ln = (n: string) => r.lines.find((l) => l.name.startsWith(n))!;
assert.equal(ln("Ramos").shiftStart.status, "ok");         // GTT + Verint agree
assert.equal(ln("Navarro").shiftStart.status, "conflict"); // 40 min apart
assert.equal(ln("Quiroz").shiftStart.status, "unverified");// Verint only
assert.equal(ln("Aguilar").attendance.status, "ok");       // explained by Workday
assert.equal(ln("Aguilar").passed, ln("Aguilar").total);   // approved absence is not a provenance failure
assert.equal(ln("Flores").attendance.status, "conflict");  // unexplained absence
assert.equal(ln("Ramos").shiftStart.provs.length, 2);      // two sources recorded
assert.ok(r.lobs.every((l) => l.confidence >= 0 && l.confidence <= 100));
// planned-vs-actual: Soto spent the last 38 min on Lunch instead of work (180 min elapsed)
const soto = d.verint.find((a) => a.name.startsWith("Soto"))!;
const day = analyzeDay(soto.planned!, soto.actual!, now);
assert.equal(day.ooaMin, 38);
assert.equal(day.plannedWorkMin, 165); // work 0-120 + 135-180
assert.equal(day.productiveMin, 127);  // 165 - 38
assert.deepStrictEqual([day.ooa.length, day.ooa[0].actual, day.ooa[0].planned], [1, "Lunch", "EPIC_New ticket"]);
const ramos = analyzeDay(d.verint[0].planned!, d.verint[0].actual!, now);
assert.equal(ramos.ooaMin, 0);
assert.equal(ramos.productiveMin, ramos.plannedWorkMin);
// the report's productive cell uses the derived value, with its provenance recorded
assert.match(ln("Soto").productive.provs[0].field, /derived/);
// headline numbers: 37 agents − 1 trainee − 2 unpublished = 34 due; 1 approved PTO -> 33 expected; 7 not clocked in
const k = computeKpis(d, now, b);
assert.deepStrictEqual([k.attendance.present, k.attendance.expected, k.attendance.approved, k.attendance.pct], [26, 33, 1, 78.8]);
assert.equal(k.adherence.outMin, 38 + 38 + 12 + 12 + 3 + 15 + 6 + 21); // every started agent's OOA today
assert.equal(k.shrink.absenceMin, 14 + 5 + 5 * 12 + 20);                 // late + site-down + approved PTO, elapsed scheduled min
assert.deepStrictEqual([k.violation?.label, k.violation?.count], ["Not clocked in", 7]);
// unpublished schedules are excluded from every number, not just shrinkage: same result as if they did not exist
assert.equal(k.unpublished, 2);
// funnel identities: every agent and every minute lands in exactly one bucket
const f = k.funnel;
assert.equal(f.roster, f.trainees + f.unpublished + f.published);
assert.equal(f.published, f.notYet + f.due);
assert.equal(f.due, f.approved + f.absent + f.present);
assert.equal(f.present, f.presentVerint + f.presentGttOnly);
assert.ok(Math.abs(f.schedMin - f.absenceMin - f.presentSchedMin) <= 1);
assert.ok(Math.abs(f.presentSchedMin - f.productiveMin - f.inShiftMin) <= 1);
assert.deepStrictEqual([f.presentGttOnly, f.gttOnlyMin], [1, 180]); // GTT says in, Verint shows nothing -> all 180 min are shrink
const pubOnly = { ...d, verint: d.verint.filter((a) => a.scheduledStart !== undefined) };
const { unpublished: _u, ...kp } = computeKpis(pubOnly, now, buildBoard(pubOnly, now));
const { unpublished: _v, ...ka } = k;
const strip = (x: typeof ka) => ({ ...x, violation: null, funnel: { ...x.funnel, roster: 0, unpublished: 0 } }); // roster counts them by design
assert.deepStrictEqual(strip(ka), strip(kp));
assert.deepStrictEqual(r.lines.filter((l) => l.unpublished).map((l) => l.name.split(",")[0]), ["Lemus Arce", "Mancia Rivas"]);
assert.deepStrictEqual(r.lobs.find((l) => l.lob === "EPIC - Payments")?.checks, { ok: 14, unverified: 0, conflict: 5, missing: 5 });
// paid-schedule path (extension >= 2026-10-09): 4h into a 9h shift with a 1h unpaid lunch at 3h-4h
{
  const M = 60000, t0 = now - 240 * M;
  const base = { lob: "EPIC", scheduledActivity: "x", actualActivity: "x", ooaSeconds: 0, adherencePct: 90, scheduledStart: t0, scheduledEnd: t0 + 540 * M, capturedAt: now, origin: "live" as const, scheduleState: "published" as const };
  const live = { verint: [
    { ...base, name: "A, Worker", shiftStart: t0, productiveMin: 150, ooaMinToday: 0, paidPlan: [[t0, t0 + 180 * M], [t0 + 240 * M, t0 + 540 * M]] as Array<[number, number]> },
    { ...base, name: "B, Off", paidPlan: [], timeOff: [[t0, t0 + 540 * M]] as Array<[number, number]> },
    { ...base, name: "C, Draft", scheduleState: "draft_only" as const },
  ], gtt: [], workday: [] };
  const kl = computeKpis(live, now, buildBoard(live, now));
  assert.equal(kl.funnel.spanBased, 0);
  assert.equal(kl.funnel.presentSchedMin, 180);           // lunch is not in the base (the span would say 240)
  assert.deepStrictEqual([kl.funnel.approved, kl.funnel.absent, kl.funnel.timeOffMin], [1, 0, 240]); // Verint time off = approved, planned absence
  assert.equal(kl.unpublished, 1);                         // draft-only is excluded
  assert.equal(kl.shrink.pct, Math.round(1000 * (30 + 240) / (180 + 240)) / 10); // (non-productive 30 + time off 240) / base
}
// overnight shift published 5h before Verint's capture window (first actual = window start): those 5h are not base
{
  const M = 60000, w = now - 120 * M;
  const base = { lob: "EPIC", scheduledActivity: "x", actualActivity: "x", ooaSeconds: 0, adherencePct: 90, scheduledEnd: now + 60 * M, capturedAt: now, origin: "live" as const, scheduleState: "published" as const };
  const live = { verint: [
    { ...base, name: "N, Night", scheduledStart: w - 300 * M, shiftStart: w, productiveMin: 120, paidPlan: [[w - 300 * M, now + 60 * M]] as Array<[number, number]> },
  ], gtt: [], workday: [] };
  const kn = computeKpis(live, now, buildBoard(live, now));
  assert.deepStrictEqual([kn.funnel.schedMin, kn.funnel.clippedMin, kn.shrink.pct], [120, 300, 0]);
}
// loose name join: GTT "First Middle Last Last2" vs Verint "Last, First"; ties never match
{
  const m = looseNameMatch(["José Luis Pérez Gómez", "Ana María López", "Ana Sofía López"], ["Perez Gomez, Jose", "Lopez, Ana"]);
  assert.equal(m.get("José Luis Pérez Gómez"), "Perez Gomez, Jose");
  assert.equal(m.size, 1); // two GTT "Ana ... López" tie for one Verint "Lopez, Ana" -> neither is matched
}
// Verint posts actuals when an activity closes: an agent 15 min behind is measured to their last closed activity
{
  const M = 60000, t0 = now - 120 * M;
  const base = { lob: "EPIC", scheduledActivity: "x", actualActivity: "x", ooaSeconds: 0, adherencePct: 90, scheduledStart: t0, scheduledEnd: now + 60 * M, capturedAt: now, origin: "live" as const, scheduleState: "published" as const, shiftStart: t0, paidPlan: [[t0, now + 60 * M]] as Array<[number, number]> };
  const live = { verint: [
    { ...base, name: "L, Lag", productiveMin: 105, actualEnd: now - 15 * M },  // working, last block not posted yet
    { ...base, name: "G, Gone", productiveMin: 60, actualEnd: now - 60 * M },  // silent 1h -> those 60 min are shrink
  ], gtt: [], workday: [] };
  const kl = computeKpis(live, now, buildBoard(live, now));
  assert.deepStrictEqual([kl.funnel.lagged, kl.funnel.schedMin, kl.funnel.inShiftMin], [1, 105 + 120, 60]);
}
// A1 on real-capture shapes: Verint time off is not a late login; a missed, finished shift is a grey no-show
{
  const M = 60000;
  const base = { lob: "EPIC", scheduledActivity: "x", actualActivity: "In Schedule", ooaSeconds: 0, adherencePct: 0, capturedAt: now, origin: "live" as const, scheduleState: "published" as const };
  const live = { verint: [
    { ...base, name: "Off, Fullday", scheduledStart: now - 60 * M, scheduledEnd: now + 540 * M, paidPlan: [], timeOff: [[now - 60 * M, now + 540 * M]] as Array<[number, number]> },
    { ...base, name: "Gone, Allday", scheduledStart: now - 600 * M, scheduledEnd: now - 60 * M, paidPlan: [[now - 600 * M, now - 60 * M]] as Array<[number, number]> },
    { ...base, name: "Late, Now", scheduledStart: now - 20 * M, scheduledEnd: now + 500 * M, paidPlan: [[now - 20 * M, now + 500 * M]] as Array<[number, number]> },
  ], gtt: [], workday: [] };
  const bl = buildBoard(live, now);
  assert.deepStrictEqual(bl.suppressed.map((s) => [s.agent, s.reason]), [["Off, Fullday", "Time off in Verint"]]);
  assert.deepStrictEqual(bl.exceptions.map((e) => [e.agent, e.kind, e.sev]), [["Late, Now", "no-clock-in", 1], ["Gone, Allday", "no-show", 2]]);
}
// plain wording for the floor
{
  assert.equal(displayName("Méndez, Carlos"), "Carlos Méndez");
  assert.equal(activity("EPIC_New ticket"), "New ticket");
  assert.equal(activity("Lunch +12m"), "Lunch");
  assert.equal(lobLabel("EPIC - TISV · Player Support"), "TISV · Player Support");
  const e = (kind: Exception["kind"], on: string, should: string) => ({ key: "k", kind, sev: 1, agent: "A", lob: "EPIC", tl: "T", on, should, minutes: 9, also: [] }) as Exception;
  assert.equal(sentence(e("ooa", "EPIC_Lunch", "EPIC_New ticket")), "is on Lunch — should be on New ticket");
  assert.equal(sentence(e("break-overrun", "Break +7m", "EPIC_New ticket")), "is still on Break — should be back on New ticket");
  assert.equal(sentence(e("no-clock-in", "Not logged in", "x")), "hasn't clocked in — shift started");
  assert.equal(sentence(e("no-clock-out", "Still clocked in (GTT)", "Shift ended")), "hasn't clocked out — shift ended");
}
// Floor: one row per TL, worst first; acking moves a team to "on it"; an unacked Sev 1 past 5 min escalates
{
  const rank = ["escalated", "not-seen", "watching", "on-it", "clear"];
  const s0 = summarizeTeams(b, {}, now);
  assert.ok(s0.every((t, i) => i === 0 || rank.indexOf(s0[i - 1].state) <= rank.indexOf(t.state)));
  const hot = s0.find((t) => t.state === "not-seen")!;
  const reds = b.exceptions.filter((e) => e.tl === hot.tl && e.lob === hot.lob && e.sev <= 2);
  const acked = Object.fromEntries(reds.map((e) => [e.key, { ackAt: now }]));
  assert.equal(summarizeTeams(b, acked, now).find((t) => t.tl === hot.tl && t.lob === hot.lob)!.state, "on-it");
  const red = b.exceptions.find((e) => e.tl === hot.tl && e.lob === hot.lob && e.sev === 1)!;
  const esc = summarizeTeams(b, { [red.key]: { sentAt: now - 6 * 60000 } }, now).find((t) => t.tl === hot.tl && t.lob === hot.lob)!;
  assert.deepStrictEqual([esc.state, esc.level], ["escalated", 1]);
}
console.log("check ok:", b.exceptions.length, "exceptions,", r.lobs.map((l) => `${l.lob} ${l.confidence}%`).join(", "));
