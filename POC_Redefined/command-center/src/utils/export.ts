/**
 * export.ts — client-side CSV and text export utilities
 *
 * What this file does:
 *   Provides two export functions that generate downloadable files from the
 *   demo session state: an audit trail CSV and a shift summary text file.
 *
 * ⚠️  STATUS: This file is implemented but not yet wired to any button in the UI.
 *   To activate, add an "Export audit" button to CloseShiftPanel and call
 *   exportAuditCsv(globalAudit). The globalAudit state is collected in App.tsx.
 *
 * Production note:
 *   This export is useful for demos and internal review. In production, audit
 *   exports should be generated server-side (immutable, signed, tamper-evident).
 *   A client-side export can always be manipulated — never use it as legal evidence.
 *
 * DEMO NOTE:
 *   All exported data is tagged with "demo" in the filename and a disclaimer
 *   in the body to prevent confusion with real operational records.
 */

import type { AuditEvent, CommandCard } from "../domain/types";

// ---------------------------------------------------------------------------
// Audit trail CSV export
// ---------------------------------------------------------------------------

/**
 * Exports the full audit trail as a CSV file and triggers a browser download.
 *
 * Columns: timestamp, actor, action, detail, dataClass
 *
 * @param auditEvents - Array of AuditEvents from the App-level globalAudit state.
 *
 * @example
 * exportAuditCsv(globalAudit);
 * // → downloads "rta-ai-audit-demo.csv"
 */
export function exportAuditCsv(auditEvents: AuditEvent[]): void {
  const headers = ["timestamp", "actor", "action", "detail", "dataClass"];
  const rows = auditEvents.map((event) => [
    event.timestamp,
    event.actor,
    event.action,
    event.detail,
    event.dataClass,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  downloadTextFile("rta-ai-audit-demo.csv", csv, "text/csv");
}

// ---------------------------------------------------------------------------
// Shift summary text export
// ---------------------------------------------------------------------------

/**
 * Exports a plain-text shift summary and triggers a browser download.
 * Includes total card counts and a list of unresolved items.
 *
 * @param cards - Full card list from App state at shift close.
 *
 * @example
 * exportShiftSummary(cards);
 * // → downloads "rta-shift-summary-demo.txt"
 */
export function exportShiftSummary(cards: CommandCard[]): void {
  const unresolved = cards.filter(
    (card) => !["resolved", "sent", "suppressed"].includes(card.status),
  );

  const summary = [
    "RTA Command Center — Demo Shift Summary",
    "DISCLAIMER: This is a simulated export. Data is not real operational data.",
    "",
    `Total cards: ${cards.length}`,
    `Unresolved cards: ${unresolved.length}`,
    "",
    "Unresolved items:",
    ...unresolved.map(
      (card) => `- ${card.title} (${card.lane}, status: ${card.status}, data: ${card.dataClass})`,
    ),
    "",
    "Note: This export was generated from local demo state. Do not use in production reports.",
  ].join("\n");

  downloadTextFile("rta-shift-summary-demo.txt", summary, "text/plain");
}

// ---------------------------------------------------------------------------
// Shared download helper
// ---------------------------------------------------------------------------

/**
 * Creates a temporary anchor element and triggers a file download.
 * The object URL is revoked immediately after the click to free memory.
 *
 * @param fileName  - The name of the downloaded file.
 * @param content   - The text content to write to the file.
 * @param mimeType  - MIME type string (e.g. "text/csv", "text/plain").
 */
function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
