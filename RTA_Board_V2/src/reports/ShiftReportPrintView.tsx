/**
 * ShiftReportPrintView.tsx — the composed end-of-shift report: Attendance
 * (GTT×Verint reconciliation) + Adherence (live violation queue, rolled up
 * fresh since it has no backend representation) + combined Intelligence.
 *
 * Rendered inside its own modal (parallel to ReportPreview, not replacing
 * it — ReportPreview stays the quick discrepancy-table view). This is the
 * target `exportShiftReportPdf()` rasterizes to PDF, so every section here
 * needs to actually be visible in the DOM at render time — no reliance on
 * hover/collapsed state.
 */
import type { ReactNode } from "react";
import type { AdherenceSummary, ReconciliationReport } from "./types";
import type { Kpis } from "../domain/kpis";
import { nameKey } from "../domain/join";
import { telusColors, TELUS_LOGO_URL } from "./brandConfig";
import { ReportChartsPanel } from "./ReportChartsPanel";

// ---------------------------------------------------------------------------
// Cross-reference: agents who both have a real Attendance gap (per the GTT×
// Verint report) AND appear in today's Adherence violation queue. Only
// possible here, where both data sources exist together.
// ---------------------------------------------------------------------------

const REAL_ATTENDANCE_GAP_TYPES = new Set(["clocked_in_not_in_adherence", "no_clock_in_no_activity"]);

function buildCrossReferenceBullets(report: ReconciliationReport, alertAgents: string[]): string[] {
  const attendanceGapNames = new Set(
    report.discrepancies
      .filter((d) => REAL_ATTENDANCE_GAP_TYPES.has(d.discrepancy_type))
      .map((d) => d.employee),
  );
  const adherenceNames = new Set(alertAgents.map(nameKey));
  const both = [...attendanceGapNames].filter((n) => adherenceNames.has(nameKey(n)));
  if (both.length === 0) return [];
  return [
    `${both.length} agent(s) had BOTH an attendance gap and an adherence violation today: ` +
      `${both.slice(0, 5).join(", ")}${both.length > 5 ? `, +${both.length - 5} more` : ""} — worth a direct check-in.`,
  ];
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: "1rem", fontWeight: 700, color: telusColors.forest,
      borderBottom: `2px solid ${telusColors.forest}`, paddingBottom: "0.35rem", marginBottom: "0.75rem",
    }}>
      {children}
    </div>
  );
}

function StatTile({ label, value, colour }: { label: string; value: number | string; colour?: string }) {
  return (
    <div style={{
      background: telusColors.moonstone, borderRadius: 8, padding: "0.75rem 1rem",
      minWidth: 120, textAlign: "center",
    }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: colour ?? telusColors.forest }}>{value}</div>
      <div style={{ fontSize: "0.7rem", color: telusColors.slate, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function BulletList({ items, colour }: { items: string[]; colour?: string }) {
  if (items.length === 0) {
    return <p style={{ fontSize: "0.8rem", color: telusColors.slate }}>None.</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {items.map((text, i) => (
        <li key={i} style={{ fontSize: "0.8rem", color: colour ?? telusColors.obsidian }}>{text}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface ShiftReportPrintViewProps {
  report: ReconciliationReport;
  /** From the board's alert model (reports/adherenceSummary.ts) — same rules as the Floor. */
  adherence: AdherenceSummary;
  alertAgents: string[];
  /** The Floor's headline numbers, as of the last Verint capture, so the PDF and the screen agree. */
  kpis?: Kpis;
  kpisAsOf?: number;
  accountLabel: string;
}

const pctOr = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

export function ShiftReportPrintView({ report, adherence, alertAgents, kpis, kpisAsOf, accountLabel }: ShiftReportPrintViewProps) {
  const crossReference = buildCrossReferenceBullets(report, alertAgents);
  const combinedIntelligence = [...report.intelligence, ...crossReference];
  const matchedPct = report.gtt_total > 0 ? Math.round((report.matched / report.gtt_total) * 100) : 0;

  return (
    <div
      id="shift-report-print"
      style={{
        background: telusColors.pearl, color: telusColors.obsidian, padding: "1.5rem",
        display: "flex", flexDirection: "column", gap: "1.5rem", fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `3px solid ${telusColors.forest}`, paddingBottom: "1rem",
      }}>
        <div>
          {TELUS_LOGO_URL ? (
            <img src={TELUS_LOGO_URL} alt="TELUS" style={{ height: 32 }} />
          ) : (
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: telusColors.forest, letterSpacing: "0.02em" }}>
              TELUS
            </span>
          )}
          <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.25rem" }}>
            End-of-Shift Report — {accountLabel}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.75rem", color: telusColors.slate }}>
          <div>{report.date}</div>
          <div>Generated {new Date(report.generated_at).toLocaleString()}</div>
        </div>
      </div>

      {/* Headline numbers: the same figures as the Floor's KPI line */}
      {kpis && (
        <section>
          <SectionTitle>Headline numbers (as of {kpisAsOf ? new Date(kpisAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "last capture"})</SectionTitle>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <StatTile label="Attendance" value={pctOr(kpis.attendance.pct)} />
            <StatTile label="Adherence" value={pctOr(kpis.adherence.pct)} />
            <StatTile label="Shrinkage" value={pctOr(kpis.shrink.pct)} colour={telusColors.purple} />
            <StatTile label="Productive hours" value={`${kpis.productive.hours}h of ${kpis.productive.schedHours}h`} />
            <StatTile label="Unpublished schedules (excluded)" value={kpis.unpublished} colour={telusColors.slate} />
          </div>
        </section>
      )}

      {/* Attendance */}
      <section>
        <SectionTitle>{report.source === "verint_only" ? "Attendance (Verint)" : "Attendance (GTT × Verint)"}</SectionTitle>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {report.source !== "verint_only" && <StatTile label="GTT Attendance" value={report.gtt_total} />}
          <StatTile label="Verint Captured" value={report.verint_total} colour={telusColors.purple} />
          {report.source !== "verint_only" && (
            <StatTile label="Matched" value={`${report.matched} (${matchedPct}%)`} colour={telusColors.forest} />
          )}
          <StatTile
            label={report.source === "verint_only" ? "Attendance Gaps" : "Discrepancies"}
            value={report.discrepancy_count}
            colour={report.discrepancy_count > 0 ? "#c0392b" : telusColors.forest}
          />
          <StatTile label="Total Productive Hours" value={(report.total_productive_minutes / 60).toFixed(1) + "h"} />
        </div>
        <ReportChartsPanel report={report} />
      </section>

      {/* Adherence */}
      <section>
        <SectionTitle>Adherence (Real-Time Violations)</SectionTitle>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <StatTile label="Total Violations" value={adherence.totalViolations} colour={telusColors.purple} />
          <StatTile label="On it (TL acknowledged)" value={adherence.byOutcome.resolved} />
          <StatTile label="Escalated" value={adherence.byOutcome.escalated} colour="#c0392b" />
          <StatTile label="Sent" value={adherence.byOutcome.sent} />
          <StatTile label="Suppressed" value={adherence.byOutcome.suppressed} />
          <StatTile label="Still Active" value={adherence.byOutcome.active} colour="#e67e22" />
        </div>

        {adherence.perLob.length > 0 && (
          <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse", marginBottom: "1rem" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${telusColors.border}`, textAlign: "left" }}>
                <th style={{ padding: "0.3rem 0.5rem" }}>LOB</th>
                <th style={{ padding: "0.3rem 0.5rem" }}>Violations</th>
                <th style={{ padding: "0.3rem 0.5rem" }}>Avg Adherence Out %</th>
              </tr>
            </thead>
            <tbody>
              {adherence.perLob.map((row) => (
                <tr key={row.lob} style={{ borderBottom: `1px solid ${telusColors.borderSoft}` }}>
                  <td style={{ padding: "0.3rem 0.5rem" }}>{row.lob}</td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>{row.violationCount}</td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    {row.avgAdherenceOutPercent != null ? `${row.avgAdherenceOutPercent.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adherence.topOffenders.length > 0 && (
          <>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem", color: telusColors.slate }}>
              Top offenders today
            </div>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${telusColors.border}`, textAlign: "left" }}>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Agent</th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>LOB</th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Violations</th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Worst Adherence Out %</th>
                </tr>
              </thead>
              <tbody>
                {adherence.topOffenders.map((row) => (
                  <tr key={row.agentName} style={{ borderBottom: `1px solid ${telusColors.borderSoft}` }}>
                    <td style={{ padding: "0.3rem 0.5rem" }}>{row.agentName}</td>
                    <td style={{ padding: "0.3rem 0.5rem" }}>{row.lob}</td>
                    <td style={{ padding: "0.3rem 0.5rem" }}>{row.violationCount}</td>
                    <td style={{ padding: "0.3rem 0.5rem" }}>
                      {row.worstAdherenceOutPercent != null ? `${row.worstAdherenceOutPercent.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* Points of Attention */}
      <section>
        <SectionTitle>Points of Attention</SectionTitle>
        <BulletList items={report.points_of_attention} colour="#c0392b" />
      </section>

      {/* Combined Intelligence */}
      <section>
        <SectionTitle>Intelligence Summary</SectionTitle>
        <BulletList items={combinedIntelligence} />
      </section>

      {/* Footer */}
      <div style={{ fontSize: "0.65rem", color: telusColors.slate, borderTop: `1px solid ${telusColors.rule}`, paddingTop: "0.5rem" }}>
        Schema {report._meta.schema_version} · Join strategy: {report._meta.join_strategy} · Sources: {report._meta.sources.join(", ")}
      </div>
    </div>
  );
}
