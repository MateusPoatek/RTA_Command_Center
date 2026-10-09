// Synthetic demo data (fictional people), generated relative to `now` so the
// board always looks live. Each scenario exercises one rule or one provenance case.
import type { Data, GttEvent, Segment, VerintAgent, WorkdayRecord } from "./types";
import { analyzeDay } from "../domain/timeline";

const MIN = 60000;
export const TEAM_LEADS = ["Ana Morales", "Carlos Pineda", "Lucia Herrera", "Rosa Quintanilla"];

// [Verint-style name, workdayId, lob, team lead index, scenario]
const ROSTER: Array<[string, string, string, number, string]> = [
  ["Ramos Diaz, Luis", "10000001", "EPIC - Tickets", 0, "ok"],
  ["Soto Vega, Marta", "10000002", "EPIC - Tickets", 0, "ooa-long"],
  ["Cruz Lopez, Pablo", "10000003", "EPIC - Tickets", 0, "ok"],
  ["Mejia Ruiz, Sofia", "10000004", "EPIC - Tickets", 0, "ooa-mid"],
  ["Reyes Campos, Diego", "10000005", "EPIC - Tickets", 0, "ok"],
  ["Flores Ortiz, Elena", "10000006", "EPIC - Tickets", 1, "late-crit"],
  ["Vargas Pena, Hugo", "10000007", "EPIC - Tickets", 1, "ok"],
  ["Castro Nunez, Rita", "10000008", "EPIC - Tickets", 1, "ooa-short"],
  ["Molina Rivas, Jorge", "10000009", "EPIC - Tickets", 1, "ok"],
  ["Aguilar Mora, Nadia", "10000010", "EPIC - Tickets", 1, "pto"],
  ["Pineda Solis, Raul", "10000011", "EPIC - Tickets", 1, "ok"],
  ["Navarro Paz, Irene", "10000012", "EPIC - Tickets", 1, "conflict"],
  ["Cordero Leal, Mateo", "10000013", "EPIC - Social Support", 2, "ok"],
  ["Salazar Rey, Valeria", "10000014", "EPIC - Social Support", 2, "ooa-long"],
  ["Ibarra Cano, Tomas", "10000015", "EPIC - Social Support", 2, "ok"],
  ["Duran Prado, Camila", "10000016", "EPIC - Social Support", 2, "late-warn"],
  ["Quiroz Bello, Andres", "10000017", "EPIC - Social Support", 2, "no-gtt"],
  ["Lara Montes, Paula", "10000018", "EPIC - Social Support", 2, "ok"],
  ["Rojas Tello, Esteban", "10000019", "EPIC - Social Support", 2, "ok"],
  ["Pacheco Luna, Daniela", "10000020", "EPIC - Social Support", 2, "ooa-mid"],
  // Alert rules v1 (docs/ALERT_RULES.md) — one agent per new rule
  ["Benitez Rios, Oscar", "10000021", "EPIC - Tickets", 0, "break-over"],
  ["Zelaya Mena, Karla", "10000022", "EPIC - Tickets", 1, "unmapped"],
  ["Portillo Ayala, Ivan", "10000023", "EPIC - Tickets", 1, "trainee"],
  ["Menjivar Cruz, Laura", "10000024", "EPIC - Social Support", 2, "no-clockout"],
  ["Henriquez Paz, Mario", "10000025", "EPIC - Social Support", 2, "ended-ok"],
  ["Guardado Sol, Ruth", "10000026", "EPIC - Social Support", 2, "repeat"],
  // A5: one LOB where most of the floor is missing at once (site/VPN outage pattern)
  ["Alvarado Lima, Cesar", "10000027", "EPIC - Payments", 3, "site-down"],
  ["Barrera Funes, Gloria", "10000028", "EPIC - Payments", 3, "site-down"],
  ["Cardona Melara, Jose", "10000029", "EPIC - Payments", 3, "site-down"],
  ["Escobar Miranda, Alba", "10000030", "EPIC - Payments", 3, "site-down"],
  ["Fuentes Orellana, Rene", "10000031", "EPIC - Payments", 3, "site-down"],
  ["Galdamez Pineda, Silvia", "10000032", "EPIC - Payments", 3, "ok"],
  ["Hernandez Velasquez, Noe", "10000033", "EPIC - Payments", 3, "ok"],
  ["Iraheta Bonilla, Marta", "10000034", "EPIC - Payments", 3, "ok"],
  // Schedule not published in Verint (draft only): no publishedSchedule events
  ["Lemus Arce, Fabiola", "10000035", "EPIC - Tickets", 1, "unpub-working"],
  ["Mancia Rivas, Tito", "10000036", "EPIC - Tickets", 1, "unpub-off"],
  ["Tobar Cruz, Elisa", "10000037", "EPIC - Social Support", 2, "gtt-only"], // clocked in on GTT, no Verint activity captured
];


// Full-day plan in minutes from shift start: [label|null (= the queue activity), from, to, productive?]
const DAY: Array<[string | null, number, number, boolean]> = [
  [null, 0, 120, true], ["Break", 120, 135, false], [null, 135, 255, true], ["Lunch", 255, 285, false],
  [null, 285, 405, true], ["Break", 405, 420, false], [null, 420, 480, true],
];

function planFor(base: number, work: string): Segment[] {
  return DAY.map(([l, a, b, w]) => ({ label: l ?? work, start: base + a * MIN, end: base + b * MIN, work: w }));
}

/** Actual = the plan clipped to now, except the last `ooaMin` minutes, spent on `ooaLabel`. */
function actualFor(plan: Segment[], now: number, ooaMin: number, ooaLabel: string): Segment[] {
  const cut = now - ooaMin * MIN;
  const kept = plan.filter((x) => x.start < cut).map((x) => ({ ...x, end: Math.min(x.end, cut) }));
  return ooaMin > 0 ? [...kept, { label: ooaLabel, start: cut, end: now, work: false }] : plan.filter((x) => x.start < now).map((x) => ({ ...x, end: Math.min(x.end, now) }));
}

export function makeFixtures(now: number): Data {
  const verint: VerintAgent[] = [];
  const gtt: GttEvent[] = [];
  const workday: WorkdayRecord[] = [];

  for (const [name, wid, lob, tlIdx, s] of ROSTER) {
    const [last, first] = name.split(", ");
    const employee = `${first} ${last}`; // GTT normalises to "Firstname Surname(s)"
    const supervisor = TEAM_LEADS[tlIdx];
    const sched = lob.includes("Social") ? "Epic_Social Support" : lob.includes("Payments") ? "EPIC_Payments" : "EPIC_New ticket";

    let schedStart = now - 180 * MIN;
    let shiftStart: number | undefined = schedStart;
    let clockIn: number | undefined = schedStart + (Number(wid.slice(-2)) % 3) * MIN;
    let ooaMin = 0;
    let actual = sched;
    let exception: string | undefined;
    let trainee: boolean | undefined;
    let clockOut: number | undefined;

    switch (s) {
      case "ooa-long": ooaMin = 38; actual = "Lunch"; break;
      case "ooa-mid": ooaMin = 12; actual = "EPIC_Coaching"; break;
      case "ooa-short": ooaMin = 3; actual = "EPIC_Short Break 1"; break;
      case "late-crit": schedStart = now - 14 * MIN; shiftStart = clockIn = undefined; actual = "Not logged in"; break;
      case "late-warn": schedStart = now - 5 * MIN; shiftStart = clockIn = undefined; actual = "Not logged in"; break;
      case "pto": schedStart = now - 20 * MIN; shiftStart = clockIn = undefined; actual = "Not logged in"; exception = "PTO (approved)"; break;
      case "conflict": clockIn = schedStart + 40 * MIN; break; // GTT says in 40 min after Verint's shift start
      case "no-gtt": clockIn = undefined; break; // Verint saw activity, GTT has no clock-in
      case "break-over": schedStart = now - 150 * MIN; shiftStart = clockIn = schedStart; ooaMin = 15; actual = "Break"; break; // planned Break 120–135, still on it
      case "unmapped": ooaMin = 6; actual = "EPIC_Special Project"; break; // label not in ACTIVITY_MAP (ANA "#N/A")
      case "trainee": schedStart = now - 12 * MIN; shiftStart = clockIn = undefined; actual = "Not logged in"; trainee = true; break;
      case "no-clockout": schedStart = now - 500 * MIN; shiftStart = clockIn = schedStart; break; // shift ended 20 min ago, no GTT clock_out
      case "ended-ok": schedStart = now - 500 * MIN; shiftStart = clockIn = schedStart; clockOut = schedStart + 482 * MIN; break;
      case "repeat": ooaMin = 7; actual = "EPIC_Coaching"; break; // 3rd short OOA today (two earlier ones added below)
      case "gtt-only": shiftStart = undefined; break;
      case "site-down": schedStart = now - 12 * MIN; shiftStart = clockIn = undefined; actual = "Not logged in"; break;
    }

    const unpub = s.startsWith("unpub");
    if (s === "unpub-off") shiftStart = clockIn = undefined;
    const elapsed = Math.max(1, (Math.min(now, schedStart + 480 * MIN) - schedStart) / MIN);
    const planned = unpub ? [] : planFor(schedStart, sched);
    let actualSegs = shiftStart && !unpub ? actualFor(planned, now, ooaMin, actual) : [];
    if (s === "break-over") actualSegs = [...actualSegs.filter((x) => x.end <= schedStart + 120 * MIN), { label: "Break", start: schedStart + 120 * MIN, end: now, work: false }];
    if (s === "repeat") for (const m of [30, 90]) actualSegs = actualSegs.flatMap((x) => x.start < schedStart + m * MIN && x.end > schedStart + (m + 7) * MIN
      ? [{ ...x, end: schedStart + m * MIN }, { label: actual, start: schedStart + m * MIN, end: schedStart + (m + 7) * MIN, work: false }, { ...x, start: schedStart + (m + 7) * MIN }] : [x]);
    verint.push({
      name, workdayId: wid, lob,
      scheduledActivity: sched, actualActivity: actual,
      ooaSeconds: ooaMin * 60,
      adherencePct: shiftStart ? Math.round(100 * (1 - ooaMin / elapsed)) : null,
      scheduledStart: unpub ? undefined : schedStart, scheduledEnd: unpub ? undefined : schedStart + 480 * MIN,

      shiftStart, planned, actual: actualSegs,
      productiveMin: shiftStart ? Math.round((now - shiftStart) / MIN - ooaMin * 0.5) : undefined,
      ...(shiftStart && (() => { const o = Math.round(analyzeDay(planned, actualSegs, now).ooaMin); return { ooaMinToday: o, adherenceMin: Math.round(elapsed) - o }; })()),
      // no published baseline -> Verint has nothing to measure adherence against
      ...(unpub && { scheduledActivity: "", adherencePct: null, adherenceMin: 0, ooaMinToday: 0 }),
      capturedAt: now, origin: "fixture",
    });
    if (clockIn) gtt.push({ workdayId: wid, employee, supervisor, event: "clock_in", at: clockIn });
    if (clockOut) gtt.push({ workdayId: wid, employee, supervisor, event: "clock_out", at: clockOut });
    workday.push({ workdayId: wid, employee, supervisor, exception, trainee });
  }
  return { verint, gtt, workday };
}
