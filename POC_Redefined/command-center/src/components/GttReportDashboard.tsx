/**
 * GttReportDashboard.tsx — GTT × Verint reconciliation dashboard.
 *
 * Three-pane layout:
 *   1. Summary banner  — GTT / Verint / Matched / Discrepancy counts
 *   2. Discrepancy table — sortable, colour-coded by type
 *   3. Intelligence panel — deterministic AI bullets
 */

import { useState } from "react";
import type { ReconciliationReport, DiscrepancyRow, DiscrepancyType } from "../domain/types";
import { exportReportXlsx, exportReportPdf } from "../utils/export";
import { ReportPreview } from "./ReportPreview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<DiscrepancyType, string> = {
  clocked_in_not_in_adherence: "No Verint record",
  in_adherence_no_clock_in:    "No GTT clock-in",
  clocked_out_still_active:    "Ghost session",
  match_ok:                    "OK",
};

const TYPE_COLOURS: Record<DiscrepancyType, string> = {
  clocked_in_not_in_adherence: "#ef4444",   // red
  in_adherence_no_clock_in:    "#f59e0b",   // amber
  clocked_out_still_active:    "#8b5cf6",   // violet
  match_ok:                    "#22c55e",   // green
};

function fmtOoa(sec: number | null): string {
  if (sec === null) return "—";
  if (sec === 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtAdh(pct: number | null): string {
  return pct !== null ? `${pct.toFixed(0)}%` : "—";
}

type SortKey = keyof DiscrepancyRow;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryBanner({ report }: { report: ReconciliationReport }) {
  const pct = report.gtt_total > 0
    ? Math.round((report.matched / report.gtt_total) * 100)
    : 0;

  return (
    <div className="grd-banner">
      <Stat label="GTT Attendance" value={report.gtt_total} colour="#60a5fa" />
      <Stat label="Verint Captured" value={report.verint_total} colour="#a78bfa" />
      <Stat label="Matched" value={`${report.matched} (${pct}%)`} colour="#34d399" />
      <Stat
        label="Discrepancies"
        value={report.discrepancy_count}
        colour={report.discrepancy_count > 0 ? "#f87171" : "#34d399"}
      />
    </div>
  );
}

function Stat({ label, value, colour }: { label: string; value: number | string; colour: string }) {
  return (
    <div className="grd-stat">
      <span className="grd-stat__value" style={{ color: colour }}>{value}</span>
      <span className="grd-stat__label">{label}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: DiscrepancyType }) {
  return (
    <span
      className="grd-badge"
      style={{ background: TYPE_COLOURS[type] + "22", color: TYPE_COLOURS[type], borderColor: TYPE_COLOURS[type] + "55" }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function DiscrepancyTable({
  rows,
  visibleCols,
}: {
  rows: DiscrepancyRow[];
  visibleCols: (keyof DiscrepancyRow)[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("discrepancy_type");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<DiscrepancyType | "all">("all");

  const filtered = filter === "all" ? rows : rows.filter((r) => r.discrepancy_type === filter);

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const allTypes: (DiscrepancyType | "all")[] = [
    "all",
    "clocked_in_not_in_adherence",
    "in_adherence_no_clock_in",
    "clocked_out_still_active",
    "match_ok",
  ];

  const colLabels: Record<keyof DiscrepancyRow, string> = {
    workday_id: "Workday ID",
    employee: "Employee",
    subgroup: "Subgroup",
    lob: "LOB",
    gtt_event: "GTT Event",
    verint_status: "Verint Status",
    adherence_pct: "Adh %",
    ooa_seconds: "OOA",
    discrepancy_type: "Type",
  };

  return (
    <div className="grd-table-wrap">
      <div className="grd-filters">
        {allTypes.map((t) => (
          <button
            key={t}
            className={`grd-filter-btn${filter === t ? " grd-filter-btn--active" : ""}`}
            onClick={() => setFilter(t)}
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
        <span className="grd-filter-count">{sorted.length} rows</span>
      </div>

      <div className="grd-table-scroll">
        <table className="grd-table">
          <thead>
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col}
                  className="grd-th"
                  onClick={() => toggleSort(col)}
                >
                  {colLabels[col]}
                  {sortKey === col && (sortAsc ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={i}
                className={`grd-tr${row.discrepancy_type !== "match_ok" ? " grd-tr--issue" : ""}`}
              >
                {visibleCols.map((col) => (
                  <td key={col} className="grd-td">
                    {col === "discrepancy_type" ? (
                      <TypeBadge type={row.discrepancy_type} />
                    ) : col === "ooa_seconds" ? (
                      fmtOoa(row.ooa_seconds)
                    ) : col === "adherence_pct" ? (
                      fmtAdh(row.adherence_pct)
                    ) : (
                      String(row[col] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IntelligencePanel({ bullets }: { bullets: string[] }) {
  return (
    <div className="grd-intel">
      <div className="grd-intel__header">Intelligence</div>
      <ul className="grd-intel__list">
        {bullets.map((b, i) => (
          <li key={i} className="grd-intel__item">
            <span className="grd-intel__dot">•</span>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GttReportDashboardProps {
  report: ReconciliationReport;
  visibleColumns: (keyof DiscrepancyRow)[];
  onOpenConfig: () => void;
}

export function GttReportDashboard({ report, visibleColumns, onOpenConfig }: GttReportDashboardProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="grd">
      {/* Toolbar */}
      <div className="grd-toolbar">
        <span className="grd-toolbar__title">
          GTT × Verint — {report.date}
          <span className="grd-toolbar__fa"> ({report.functional_area})</span>
        </span>
        <div className="grd-toolbar__actions">
          <button className="grd-btn grd-btn--ghost" onClick={onOpenConfig} title="Report settings">
            ⚙ Config
          </button>
          <button className="grd-btn grd-btn--ghost" onClick={() => setShowPreview(true)} title="Preview & print">
            Preview
          </button>
          <button
            className="grd-btn grd-btn--ghost"
            onClick={() => exportReportPdf("grd-preview-table")}
            title="Export PDF"
          >
            PDF
          </button>
          <button
            className="grd-btn grd-btn--primary"
            onClick={() => exportReportXlsx(report)}
            title="Export XLSX"
          >
            XLSX
          </button>
        </div>
      </div>

      {/* Summary banner */}
      <SummaryBanner report={report} />

      {/* Discrepancy table */}
      <DiscrepancyTable rows={report.discrepancies} visibleCols={visibleColumns} />

      {/* Intelligence */}
      <IntelligencePanel bullets={report.intelligence} />

      {/* Print preview modal */}
      {showPreview && (
        <ReportPreview report={report} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
