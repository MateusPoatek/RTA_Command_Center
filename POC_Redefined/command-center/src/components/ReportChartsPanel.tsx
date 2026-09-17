/**
 * ReportChartsPanel.tsx — charts tab for the GTT × Verint reconciliation report.
 *
 * Eight visualizations, each chosen for the job the data actually does
 * (dataviz skill's form table), not defaulted to bar/pie:
 *   1. Productive hours, projected vs. so far — a METER (ratio against a limit)
 *   2. GTT event mix — donut, top-5 + "Other" (skill anti-pattern: uncapped
 *      pies with 15-20 slices are unreadable; capped at 6 total segments)
 *   3. Peak productivity hour — bar with EMPHASIS (peak hour accented, rest grayed)
 *   4. Attendance evolution — TWO stacked area charts sharing one x-axis,
 *      never one dual-axis chart (agent-count and productive-minutes are
 *      different scales — a shared axis would fabricate a correlation)
 *   5. Utilization / Shrinkage — one stacked bar, two categorical series
 *   6. Absenteeism — a stat tile (single number, not a chart)
 *   7. Adherence split — 2-slice pie (in vs. out of adherence), requested
 *      explicitly; a standard WFM convention despite the skill's general
 *      preference for a stat tile at 2 slices
 *   8. GTT vs. Verint totals (today) — two-LINE chart sharing one axis
 *      (both series are the same unit: headcount), one point per scheduled
 *      or manual generation today. Empty until the first generation.
 *
 * Categorical color set (CHART_COLORS below) is a SEPARATE palette from this
 * app's severity colors (--critical/--high/--medium/--low/--info) — those are
 * reserved status colors and fail validation as a general categorical chart
 * palette (confirmed via the dataviz skill's validate_palette.js). This set
 * is the skill's own reference categorical palette, re-validated against this
 * app's actual light surface.
 */

import { memo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ReconciliationReport, DiscrepancyRow, HourlyAttendanceBucket, ReportHistoryEntry } from "../domain/types";

const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const EMPHASIS_COLOR = CHART_COLORS[0];
const DEEMPHASIS_COLOR = "#c7ccd6";

function fmtHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

function fmtHm(min: number): string {
  return `${(min / 60).toFixed(1)}h`;
}

function EmptyCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rcp-card">
      <div className="rcp-card__title">{title}</div>
      <div className="rcp-card__empty">{message}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Productive hours — projected vs. so far (meter)
// ---------------------------------------------------------------------------

function ProductiveHoursMeter({ rows, generatedAt }: { rows: DiscrepancyRow[]; generatedAt: string }) {
  const withBoth = rows.filter(
    (r) => r.productive_minutes != null && r.scheduled_minutes != null && r.scheduled_minutes > 0,
  );
  if (withBoth.length === 0) {
    return <EmptyCard title="Productive Hours — Projected vs. So Far" message="No scheduled-shift data captured yet." />;
  }
  const totalProductive = withBoth.reduce((n, r) => n + (r.productive_minutes || 0), 0);
  const totalScheduled = withBoth.reduce((n, r) => n + (r.scheduled_minutes || 0), 0);
  const pct = Math.min(100, Math.round((totalProductive / totalScheduled) * 100));
  const asOf = new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rcp-card">
      <div className="rcp-card__title">Productive Hours — Projected vs. So Far</div>
      <div className="rcp-meter">
        <div className="rcp-meter__value">{pct}%</div>
        <div className="rcp-meter__bar"><div className="rcp-meter__fill" style={{ width: `${pct}%` }} /></div>
        <div className="rcp-meter__sub">
          {fmtHm(totalProductive)} so far of {fmtHm(totalScheduled)} projected today — {withBoth.length} agent(s), as of {asOf}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. GTT event mix — donut, top-5 + Other
// ---------------------------------------------------------------------------

function GttEventMixChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <EmptyCard title="GTT Event Mix" message="No GTT events captured yet." />;
  }
  const top = entries.slice(0, 5);
  const otherTotal = entries.slice(5).reduce((n, [, c]) => n + c, 0);
  const data = [
    ...top.map(([name, value]) => ({ name, value })),
    ...(otherTotal > 0 ? [{ name: "Other", value: otherTotal }] : []),
  ];

  return (
    <div className="rcp-card">
      <div className="rcp-card__title">GTT Event Mix</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={entry.name === "Other" ? DEEMPHASIS_COLOR : CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="rcp-legend">
        {data.map((entry, i) => (
          <span key={entry.name} className="rcp-legend__item">
            <span
              className="rcp-legend__dot"
              style={{ background: entry.name === "Other" ? DEEMPHASIS_COLOR : CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {entry.name} ({entry.value})
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Peak productivity hour — emphasis bar
// ---------------------------------------------------------------------------

function PeakHourChart({ hourly }: { hourly: HourlyAttendanceBucket[] }) {
  if (hourly.length === 0) {
    return <EmptyCard title="Peak Productivity Hour" message="No hourly data captured yet." />;
  }
  const peak = hourly.reduce((max, h) => (h.productive_minutes > max.productive_minutes ? h : max), hourly[0]);
  const data = hourly.map((h) => ({ ...h, label: fmtHour(h.hour) }));

  return (
    <div className="rcp-card">
      <div className="rcp-card__title">Peak Productivity Hour — {fmtHour(peak.hour)} ({fmtHm(peak.productive_minutes)})</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip formatter={(v: number) => [fmtHm(v), "Productive"]} />
          <Bar dataKey="productive_minutes" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.hour} fill={entry.hour === peak.hour ? EMPHASIS_COLOR : DEEMPHASIS_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Attendance evolution — two stacked area charts, one shared x-axis
// ---------------------------------------------------------------------------

function AttendanceEvolutionChart({ hourly }: { hourly: HourlyAttendanceBucket[] }) {
  if (hourly.length === 0) {
    return <EmptyCard title="Attendance Evolution" message="No hourly data captured yet." />;
  }
  const data = hourly.map((h) => ({ ...h, label: fmtHour(h.hour) }));
  const peak = hourly.reduce((max, h) => (h.agent_count > max.agent_count ? h : max), hourly[0]);

  return (
    <div className="rcp-card rcp-card--wide">
      <div className="rcp-card__title">Attendance Evolution — peak at {fmtHour(peak.hour)} ({peak.agent_count} agent(s))</div>
      <div className="rcp-card__sublabel">Agents active, by hour</div>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip formatter={(v: number) => [v, "Agents"]} />
          <Area type="monotone" dataKey="agent_count" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.18} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="rcp-card__sublabel">Productive minutes, by hour</div>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip formatter={(v: number) => [fmtHm(v), "Productive"]} />
          <Area type="monotone" dataKey="productive_minutes" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.18} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Utilization / Shrinkage — one stacked bar
// ---------------------------------------------------------------------------

function UtilizationChart({ rows }: { rows: DiscrepancyRow[] }) {
  const withBoth = rows.filter(
    (r) => r.productive_minutes != null && r.scheduled_minutes != null && r.scheduled_minutes > 0,
  );
  if (withBoth.length === 0) {
    return <EmptyCard title="Utilization vs. Shrinkage" message="No scheduled-shift data captured yet." />;
  }
  const totalProductive = withBoth.reduce((n, r) => n + (r.productive_minutes || 0), 0);
  const totalScheduled = withBoth.reduce((n, r) => n + (r.scheduled_minutes || 0), 0);
  const utilizationPct = Math.min(100, Math.round((totalProductive / totalScheduled) * 100));
  const shrinkagePct = 100 - utilizationPct;
  const data = [{ name: "Floor", Utilization: utilizationPct, Shrinkage: shrinkagePct }];

  return (
    <div className="rcp-card">
      <div className="rcp-card__title">Utilization vs. Shrinkage — {utilizationPct}% / {shrinkagePct}%</div>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Bar dataKey="Utilization" stackId="a" fill={CHART_COLORS[2]} radius={[4, 0, 0, 4]} />
          <Bar dataKey="Shrinkage" stackId="a" fill={DEEMPHASIS_COLOR} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="rcp-legend">
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: CHART_COLORS[2] }} />Utilization ({withBoth.length} agents)</span>
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: DEEMPHASIS_COLOR }} />Shrinkage</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Absenteeism — stat tile
// ---------------------------------------------------------------------------

function AbsenteeismStat({ rows, verintTotal }: { rows: DiscrepancyRow[]; verintTotal: number }) {
  // in_adherence_no_clock_in is NOT absenteeism — that agent has real Verint
  // activity, just no GTT clock-in. Only count real gaps.
  const absentCount = rows.filter(
    (r) => r.discrepancy_type === "clocked_in_not_in_adherence" || r.discrepancy_type === "no_clock_in_no_activity",
  ).length;
  const rate = verintTotal > 0 ? (absentCount / verintTotal) * 100 : 0;

  return (
    <div className="rcp-card rcp-card--stat">
      <div className="rcp-card__title">Absenteeism</div>
      <div className="rcp-stat__value">{rate.toFixed(1)}%</div>
      <div className="rcp-stat__sub">{absentCount} of {verintTotal} agent(s)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Adherence split — 2-slice pie
// ---------------------------------------------------------------------------

function AdherenceSplitChart({ rows }: { rows: DiscrepancyRow[] }) {
  const totalAdh = rows.reduce((n, r) => n + (r.adherence_minutes || 0), 0);
  const totalOoa = rows.reduce((n, r) => n + (r.ooa_minutes || 0), 0);
  const total = totalAdh + totalOoa;
  if (total === 0) {
    return <EmptyCard title="Adherence Split" message="No adherence data captured yet." />;
  }
  const pct = Math.round((totalAdh / total) * 100);
  const data = [
    { name: "In adherence", value: totalAdh },
    { name: "Out of adherence", value: totalOoa },
  ];

  return (
    <div className="rcp-card">
      <div className="rcp-card__title">Adherence Split — {pct}% in-adherence</div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={70} stroke="var(--surface)" strokeWidth={2}>
            <Cell fill={CHART_COLORS[2]} />
            <Cell fill={CHART_COLORS[1]} />
          </Pie>
          <Tooltip formatter={(v: number) => fmtHm(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="rcp-legend">
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: CHART_COLORS[2] }} />In adherence ({fmtHm(totalAdh)})</span>
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: CHART_COLORS[1] }} />Out of adherence ({fmtHm(totalOoa)})</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. GTT vs. Verint totals — today's scheduled + manual generations
// ---------------------------------------------------------------------------
// GTT's total grows through the day as more agents clock in; Verint's
// captured roster only reflects whatever was last pulled. Same unit
// (headcount) across both series, so one shared axis is correct here —
// unlike Attendance Evolution above, which deliberately keeps agent-count
// and productive-minutes on separate charts.

function GttVsVerintChart({ snapshots }: { snapshots: ReportHistoryEntry[] }) {
  if (snapshots.length === 0) {
    return <EmptyCard title="GTT vs. Verint Totals — Today" message="No generations yet today." />;
  }
  const data = snapshots.map((s) => ({
    label: new Date(s.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    gtt_total: s.gtt_total,
    verint_total: s.verint_total,
  }));
  const latest = snapshots[snapshots.length - 1];
  const gap = latest.gtt_total - latest.verint_total;

  return (
    <div className="rcp-card rcp-card--wide">
      <div className="rcp-card__title">
        GTT vs. Verint Totals — Today
        {gap !== 0 && ` (${Math.abs(gap)} ${gap > 0 ? "more in GTT" : "more in Verint"} as of last generation)`}
      </div>
      <div className="rcp-card__sublabel">One point per report generation (manual or scheduled)</div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip />
          <Line type="monotone" dataKey="gtt_total" name="GTT total" stroke={CHART_COLORS[0]} strokeWidth={2} dot />
          <Line type="monotone" dataKey="verint_total" name="Verint total" stroke={CHART_COLORS[1]} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
      <div className="rcp-legend">
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: CHART_COLORS[0] }} />GTT total</span>
        <span className="rcp-legend__item"><span className="rcp-legend__dot" style={{ background: CHART_COLORS[1] }} />Verint total</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// Memoized: App.tsx keeps all state in one component, and several always-
// running 1s timers (live-bridge heartbeat, batch countdown, live-engine
// scan) re-render the whole tree every second regardless of whether report
// data changed. Without this, Recharts saw "new" data on every one of those
// ticks and re-triggered its enter animations on all 8 charts each time —
// increasingly expensive as the report's discrepancy rows accumulate over a
// shift, which is why it visibly got slower over time rather than starting
// slow. `report`/`snapshotsToday` are otherwise referentially stable across
// those ticks (they only change on an actual report generation), so this
// correctly skips the vast majority of re-renders.
export const ReportChartsPanel = memo(function ReportChartsPanel({ report, snapshotsToday }: { report: ReconciliationReport; snapshotsToday?: ReportHistoryEntry[] }) {
  const rows = report.discrepancies;
  // Defensive fallbacks: a report generated by an older backend (before these
  // fields existed) or loaded from a stale cached file won't have them at
  // all. Without this, Object.entries(undefined) etc. throws during render
  // and — with no error boundary anywhere in this tree — takes the whole
  // page down to a blank screen instead of just an empty chart.
  const eventCounts = report.gtt_event_type_counts ?? {};
  const hourly = report.hourly_attendance ?? [];
  // GTT×Verint comparison charts are meaningless in verint_only mode — GTT
  // was never queried, so they'd just show a permanent "no GTT data" empty
  // state instead of a real gap.
  return (
    <div className="rcp-grid">
      <ProductiveHoursMeter rows={rows} generatedAt={report.generated_at} />
      {report.source !== "verint_only" && <GttEventMixChart counts={eventCounts} />}
      <PeakHourChart hourly={hourly} />
      <AttendanceEvolutionChart hourly={hourly} />
      <UtilizationChart rows={rows} />
      <AbsenteeismStat rows={rows} verintTotal={report.verint_total} />
      <AdherenceSplitChart rows={rows} />
      {report.source !== "verint_only" && <GttVsVerintChart snapshots={snapshotsToday ?? []} />}
    </div>
  );
});
