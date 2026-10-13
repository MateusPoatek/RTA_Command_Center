/**
 * export.ts — report downloads: XLSX workbook, the discrepancy-table print, and the
 * Full Shift Report PDF (html2canvas + jsPDF over #shift-report-print).
 * Ported from the old command-center; its unused audit/summary exports were dropped.
 */

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ReconciliationReport } from "./types";

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
  const verintOnly = report.source === "verint_only";

  // Sheet 1: discrepancies. Column widths keyed by header name (not
  // positional) so verint_only can omit the GTT-only columns without the
  // widths array drifting out of sync.
  const COL_WIDTHS: Record<string, number> = {
    "Employee": 20, "Workday ID": 14, "Subgroup (GTT)": 18, "LOB (Verint)": 18,
    "GTT Events": 24, "# GTT Events": 12, "Verint Status": 20, "Adherence %": 12,
    "Adherence Minutes": 16, "OOA (sec)": 10, "OOA Minutes (Total)": 18,
    "Productive Minutes": 16, "Scheduled Minutes": 16, "Discrepancy Type": 32,
  };
  const discRows = report.discrepancies.map((d) => ({
    "Employee": d.employee,
    ...(verintOnly ? {} : { "Workday ID": d.workday_id, "Subgroup (GTT)": d.subgroup }),
    "LOB (Verint)": d.lob,
    ...(verintOnly ? {} : { "GTT Events": d.gtt_event, "# GTT Events": d.gtt_event_count }),
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
  ws1["!cols"] = Object.keys(discRows[0] ?? COL_WIDTHS).map((k) => ({ wch: COL_WIDTHS[k] ?? 16 }));
  XLSX.utils.book_append_sheet(wb, ws1, "Discrepancies");

  // Sheet 2: intelligence bullets + summary
  const summaryRows = [
    { Field: "Date", Value: report.date },
    ...(verintOnly ? [] : [{ Field: "Functional Area", Value: report.functional_area }]),
    ...(verintOnly ? [] : [{ Field: "GTT Total", Value: report.gtt_total }]),
    { Field: "Verint Total", Value: report.verint_total },
    ...(verintOnly ? [] : [{ Field: "Matched", Value: report.matched }]),
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
// Shift Report PDF export — a REAL file, not the print-dialog hack above
// ---------------------------------------------------------------------------

/**
 * Rasterizes the rendered ShiftReportPrintView DOM node (live, correctly
 * sized — including its Recharts SVGs) into a real multi-page PDF and
 * triggers a browser download.
 *
 * Unlike exportReportPdf() above (which only opens the browser's native
 * print dialog on a cloned subtree), this produces actual PDF bytes — the
 * prerequisite for any future automated delivery (email attachment, Chat
 * upload) once a delivery mechanism is decided.
 *
 * @param elementId - id of the rendered ShiftReportPrintView container.
 * @param fileName  - name for the downloaded file (without extension).
 */
export async function exportShiftReportPdf(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight; // negative offset — draws the next visible slice
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${fileName}.pdf`);
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
