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

import * as XLSX from "xlsx";
import type { AuditEvent, CommandCard, ReconciliationReport } from "../domain/types";

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
// GTT × Verint Reconciliation Report — XLSX export
// ---------------------------------------------------------------------------

/**
 * Exports a ReconciliationReport as a two-sheet XLSX workbook:
 *   Sheet 1 "Discrepancies" — one row per discrepancy
 *   Sheet 2 "Intelligence"  — bullet-point intelligence summary
 */
export function exportReportXlsx(report: ReconciliationReport): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: discrepancies
  const discRows = report.discrepancies.map((d) => ({
    "Employee": d.employee,
    "Workday ID": d.workday_id,
    "Subgroup (GTT)": d.subgroup,
    "LOB (Verint)": d.lob,
    "GTT Events": d.gtt_event,
    "# GTT Events": d.gtt_event_count,
    "Verint Status": d.verint_status,
    "Adherence %": d.adherence_pct ?? "",
    "Adherence Minutes": d.adherence_minutes ?? "",
    "OOA (sec)": d.ooa_seconds ?? "",
    "OOA Minutes (Total)": d.ooa_minutes ?? "",
    "Productive Minutes": d.productive_minutes ?? "",
    "Scheduled Minutes": d.scheduled_minutes ?? "",
    "Discrepancy Type": d.discrepancy_type,
  }));
  const ws1 = XLSX.utils.json_to_sheet(discRows);
  ws1["!cols"] = [20, 14, 18, 18, 24, 12, 20, 12, 16, 10, 18, 16, 16, 32].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, "Discrepancies");

  // Sheet 2: intelligence bullets + summary
  const summaryRows = [
    { Field: "Date", Value: report.date },
    { Field: "Functional Area", Value: report.functional_area },
    { Field: "GTT Total", Value: report.gtt_total },
    { Field: "Verint Total", Value: report.verint_total },
    { Field: "Matched", Value: report.matched },
    { Field: "Discrepancies", Value: report.discrepancy_count },
    { Field: "Generated At", Value: report.generated_at },
    { Field: "", Value: "" },
    ...report.intelligence.map((bullet, i) => ({
      Field: `Intelligence ${i + 1}`,
      Value: bullet,
    })),
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2["!cols"] = [{ wch: 20 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Intelligence");

  XLSX.writeFile(wb, `gtt-verint-report-${report.date}.xlsx`);
}

// ---------------------------------------------------------------------------
// GTT × Verint Reconciliation Report — PDF (browser print)
// ---------------------------------------------------------------------------

/**
 * Triggers the browser's print dialog scoped to a specific DOM element.
 * The element must have an id matching `elementId`.
 * Uses @media print styles defined in the component to hide the surrounding UI.
 */
export function exportReportPdf(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;

  const printWindow = window.open("", "_blank", "width=1024,height=768");
  if (!printWindow) return;

  // Grab all page stylesheets so fonts/colours survive the new window
  const styles = Array.from(document.styleSheets)
    .map((ss) => {
      try {
        return Array.from(ss.cssRules).map((r) => r.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>GTT × Verint Report ${elementId}</title>
<style>
  ${styles}
  body { background: white; color: black; font-family: sans-serif; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>${el.innerHTML}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 400);
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
