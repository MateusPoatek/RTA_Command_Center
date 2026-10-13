/**
 * brandConfig.ts — TELUS Digital brand tokens for the printable Shift Report.
 *
 * Palette supplied by Mateus (2026-09-02). No logo file yet — the report
 * header uses a text wordmark in Forest green until a real logo asset is
 * dropped in (swap TELUS_LOGO_URL below, nothing else needs to change).
 */

export const TELUS_LOGO_URL: string | null = null; // set once a real asset exists

export const telusColors = {
  // Primary
  green: "#66CC00",       // accent only, not for large fills/text
  forest: "#007F4A",       // primary green — fills/buttons/wordmark
  forestAlt: "#00804B",
  purple: "#4B286D",
  orchid: "#A020FD",       // electric accent, sparingly
  obsidian: "#222220",     // body text / dark backgrounds
  slate: "#595956",        // secondary text
  white: "#FFFFFF",
  pearl: "#FCFDFB",        // primary background
  moonstone: "#F2F3ED",    // secondary light background
  // Secondary — callouts/tables/quotes only, not for large areas
  juniper: "#BAF29E",
  verbena: "#DFB2FF",
  galena: "#B6B6B1",
  hawthorn: "#EAFFE0",
  iris: "#F7ECFF",
  marble: "#DEE0D9",
  // Borders/dividers
  border: "#B6B6B6",
  borderSoft: "#DEE0D9",
  rule: "#BABCB2",
  // Semantic (NOT in the Telus palette — it has no red/amber). Conventional
  // problem/pending colors, matching what ShiftReportPrintView.tsx already
  // uses for the same purpose, so severity reads consistently across the
  // PDF report and the Chat digest.
  problemRed: "#c0392b",
  pendingAmber: "#e67e22",
} as const;
