/**
 * DataBadge.tsx — minimal UI helper.
 * Maps DataClass values to human-readable labels.
 */

import type { DataClass } from "../../domain/types";

export const dataClassLabels: Record<DataClass, string> = {
  "evidence-backed":    "Evidence-backed",
  "seeded":             "Seeded",
  "simulated":          "Simulated",
  "future-integration": "Future integration",
};
