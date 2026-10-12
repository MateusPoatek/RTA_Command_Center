/**
 * accounts.ts — per-account GTT/Verint identity catalog.
 *
 * Implements the plan already laid out in
 * docs/handoff/ACCOUNT_ONBOARDING_PLAN.md §3: a small, typed, per-account
 * config catalog instead of one global functionalArea/sites default (which
 * was why switching to ZILLOW/CORELOGIC still showed "Epic Games" — there
 * was nowhere else for those values to come from).
 *
 * EPIC's values are confirmed live (trial-and-error against real GTT, see
 * the onboarding doc). ZILLOW/CORELOGIC's `gttFunctionalArea` are the
 * confirmed top-level FA strings from `FAvsID.csv` (§3), but `gttSites` and
 * `verintUrl` are NOT yet confirmed — left empty rather than guessed, since
 * a wrong site string returns a silent `HTTP 200, 0 rows` (see the doc's
 * Epic Games site-confirmation story). `confirmed: false` gates the UI
 * warning in ReportConfigPanel so nobody mistakes a placeholder for a real,
 * demo-ready value.
 */
import type { AccountId, ReportConfig } from "./types";
import { DEFAULT_REPORT_CONFIG } from "./types";

export interface AccountConfig {
  id: AccountId;
  label: string;
  verintUrl: string | null;
  gttFunctionalArea: string;
  gttSites: string[];
  timezone: string;
  /** False until every field above has been confirmed live against GTT/Verint (not just present in a CSV export). */
  confirmed: boolean;
  /** False for accounts on a time-tracking system other than GTT (e.g. not yet integrated) — picks the default report Source (see defaultReportConfigFor), but the RTA can still flip it manually in the Config panel. */
  gttAvailable: boolean;
  /** The clock-in/out system this account's site actually uses (or targets, if not yet integrated). Descriptive only — doesn't drive any runtime branching (that's gttAvailable/source); just accurate status for whoever picks up the next connector. */
  clockSystem: "GTT" | "Verint MyTime" | "PST" | "TBD";
  clockSystemStatus: "live" | "negotiating_api_access" | "not_started";
  /** Feature flag: show each agent's language next to their name in Chat alerts, read from runs/agent_languages_<ACCOUNT>.csv (employee_id,language). Verint keeps language in a custom field (Language_BPO) none of our captures return. */
  alertShowAgentLanguage?: boolean;
  /** Feature flag: drop "PLEASE CHECK" from the Chat alert heading and the trailing "Please check." on each row (client request). */
  alertOmitPleaseCheck?: boolean;
  /** Feature flag: add per-agent "View shift" / "Day details" links (Verint Tracking pages on verintUrl's host) to each Chat alert row. */
  alertShowVerintLink?: boolean;
}

export const ACCOUNT_CATALOG: Record<AccountId, AccountConfig> = {
  EPIC: {
    id: "EPIC",
    label: "Epic Games (El Salvador)",
    verintUrl: "https://wfo.a87.verintcloudservices.com",
    gttFunctionalArea: "FA_Epic Games",
    gttSites: ["SV - Antiguo Cuscatlan - Torre Emblema"],
    timezone: "America/El_Salvador",
    confirmed: true,
    gttAvailable: true,
    clockSystem: "GTT",
    clockSystemStatus: "live",
  },
  // One of Epic Games' 3 branches — Philippines is on a different
  // time-tracking system, not GTT, so this account is Verint-only by
  // default (report Source defaults to "verint_only" — see
  // defaultReportConfigFor). Verint URL/timezone are real, given directly.
  // Target system is PST; Telus is negotiating API access — verint_only is
  // the interim state until that access lands.
  EPIC_PH: {
    id: "EPIC_PH",
    label: "Epic Games (Philippines)",
    verintUrl: "https://wfo.a87.verintcloudservices.com/wfo/ui/#wsm%5Bws%5D=wfmcal&qm_ctx%5Bts%5D=1789474464372",
    gttFunctionalArea: "",
    gttSites: [],
    timezone: "Asia/Manila",
    confirmed: true,
    gttAvailable: false,
    clockSystem: "PST",
    clockSystemStatus: "negotiating_api_access",
  },
  // Third of Epic Games' 3 branches. Target system is Verint MyTime (API
  // access being negotiated, same as Philippines/PST) — no real Verint
  // URL/timezone confirmed yet, so this follows the same unconfirmed-
  // placeholder pattern as ZILLOW/CORELOGIC below, not EPIC_PH's real values.
  EPIC_BG: {
    id: "EPIC_BG",
    label: "Epic Games (Bulgaria)",
    // Confirmed 2026-10-08: Bulgaria's Verint calendar (same a87 tenant as EPIC).
    verintUrl: "https://wfo.a87.verintcloudservices.com/wfo/ui/#wsm%5Bws%5D=wfmcal",
    gttFunctionalArea: "",
    gttSites: [],
    timezone: "Europe/Sofia",
    confirmed: false,
    gttAvailable: false,
    clockSystem: "Verint MyTime",
    clockSystemStatus: "negotiating_api_access",
    alertShowAgentLanguage: true,
    alertOmitPleaseCheck: true,
    alertShowVerintLink: true,
  },
  ZILLOW: {
    id: "ZILLOW",
    label: "Zillow",
    verintUrl: null,
    gttFunctionalArea: "FA_Zillow",
    gttSites: [],
    timezone: "America/Toronto",
    confirmed: false,
    gttAvailable: true,
    clockSystem: "GTT",
    clockSystemStatus: "not_started",
  },
  CORELOGIC: {
    id: "CORELOGIC",
    label: "CoreLogic",
    verintUrl: null,
    gttFunctionalArea: "FA_CoreLogic",
    gttSites: [],
    timezone: "America/Toronto",
    confirmed: false,
    gttAvailable: true,
    clockSystem: "GTT",
    clockSystemStatus: "not_started",
  },
  MY_HERITAGE: {
    id: "MY_HERITAGE",
    label: "MyHeritage",
    verintUrl: null,
    // Top-level FA from FAvsID.csv (there's also a "FA_Myheritage Customer
    // Contact" sub-account variant — deliberately not used, same rule as
    // Zillow/CoreLogic: generic top-level FA, not a sub-account variant).
    gttFunctionalArea: "FA_MyHeritage",
    gttSites: [],
    timezone: "America/Toronto",
    confirmed: false,
    gttAvailable: true,
    clockSystem: "GTT",
    clockSystemStatus: "not_started",
  },
  HOTEL_PLANNER: {
    id: "HOTEL_PLANNER",
    label: "Hotel Planner",
    verintUrl: "https://wfo.a87.verintcloudservices.com/wfo/ui/#wsm%5Bws%5D=wfmcal&qm_ctx%5Bts%5D=1790004808144",
    // Top-level FA from FAvsID.csv, same rule as Zillow/CoreLogic/MyHeritage.
    gttFunctionalArea: "FA_Hotel Planner",
    gttSites: [],
    timezone: "America/Toronto",
    confirmed: false,
    gttAvailable: true,
    clockSystem: "GTT",
    clockSystemStatus: "not_started",
  },
};

/** GTT's own multi-site delimiter (see gtt_adapter.py's fetch_gtt docstring) — not our own parsing convention. */
export function joinSites(sites: string[]): string {
  return sites.join("|;");
}

// GTT-only columns — meaningless once a report is generated without GTT (see
// gttAvailable below), so a verint_only account's default view excludes them
// rather than showing a table full of blanks.
const GTT_ONLY_COLUMNS: (keyof import("./types").DiscrepancyRow)[] = [
  "workday_id",
  "subgroup",
  "gtt_event",
  "gtt_event_count",
];

/**
 * YYYY-MM-DD for `date` in the ACCOUNT's timezone — the day GTT/Verint
 * consider "today". Never use toISOString() for this: that's UTC, so from
 * 18:00 in Central America it already returns tomorrow and GTT answers
 * HTTP 200 with 0 rows.
 */
export function accountDateStr(account: AccountId, date: Date = new Date()): string {
  const timeZone = ACCOUNT_CATALOG[account]?.timezone;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
  } catch {
    return date.toLocaleDateString("en-CA"); // unknown/invalid tz → browser-local day
  }
}

/** The right functionalArea/sites/source default for THIS account — not the global EPIC-shaped default. */
export function defaultReportConfigFor(account: AccountId): ReportConfig {
  const cat = ACCOUNT_CATALOG[account];
  return {
    ...DEFAULT_REPORT_CONFIG,
    source: cat.gttAvailable ? "gtt_verint" : "verint_only",
    functionalArea: cat.gttFunctionalArea,
    sites: joinSites(cat.gttSites),
    visibleColumns: cat.gttAvailable
      ? DEFAULT_REPORT_CONFIG.visibleColumns
      : DEFAULT_REPORT_CONFIG.visibleColumns.filter((c) => !GTT_ONLY_COLUMNS.includes(c)),
  };
}
