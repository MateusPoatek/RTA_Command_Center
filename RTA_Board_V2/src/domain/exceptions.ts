// Board logic: only EXCEPTIONS surface; everyone on schedule is just a count.
// Rules A1–A6, severities and routing are specified in docs/ALERT_RULES.md
// (ANA Bot SOP + visit debriefs [01] §4.4, [02] §8.2–8.4). Sev 1 = direct alert
// to the TL with an ack window; Sev 2 = board + the TL's roll-up digest; Sev 3 = board only.
import type { Data } from "../data/types";
import { clockIn, clockOut, joinAll } from "./join";
import { analyzeDay } from "./timeline";

export type Sev = 1 | 2 | 3;
export type Kind = "no-clock-in" | "ooa" | "break-overrun" | "no-clock-out" | "no-show";

const DEFAULT = {
  startBufferMin: 3,     // A1 fires at 3 min past scheduled start
  critLateMin: 10,       // A1 Sev 1
  ooaBufferMin: 5,       // A2 fires at 5 min; [02] §8.2
  ooaSev2Min: 15,
  critOoaMin: 30,        // A2/A3/A4 Sev 1 ("30–75 min out of compliance")
  breakWaiverMin: 5,     // A3: the 4:59 break/lunch tolerance
  breakSev2Min: 10,
  clockOutBufferMin: 5,  // A4
  repeatBump: 3,         // 3rd OOA episode of the day bumps severity one level
  incidentMinAgents: 5,  // A5: this many agents in one LOB at Sev 1–2 ...
  incidentMinShare: 0.2, // ... AND at least this share of the LOB
  ackSlaMin: 5,          // Sev 1 unacked -> Ops Manager
  directorAfterMin: 10,  // ... still unacked this much later -> WFM Director
  escalation: false,     // per-account opt-in: the old bot's escalation was switched off for spam ([02] §8.4)
};
export type Cfg = typeof DEFAULT;
// ponytail: per-account overrides as a literal; move to the account manifest when a second account is onboarded.
const ACCOUNTS: Record<string, Partial<Cfg>> = { EPIC: { escalation: true } };
export const cfgFor = (lob: string): Cfg => ({ ...DEFAULT, ...ACCOUNTS[lob.split(" - ")[0]] });

// Verint activity labels we can reconcile with a GTT aux. Anything else is ANA's "#N/A" (A6).
// ponytail: fixture labels only — the real map is the account's activity catalog ([02] §1.6).
export const ACTIVITY_MAP: Record<string, string> = {
  "EPIC_New ticket": "productivity", "Epic_Social Support": "productivity", "EPIC_Payments": "productivity",
  Break: "break-1", "EPIC_Short Break 1": "break-1", Lunch: "lunch", "EPIC_Coaching": "team-meeting",
};

export interface Exception {
  key: string;
  kind: Kind;
  sev: Sev;
  agent: string;
  lob: string;
  tl: string;
  on: string;     // what the agent is doing (red)
  should: string; // what the schedule says (green)
  minutes: number;
  repeat?: number;    // OOA episodes today, when the repetition bump applied
  incident?: boolean; // part of an A5 LOB incident: no individual direct alert
  also: Kind[];       // other rules this agent trips (one card per agent: the worst wins)
}

export interface Incident { lob: string; agents: number; of: number }

export interface BoardModel {
  exceptions: Exception[]; // Sev 1 first, longest first
  suppressed: Array<{ agent: string; reason: string }>; // counted, never shown as rows
  calm: Record<string, number>; // `${lob}|${tl}` -> agents on schedule
  teams: Array<{ lob: string; tl: string }>;
  incidents: Incident[];
  unmapped: Array<{ agent: string; label: string }>; // A6 — data quality, routed to WFM not the TL
}

const sevBy = (m: number, s1: number, s2: number, floor: Sev = 3): Sev => (m >= s1 ? 1 : m >= s2 ? 2 : floor);

export function buildBoard(d: Data, now: number, outageLobs: ReadonlySet<string> = new Set()): BoardModel {
  const exceptions: Exception[] = [];
  const suppressed: BoardModel["suppressed"] = [];
  const unmapped: BoardModel["unmapped"] = [];
  const calm: Record<string, number> = {};
  const teamSet = new Map<string, { lob: string; tl: string }>();
  const lobSize: Record<string, number> = {};
  const MIN = 60000;

  for (const j of joinAll(d)) {
    const { agent: a, tl } = j;
    const c = cfgFor(a.lob);
    const gk = `${a.lob}|${tl}`;
    teamSet.set(gk, { lob: a.lob, tl });
    lobSize[a.lob] = (lobSize[a.lob] ?? 0) + 1;

    if (j.workday?.trainee) { suppressed.push({ agent: a.name, reason: "Trainee (excluded, per scorecard SOP)" }); continue; }
    if (outageLobs.has(a.lob)) { suppressed.push({ agent: a.name, reason: "Known outage (RTA-declared)" }); continue; }
    for (const l of [a.actualActivity, a.scheduledActivity]) if (l && l !== "Not logged in" && !(l in ACTIVITY_MAP)) unmapped.push({ agent: a.name, label: l });

    const started = a.shiftStart !== undefined || clockIn(j) !== undefined;
    const lateMin = a.scheduledStart ? Math.floor((now - a.scheduledStart) / MIN) : 0;
    const base = { agent: a.name, lob: a.lob, tl, also: [] as Kind[] };
    const hits: Exception[] = [];

    // A1 — not clocked in. Time off published in Verint is not a late login (2026-10-09 EPIC: 2 agents on a
    // full-day time off were alerted). Once the shift is over it is no longer "act now": it becomes a no-show
    // for the TL to explain (PTO not entered in Verint?), grey, not red.
    if (!started && a.scheduledStart && lateMin >= c.startBufferMin) {
      if (j.workday?.exception) { suppressed.push({ agent: a.name, reason: j.workday.exception }); continue; }
      const off = (a.timeOff ?? []).some(([s, e]) => s <= now && now < e) || (a.paidPlan?.length === 0 && !!a.timeOff?.length);
      if (off) { suppressed.push({ agent: a.name, reason: "Time off in Verint" }); continue; }
      if (a.scheduledEnd && now >= a.scheduledEnd)
        hits.push({ ...base, key: `${a.name}|no-show`, kind: "no-show", sev: 2, on: "No activity all shift", should: "Shift", minutes: Math.round((a.scheduledEnd - a.scheduledStart) / MIN) });
      else hits.push({ ...base, key: `${a.name}|no-clock-in`, kind: "no-clock-in", sev: sevBy(lateMin, c.critLateMin, 0), on: "Not logged in", should: a.scheduledActivity || "Shift start", minutes: lateMin });
    }
    // A4 — shift ended, still clocked in
    if (started && a.scheduledEnd && clockIn(j) !== undefined && clockOut(j) === undefined) {
      const over = Math.floor((now - a.scheduledEnd) / MIN);
      if (over >= c.clockOutBufferMin) hits.push({ ...base, key: `${a.name}|no-clock-out`, kind: "no-clock-out", sev: sevBy(over, c.critOoaMin, 0), on: "Still clocked in (GTT)", should: "Shift ended", minutes: over });
    }
    // A3 — break/lunch overrun: still on a planned break that has already ended
    const brk = started && (a.planned ?? []).find((p) => !p.work && p.end < now && (a.actual ?? []).some((q) => q.label === p.label && q.start < p.end && q.end >= now));
    if (brk) {
      const over = Math.floor((now - brk.end) / MIN);
      if (over >= c.breakWaiverMin) hits.push({ ...base, key: `${a.name}|break-overrun`, kind: "break-overrun", sev: sevBy(over, c.critOoaMin, c.breakSev2Min), on: `${brk.label} +${over}m`, should: a.scheduledActivity, minutes: over });
    }
    // A2 — out of adherence (Verint's live OOA)
    if (started && a.ooaSeconds >= c.ooaBufferMin * 60) {
      const m = Math.floor(a.ooaSeconds / 60);
      hits.push({ ...base, key: `${a.name}|ooa`, kind: "ooa", sev: sevBy(m, c.critOoaMin, c.ooaSev2Min), on: a.actualActivity, should: a.scheduledActivity, minutes: m });
    }

    if (!hits.length) { calm[gk] = (calm[gk] ?? 0) + 1; continue; }
    hits.sort((x, y) => x.sev - y.sev || y.minutes - x.minutes);
    const ex = { ...hits[0], also: hits.slice(1).map((h) => h.kind) };
    if (ex.kind === "ooa" || ex.kind === "break-overrun") {
      const episodes = analyzeDay(a.planned ?? [], a.actual ?? [], now).ooa.filter((o) => o.end - o.start >= c.ooaBufferMin * MIN).length;
      if (episodes >= c.repeatBump) Object.assign(ex, { repeat: episodes, sev: Math.max(1, ex.sev - 1) as Sev });
    }
    exceptions.push(ex);
  }

  // A5 — many agents of one LOB in trouble at once: one incident instead of N direct alerts
  const incidents: Incident[] = [];
  for (const [lob, of] of Object.entries(lobSize)) {
    const c = cfgFor(lob);
    const hot = exceptions.filter((e) => e.lob === lob && e.sev <= 2 && e.kind !== "no-show"); // a no-show is not an outage
    if (hot.length >= c.incidentMinAgents && hot.length / of >= c.incidentMinShare) {
      incidents.push({ lob, agents: hot.length, of });
      hot.forEach((e) => (e.incident = true));
    }
  }

  exceptions.sort((x, y) => x.sev - y.sev || y.minutes - x.minutes);
  const teams = [...teamSet.values()].sort((x, y) => x.lob.localeCompare(y.lob) || x.tl.localeCompare(y.tl));
  return { exceptions, suppressed, calm, teams, incidents, unmapped };
}

/** Escalation ladder for a Sev 1 sent at `sentAt`: 0 = with the TL, 1 = Ops Manager, 2 = WFM Director. */
export function escalationLevel(c: Cfg, sentAt: number, now: number): 0 | 1 | 2 {
  if (!c.escalation) return 0;
  const m = (now - sentAt) / 60000;
  return m > c.ackSlaMin + c.directorAfterMin ? 2 : m > c.ackSlaMin ? 1 : 0;
}

/** Per-alert follow-up state, shared by the Team Lead and Floor screens (in-memory in the POC). */
export type Track = { sentAt?: number; ackAt?: number; reason?: string; ackBy?: string; chatAt?: number; chatLevel?: number }; // chat*: what Google Chat was told (alerts/chat.ts)

export const LADDER = ["Team Lead", "Ops Manager", "WFM Director"];

export interface TeamSummary {
  lob: string; tl: string; size: number;
  red: number; grey: number; minor: number; // unacked Sev 1 / Sev 2 / Sev 3
  acked: number;
  oldest: number; // minutes, longest unacked red or grey
  state: "escalated" | "not-seen" | "on-it" | "watching" | "clear";
  level: 0 | 1 | 2; // escalation level of the worst unacked Sev 1
}

const RANK: Record<TeamSummary["state"], number> = { escalated: 0, "not-seen": 1, watching: 2, "on-it": 3, clear: 4 };

/** One row per TL for the Floor: which teams need someone to act, worst first. */
export function summarizeTeams(m: BoardModel, track: Record<string, Track>, now: number): TeamSummary[] {
  return m.teams.map(({ lob, tl }) => {
    const ex = m.exceptions.filter((e) => e.lob === lob && e.tl === tl);
    const open = ex.filter((e) => !track[e.key]?.ackAt);
    const red = open.filter((e) => e.sev === 1), grey = open.filter((e) => e.sev === 2);
    const level = Math.max(0, ...red.map((e) => (track[e.key]?.sentAt ? escalationLevel(cfgFor(lob), track[e.key].sentAt!, now) : 0))) as 0 | 1 | 2;
    const acked = ex.length - open.length;
    const state = level ? "escalated" : red.length ? "not-seen" : grey.length ? "watching" : acked ? "on-it" : "clear";
    return {
      lob, tl, size: ex.length + (m.calm[`${lob}|${tl}`] ?? 0),
      red: red.length, grey: grey.length, minor: open.filter((e) => e.sev === 3).length, acked,
      oldest: Math.max(0, ...[...red, ...grey].filter((e) => e.kind !== "no-show").map((e) => e.minutes)), state, level,
    } satisfies TeamSummary;
  }).sort((x, y) => RANK[x.state] - RANK[y.state] || y.red + y.grey - (x.red + x.grey) || y.oldest - x.oldest);
}
