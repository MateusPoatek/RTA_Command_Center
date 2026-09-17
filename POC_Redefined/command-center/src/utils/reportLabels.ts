/**
 * reportLabels.ts — discrepancy-type display labels, source-aware.
 *
 * Two of the labels reference "GTT clock-in", which is meaningless in a
 * verint_only report (no GTT was ever queried) — this is the one place that
 * distinction is made, instead of duplicating it in every component that
 * renders a DiscrepancyType.
 */
import type { DiscrepancyType, ReconciliationReport } from "../domain/types";

const TYPE_LABELS: Record<DiscrepancyType, string> = {
  clocked_in_not_in_adherence: "No Verint record",
  in_adherence_no_clock_in:    "Attending, no GTT clock-in",
  no_clock_in_no_activity:     "No clock-in, no activity",
  clocked_out_still_active:    "Ghost session",
  not_yet_scheduled:           "Shift not started",
  match_ok:                    "OK",
};

const VERINT_ONLY_TYPE_LABELS: Partial<Record<DiscrepancyType, string>> = {
  in_adherence_no_clock_in: "Present (Verint)",
  no_clock_in_no_activity:  "No Verint activity",
};

export function typeLabelFor(type: DiscrepancyType, source: ReconciliationReport["source"]): string {
  if (source === "verint_only" && type in VERINT_ONLY_TYPE_LABELS) {
    return VERINT_ONLY_TYPE_LABELS[type]!;
  }
  return TYPE_LABELS[type];
}
