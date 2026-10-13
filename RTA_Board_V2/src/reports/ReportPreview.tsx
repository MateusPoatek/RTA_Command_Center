/**
 * ReportPreview.tsx — printable full reconciliation report modal.
 *
 * The element with id="grd-preview-table" is the target for exportReportPdf().
 * @media print styles (in App.css) hide the surrounding UI when this is open.
 */

import type { ReconciliationReport } from "./types";
import { exportReportPdf } from "./export";
import { typeLabelFor } from "./reportLabels";

interface ReportPreviewProps {
  report: ReconciliationReport;
  onClose: () => void;
}

export function ReportPreview({ report, onClose }: ReportPreviewProps) {
  return (
    <div
      className="adm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Report preview"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm" style={{ maxWidth: 900, width: "90vw", maxHeight: "85vh", overflow: "auto" }}>

        {/* Header */}
        <div className="adm__header">
          <div className="adm__header-left">
            <span className="adm__autonomous-banner" style={{ background: "#1e40af33" }}>
              GTT × Verint Reconciliation Report
            </span>
            <span className="adm__title">
              {report.functional_area} — {report.date}
            </span>
          </div>
          <div className="adm__header-right">
            <button
              className="grd-btn grd-btn--ghost no-print"
              onClick={() => exportReportPdf("grd-preview-table")}
            >
              Print / PDF
            </button>
            <button className="adm__close no-print" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Printable body */}
        <div id="grd-preview-table" className="adm__body" style={{ padding: "1rem" }}>

          {/* Summary */}
          <div style={{ display: "flex", gap: "2rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {((report.source === "verint_only"
              ? [
                  ["Verint Captured", report.verint_total],
                  ["Attendance Gaps", report.discrepancy_count],
                  ["Generated", new Date(report.generated_at).toLocaleString()],
                ]
              : [
                  ["GTT Attendance", report.gtt_total],
                  ["Verint Captured", report.verint_total],
                  ["Matched", report.matched],
                  ["Discrepancies", report.discrepancy_count],
                  ["Generated", new Date(report.generated_at).toLocaleString()],
                ]
            ) as [string, string | number][]).map(([label, val]) => (
              <div key={label} style={{ minWidth: 120 }}>
                <div style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Intelligence */}
          {report.intelligence.length > 0 && (
            <div style={{ marginBottom: "1.25rem", padding: "0.75rem", background: "#1e293b", borderRadius: 6, borderLeft: "3px solid #3b82f6" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#94a3b8", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Intelligence</div>
              {report.intelligence.map((b, i) => (
                <div key={i} style={{ fontSize: "0.82rem", color: "#e2e8f0", marginBottom: "0.35rem" }}>• {b}</div>
              ))}
            </div>
          )}

          {/* Discrepancy table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                {(report.source === "verint_only"
                  ? ["Employee", "Verint Status", "Adh %", "OOA", "Productive", "Type"]
                  : ["Employee", "Subgroup", "GTT Events", "Verint Status", "Adh %", "OOA", "Productive", "Type"]
                ).map((h) => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#94a3b8", borderBottom: "1px solid #334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.discrepancies.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0f172a22", borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "5px 8px" }}>{row.employee}</td>
                  {report.source !== "verint_only" && (
                    <>
                      <td style={{ padding: "5px 8px" }}>{row.subgroup || "—"}</td>
                      <td style={{ padding: "5px 8px" }}>{row.gtt_event}</td>
                    </>
                  )}
                  <td style={{ padding: "5px 8px" }}>{row.verint_status || "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{row.adherence_pct !== null ? `${row.adherence_pct}%` : "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{row.ooa_seconds ? `${Math.floor(row.ooa_seconds / 60)}m` : "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{row.productive_minutes ? `${(row.productive_minutes / 60).toFixed(1)}h` : "—"}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <span style={{
                      fontSize: "0.7rem", padding: "2px 6px", borderRadius: 4,
                      background: row.discrepancy_type === "match_ok" || row.discrepancy_type === "in_adherence_no_clock_in" ? "#22c55e22"
                        : row.discrepancy_type === "not_yet_scheduled" ? "#64748b22" : "#ef444422",
                      color: row.discrepancy_type === "match_ok" || row.discrepancy_type === "in_adherence_no_clock_in" ? "#22c55e"
                        : row.discrepancy_type === "not_yet_scheduled" ? "#64748b" : "#ef4444",
                    }}>
                      {typeLabelFor(row.discrepancy_type, report.source)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: "1rem", fontSize: "0.65rem", color: "#64748b" }}>
            Schema v{report._meta.schema_version} · Join: {report._meta.join_strategy} · Sources: {report._meta.sources.join(", ")}
          </div>
        </div>
      </div>
    </div>
  );
}
