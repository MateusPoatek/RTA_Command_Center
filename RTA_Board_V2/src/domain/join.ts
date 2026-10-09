// Joins the three sources per agent. Workday ID is the canonical key; the
// name fallback exists ONLY because the extension roster carries no id yet, and
// is reported as such in the provenance (the visit docs say the fuzzy join must go).
import type { Data, GttEvent, VerintAgent, WorkdayRecord } from "../data/types";

export const nameKey = (s: string) =>
  s.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const tokens = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean));

// GTT/Workday write "First Middle Last Last2", Verint "Last, First" — exact keys matched ~20 of 86 EPIC
// clock-ins on 2026-10-09. Loose rule: accents ignored, >= 2 shared name words, and the pair must be each
// other's unique best (a tie on either side = no match, never a guess). Exact keys still win first.
// ponytail: O(names x agents) — fine for one account's floor; drop once the roster carries Workday IDs.
export function looseNameMatch(sources: string[], agents: string[]): Map<string, string> {
  const at = agents.map((a) => [a, tokens(a)] as const);
  const score = (s: Set<string>, t: Set<string>) => [...s].filter((w) => t.has(w)).length;
  const best = <T,>(xs: T[], f: (x: T) => number) => {
    let top = 1, hit: T[] = [];
    for (const x of xs) { const v = f(x); if (v > top) { top = v; hit = [x]; } else if (v === top && top > 1) hit.push(x); }
    return hit.length === 1 ? hit[0] : undefined;
  };
  const src = [...new Set(sources)].map((s) => [s, tokens(s)] as const);
  const out = new Map<string, string>();
  for (const [s, st] of src) {
    const a = best(at, ([, t]) => score(st, t));
    if (a && best(src, ([, t]) => score(a[1], t))?.[0] === s) out.set(s, a[0]);
  }
  return out;
}

export interface Joined {
  agent: VerintAgent;
  gtt: GttEvent[];
  workday?: WorkdayRecord;
  joinKey: "workday_id" | "name" | "name_loose";
  tl: string;
}

export function joinAll(d: Data): Joined[] {
  const exact = new Set(d.verint.map((a) => nameKey(a.name)));
  const names = (xs: Array<{ employee?: string }>) => xs.map((x) => x.employee ?? "").filter((n) => n && !exact.has(nameKey(n)));
  const loose = looseNameMatch([...names(d.gtt), ...names(d.workday)], d.verint.filter((a) => a.workdayId === undefined).map((a) => a.name));
  return d.verint.map((agent) => {
    const byId = agent.workdayId !== undefined;
    let viaLoose = false;
    const match = <T extends { workdayId: string; employee?: string }>(x: T) => {
      if (byId) return x.workdayId === agent.workdayId;
      if (!x.employee) return false;
      if (nameKey(x.employee) === nameKey(agent.name)) return true;
      return loose.get(x.employee) === agent.name && (viaLoose = true);
    };
    const workday = d.workday.find(match);
    const gtt = d.gtt.filter(match);
    return {
      agent, gtt, workday,
      joinKey: byId ? "workday_id" : viaLoose ? "name_loose" : "name",
      tl: workday?.supervisor || gtt[0]?.supervisor || "Unassigned",
    };
  });
}

export const clockIn = (j: Joined) => j.gtt.find((e) => e.event === "clock_in")?.at;
export const clockOut = (j: Joined) => j.gtt.find((e) => e.event === "clock_out")?.at;
