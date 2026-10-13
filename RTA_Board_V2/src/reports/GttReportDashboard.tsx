/**
 * GttReportDashboard.tsx — GTT × Verint reconciliation dashboard.
 *
 * Three-pane layout:
 *   1. Summary banner  — GTT / Verint / Matched / Discrepancy counts
 *   2. Discrepancy table — sortable, colour-coded by type
 *   3. Intelligence panel — deterministic AI bullets
 */

import { useState } from "react";
import type { AdherenceSummary, ReconciliationReport, DiscrepancyRow, DiscrepancyType, ReportHistoryEntry } from "./types";
import { exportReportXlsx, exportReportPdf, exportShiftReportPdf } from "./export";
import { typeLabelFor } from "./reportLabels";
import { ReportPreview } from "./ReportPreview";
import { ReportChartsPanel } from "./ReportChartsPanel";
import { ShiftReportPrintView } from "./ShiftReportPrintView";
import type { Kpis } from "../domain/kpis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_COLOURS: Record<DiscrepancyType, string> = {
  clocked_in_not_in_adherence: "#ef4444",   // red
  in_adherence_no_clock_in:    "#22c55e",   // green — present, not a real discrepancy
  no_clock_in_no_activity:     "#f59e0b",   // amber — the genuine gap
  clocked_out_still_active:    "#8b5cf6",   // violet
  not_yet_scheduled:           "#64748b",   // slate — informational, not a real discrepancy
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

function fmtMinutesAsHm(min: number | null): string {
  if (min === null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type SortKey = keyof DiscrepancyRow;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryBanner({ report }: { report: ReconciliationReport }) {
  if (report.source === "verint_only") {
    return (
      <div className="grd-banner">
        <Stat label="Verint Captured" value={report.verint_total} colour="#a78bfa" />
        <Stat
          label="Attendance Gaps"
          value={report.discrepancy_count}
          colour={report.discrepancy_count > 0 ? "#f87171" : "#34d399"}
        />
      </div>
    );
  }

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

function TypeBadge({ type, source }: { type: DiscrepancyType; source: ReconciliationReport["source"] }) {
  return (
    <span
      className="grd-badge"
      style={{ background: TYPE_COLOURS[type] + "22", color: TYPE_COLOURS[type], borderColor: TYPE_COLOURS[type] + "55" }}
    >
      {typeLabelFor(type, source)}
    </span>
  );
}

function DiscrepancyTable({
  rows,
  visibleCols,
  source,
}: {
  rows: DiscrepancyRow[];
  visibleCols: (keyof DiscrepancyRow)[];
  source: ReconciliationReport["source"];
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
    "no_clock_in_no_activity",
    "clocked_out_still_active",
    "not_yet_scheduled",
    "match_ok",
  ];

  // Counts per type — computed from the FULL (unfiltered) row set, always
  // reflecting all rows so every tab shows its own count regardless of which
  // filter is currently active (see how many of each category exist without
  // having to click through each tab one by one).
  const typeCounts: Record<DiscrepancyType | "all", number> = {
    all: rows.length,
    clocked_in_not_in_adherence: 0,
    in_adherence_no_clock_in: 0,
    no_clock_in_no_activity: 0,
    clocked_out_still_active: 0,
    not_yet_scheduled: 0,
    match_ok: 0,
  };
  for (const r of rows) typeCounts[r.discrepancy_type] += 1;

  const colLabels: Record<keyof DiscrepancyRow, string> = {
    workday_id: "Workday ID",
    employee: "Employee",
    subgroup: "Subgroup",
    lob: "LOB",
    gtt_event: "GTT Events",
    gtt_event_count: "# Events",
    verint_status: "Verint Status",
    adherence_pct: "Adh %",
    ooa_seconds: "OOA",
    adherence_minutes: "Adh Min",
    productive_minutes: "Productive",
    ooa_minutes: "OOA Min",
    scheduled_minutes: "Scheduled",
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
            {t === "all" ? "All" : typeLabelFor(t, source)}
            <span className="grd-filter-btn__count">{typeCounts[t]}</span>
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
                className={`grd-tr${!["match_ok", "not_yet_scheduled"].includes(row.discrepancy_type) ? " grd-tr--issue" : ""}`}
              >
                {visibleCols.map((col) => (
                  <td key={col} className="grd-td">
                    {col === "discrepancy_type" ? (
                      <TypeBadge type={row.discrepancy_type} source={source} />
                    ) : col === "ooa_seconds" ? (
                      fmtOoa(row.ooa_seconds)
                    ) : col === "adherence_pct" ? (
                      fmtAdh(row.adherence_pct)
                    ) : col === "adherence_minutes" ? (
                      fmtMinutesAsHm(row.adherence_minutes)
                    ) : col === "productive_minutes" ? (
                      fmtMinutesAsHm(row.productive_minutes)
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
  snapshotsToday?: ReportHistoryEntry[];
  adherence: AdherenceSummary;
  alertAgents: string[];
  kpis?: Kpis;
  kpisAsOf?: number;
  accountLabel?: string;
  onOpenConfig: () => void;
}

export function GttReportDashboard({ report, visibleColumns, snapshotsToday, adherence, alertAgents, kpis, kpisAsOf, accountLabel, onOpenConfig }: GttReportDashboardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showShiftReport, setShowShiftReport] = useState(false);
  const [view, setView] = useState<"table" | "charts">("table");

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
          <button
            className="grd-btn grd-btn--ghost"
            onClick={() => setShowShiftReport(true)}
            title="Full Attendance + Adherence + Intelligence shift report"
          >
            Full Shift Report
          </button>
        </div>
      </div>

      {/* Summary banner */}
      <SummaryBanner report={report} />

      {/* Table / Charts toggle — same visual pattern as the Priority Feed / Floor View toggle */}
      <div className="left-view-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "table"}
          className={`lvt-btn${view === "table" ? " lvt-btn--active" : ""}`}
          onClick={() => setView("table")}
        >
          Table
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "charts"}
          className={`lvt-btn${view === "charts" ? " lvt-btn--active" : ""}`}
          onClick={() => setView("charts")}
        >
          Charts
        </button>
      </div>

      {view === "table" ? (
        <DiscrepancyTable rows={report.discrepancies} visibleCols={visibleColumns} source={report.source} />
      ) : (
        <ReportChartsPanel report={report} snapshotsToday={snapshotsToday ?? []} />
      )}

      {/* Intelligence */}
      <IntelligencePanel bullets={report.intelligence} />

      {/* Print preview modal */}
      {showPreview && (
        <ReportPreview report={report} onClose={() => setShowPreview(false)} />
      )}

      {/* Full Shift Report modal — Attendance + Adherence + Intelligence */}
      {showShiftReport && (
        <div
          className="adm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Full shift report"
          onClick={(e) => { if (e.target === e.currentTarget) setShowShiftReport(false); }}
        >
          <div className="adm" style={{ maxWidth: 900, width: "90vw", maxHeight: "90vh", overflow: "auto" }}>
            <div className="adm__header">
              <span className="adm__title">Full Shift Report</span>
              <div className="adm__header-right">
                <button
                  className="grd-btn grd-btn--ghost no-print"
                  onClick={() => exportShiftReportPdf("shift-report-print", `shift-report-${report.date}`)}
                >
                  Export PDF
                </button>
                <button className="adm__close no-print" onClick={() => setShowShiftReport(false)} aria-label="Close">✕</button>
              </div>
            </div>
            <ShiftReportPrintView report={report} adherence={adherence} alertAgents={alertAgents} kpis={kpis} kpisAsOf={kpisAsOf} accountLabel={accountLabel ?? report.functional_area} />
          </div>
        </div>
      )}
    </div>
  );
}
