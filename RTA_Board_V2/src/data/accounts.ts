// Pilot accounts, plus the real GTT fetch for each.
// Values are copied from POC_Redefined/command-center/src/domain/accounts.ts (ACCOUNT_CATALOG).
// ponytail: a 3-entry copy; replace with the accounts.manifest loader once it exists.
import type { GttEvent } from "./types";

export interface Account {
  id: string; // also the Verint capture LOB the extension tags roster rows with
  label: string;
  gttFunctionalArea: string; // "" = no GTT (Verint-only account)
  gttSites: string[];
  confirmed: boolean; // GTT values verified live; unconfirmed sites can return a silent 0 rows
  timezone: string;
  tzLabel: string; // GTT's own label format (post-mortem col 16)
  clockSystem: string;
}

export const PILOT: Account[] = [
  { id: "EPIC", label: "Epic Games (El Salvador)", gttFunctionalArea: "FA_Epic Games", gttSites: ["SV - Antiguo Cuscatlan - Torre Emblema"], confirmed: true, timezone: "America/El_Salvador", tzLabel: "Central America (America/El_Salvador)", clockSystem: "GTT" },
  { id: "EPIC_PH", label: "Epic Games (Philippines)", gttFunctionalArea: "", gttSites: [], confirmed: true, timezone: "Asia/Manila", tzLabel: "", clockSystem: "PST (no API access yet)" },
  { id: "HOTEL_PLANNER", label: "Hotel Planner", gttFunctionalArea: "FA_Hotel Planner", gttSites: [], confirmed: false, timezone: "America/Toronto", tzLabel: "Eastern Time (America/Toronto)", clockSystem: "GTT" },
];

export const todayIn = (tz: string, now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD

/** Today's GTT clock events for the account, via local_api.py (POST /gtt-events). */
export async function fetchGtt(a: Account, now: number): Promise<{ events: GttEvent[]; totalRows: number }> {
  const res = await fetch("/api/gtt-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ functional_area: a.gttFunctionalArea, sites: a.gttSites.join("|;"), date: todayIn(a.timezone, now), tz: a.timezone, tz_label: a.tzLabel }),
  });
  const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status} — is local_api.py running on :5050?` }));
  if (!d.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return { events: d.events.map((e: GttEvent) => ({ ...e, origin: "live" as const })), totalRows: d.total_rows };
}
