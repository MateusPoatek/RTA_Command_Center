// One account catalog for the board, the GTT fetch and the reports.
// Values come from the old command-center ACCOUNT_CATALOG (docs/handoff/ACCOUNT_ONBOARDING_PLAN.md §3):
// EPIC is confirmed live; the others leave unconfirmed GTT sites EMPTY rather than guessed, because a
// wrong site string returns a silent "HTTP 200, 0 rows".
// ponytail: a literal; replace with the accounts.manifest loader once it exists.
import type { GttEvent } from "./types";
import type { DiscrepancyRow, ReportConfig } from "../reports/types";
import { DEFAULT_REPORT_CONFIG } from "../reports/types";

export type AccountId = "EPIC" | "EPIC_PH" | "EPIC_BG" | "ZILLOW" | "CORELOGIC" | "MY_HERITAGE" | "HOTEL_PLANNER";

export interface Account {
  id: AccountId; // also the Verint capture LOB the extension tags roster rows with
  label: string;
  pilot: boolean; // shown in the account selector (its Verint orgs are mapped in the extension's ACCOUNT_ORGS)
  verintUrl: string | null;
  gttFunctionalArea: string; // "" = no GTT (Verint-only account)
  gttSites: string[];
  gttAvailable: boolean; // false = reports default to "verint_only"
  confirmed: boolean; // GTT values verified live; unconfirmed sites can return a silent 0 rows
  timezone: string;
  tzLabel: string; // GTT's own label format (post-mortem col 16)
  clockSystem: string;
}

const VERINT = "https://wfo.a87.verintcloudservices.com";
const ET = { timezone: "America/Toronto", tzLabel: "Eastern Time (America/Toronto)" };

export const ACCOUNT_CATALOG: Record<AccountId, Account> = {
  EPIC: { id: "EPIC", label: "Epic Games (El Salvador)", pilot: true, verintUrl: VERINT, gttFunctionalArea: "FA_Epic Games", gttSites: ["SV - Antiguo Cuscatlan - Torre Emblema"], gttAvailable: true, confirmed: true, timezone: "America/El_Salvador", tzLabel: "Central America (America/El_Salvador)", clockSystem: "GTT" },
  EPIC_PH: { id: "EPIC_PH", label: "Epic Games (Philippines)", pilot: true, verintUrl: VERINT, gttFunctionalArea: "", gttSites: [], gttAvailable: false, confirmed: true, timezone: "Asia/Manila", tzLabel: "", clockSystem: "PST (API access being negotiated)" },
  EPIC_BG: { id: "EPIC_BG", label: "Epic Games (Bulgaria)", pilot: false, verintUrl: null, gttFunctionalArea: "", gttSites: [], gttAvailable: false, confirmed: false, timezone: "Europe/Sofia", tzLabel: "", clockSystem: "Verint MyTime (API access being negotiated)" },
  ZILLOW: { id: "ZILLOW", label: "Zillow", pilot: false, verintUrl: null, gttFunctionalArea: "FA_Zillow", gttSites: [], gttAvailable: true, confirmed: false, ...ET, clockSystem: "GTT" },
  CORELOGIC: { id: "CORELOGIC", label: "CoreLogic", pilot: false, verintUrl: null, gttFunctionalArea: "FA_CoreLogic", gttSites: [], gttAvailable: true, confirmed: false, ...ET, clockSystem: "GTT" },
  MY_HERITAGE: { id: "MY_HERITAGE", label: "MyHeritage", pilot: false, verintUrl: null, gttFunctionalArea: "FA_MyHeritage", gttSites: [], gttAvailable: true, confirmed: false, ...ET, clockSystem: "GTT" },
  HOTEL_PLANNER: { id: "HOTEL_PLANNER", label: "Hotel Planner", pilot: true, verintUrl: VERINT, gttFunctionalArea: "FA_Hotel Planner", gttSites: [], gttAvailable: true, confirmed: false, ...ET, clockSystem: "GTT" },
};

export const PILOT: Account[] = Object.values(ACCOUNT_CATALOG).filter((a) => a.pilot);

export const todayIn = (tz: string, now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD

/** GTT's own multi-site delimiter (see gtt_adapter.py fetch_gtt). */
export const joinSites = (sites: string[]) => sites.join("|;");

/** Today's GTT clock events for the account, via local_api.py (POST /gtt-events). */
export async function fetchGtt(a: Account, now: number): Promise<{ events: GttEvent[]; totalRows: number }> {
  const res = await fetch("/api/gtt-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ functional_area: a.gttFunctionalArea, sites: joinSites(a.gttSites), date: todayIn(a.timezone, now), tz: a.timezone, tz_label: a.tzLabel }),
  });
  const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status} — is local_api.py running on :5050?` }));
  if (!d.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return { events: d.events.map((e: GttEvent) => ({ ...e, origin: "live" as const })), totalRows: d.total_rows };
}

// GTT-only report columns: blank for a verint_only account, so its default view leaves them out.
const GTT_ONLY_COLUMNS: (keyof DiscrepancyRow)[] = ["workday_id", "subgroup", "gtt_event", "gtt_event_count"];

/** The report defaults for THIS account (source, functional area, sites, columns). */
export function defaultReportConfigFor(id: AccountId): ReportConfig {
  const a = ACCOUNT_CATALOG[id];
  return {
    ...DEFAULT_REPORT_CONFIG,
    source: a.gttAvailable ? "gtt_verint" : "verint_only",
    functionalArea: a.gttFunctionalArea,
    sites: joinSites(a.gttSites),
    visibleColumns: a.gttAvailable ? DEFAULT_REPORT_CONFIG.visibleColumns : DEFAULT_REPORT_CONFIG.visibleColumns.filter((c) => !GTT_ONLY_COLUMNS.includes(c)),
  };
}
