/**
 * HealthStrip.tsx
 * ---------------
 * Compact top band showing 6 live operational health metrics.
 * Answers the ambient question: "Is anything breaking right now?"
 * without requiring the RTA to navigate anywhere.
 *
 * Metrics (normal mode):
 *  · SLA risk      — lowest SLA across all LOBs
 *  · Queue         — total calls holding
 *  · AI rate       — % of cards handled without RTA action
 *  · Incidents     — open critical / escalated cards
 *  · Needs you     — cards awaiting RTA decision (or "Auto-sent" in auto mode)
 *  · Next cycle    — live 15-min countdown (amber < 3 min, red < 1 min)
 *
 * When autoMode is ON the "Needs you" slot is replaced with "Auto-sent".
 * When isOutageActive is true, a full-width OutageBanner renders above the strip.
 */

import type { CommandCard, HealthMetric, LOBHealth } from "../domain/types";
import { useCycleClock } from "../hooks/useCycleClock";

interface HealthStripProps {
  cards: CommandCard[];
  lobData: LOBHealth[];
  aiHandledCount: number;
  autoMode: boolean;
  autoSentCount: number;
  isOutageActive?: boolean;
}

function computeMetrics(
  cards: CommandCard[],
  lobData: LOBHealth[],
  aiHandledCount: number,
  autoMode: boolean,
  autoSentCount: number,
): HealthMetric[] {
  // SLA risk — lowest SLA across LOBs
  const minSla = lobData.reduce((min, l) => Math.min(min, l.sla), 100);
  const slaRisk: HealthMetric = {
    id: "sla",
    label: "SLA risk",
    value: `${minSla}%`,
    trend: minSla < 50 ? "Below threshold" : minSla < 85 ? "Watch" : "Healthy",
    risk: minSla < 50 ? "critical" : minSla < 85 ? "watch" : "ok",
  };

  // Queue pressure — total calls holding across all LOBs
  const totalHolding = lobData.reduce((sum, l) => sum + l.callsHolding, 0);
  const queueRisk: HealthMetric = {
    id: "queue",
    label: "Queue pressure",
    value: `${totalHolding} holding`,
    trend: totalHolding > 10 ? "High" : totalHolding > 5 ? "Elevated" : "Normal",
    risk: totalHolding > 10 ? "critical" : totalHolding > 5 ? "watch" : "ok",
  };

  // AI rate — cards AI handled vs total handled
  const handledTotal = cards.filter((c) =>
    ["sent", "resolved", "suppressed", "archived"].includes(c.status),
  ).length;
  const aiPct = handledTotal > 0 ? Math.round((aiHandledCount / handledTotal) * 100) : 0;
  const aiMetric: HealthMetric = {
    id: "ai-rate",
    label: "AI rate",
    value: `${aiPct}%`,
    trend: "Handled autonomously",
    risk: "ok",
  };

  // Incidents — open critical + escalated cards
  const incidents = cards.filter(
    (c) =>
      (c.severity === "critical" || c.status === "escalated") &&
      !["resolved", "sent", "archived"].includes(c.status),
  ).length;
  const incidentMetric: HealthMetric = {
    id: "incidents",
    label: "Incidents",
    value: incidents === 0 ? "None" : String(incidents),
    trend: incidents > 0 ? "Needs action" : "Clear",
    risk: incidents > 2 ? "critical" : incidents > 0 ? "watch" : "ok",
  };

  // 5th metric: "Auto-sent" counter when in autonomous mode, else "Needs you"
  const fifthMetric: HealthMetric = autoMode
    ? {
        id: "auto-sent",
        label: "Auto-sent",
        value: autoSentCount === 0 ? "—" : String(autoSentCount),
        trend: autoSentCount > 0 ? `${autoSentCount} action${autoSentCount !== 1 ? "s" : ""} by AI` : "Waiting for first action",
        risk: "ok",
      }
    : (() => {
        const needsAction = cards.filter((c) =>
          ["needs-review", "detected"].includes(c.status),
        ).length;
        return {
          id: "action-queue",
          label: "Needs you",
          value: needsAction === 0 ? "Clear" : String(needsAction),
          trend: needsAction > 0 ? `${needsAction} card${needsAction !== 1 ? "s" : ""} waiting` : "Nothing pending",
          risk: (needsAction > 3 ? "critical" : needsAction > 1 ? "watch" : "ok") as HealthMetric["risk"],
        };
      })();

  return [slaRisk, queueRisk, aiMetric, incidentMetric, fifthMetric];
}

// ---------------------------------------------------------------------------
// OutageBanner — full-width blinking strip rendered when isOutageActive
// ---------------------------------------------------------------------------

function OutageBanner() {
  return (
    <div className="outage-banner" role="alert" aria-live="assertive">
      <span className="outage-banner__siren" aria-hidden="true" />
      <span className="outage-banner__text">
        OUTAGE ACTIVE — Fraud ITR | WDE disconnection | 6 agents affected | SNOW TKT-8823 open
      </span>
      <span className="outage-banner__siren" aria-hidden="true" />
    </div>
  );
}

const riskBorderColor: Record<HealthMetric["risk"], string> = {
  ok:       "var(--border)",
  watch:    "var(--medium)",
  critical: "var(--critical)",
};

const riskValueColor: Record<HealthMetric["risk"], string> = {
  ok:       "var(--ai)",
  watch:    "var(--medium)",
  critical: "var(--critical)",
};

export function HealthStrip({ cards, lobData, aiHandledCount, autoMode, autoSentCount, isOutageActive }: HealthStripProps) {
  const metrics = computeMetrics(cards, lobData, aiHandledCount, autoMode, autoSentCount);
  const { mmss, risk: cycleRisk } = useCycleClock();

  const cycleMetric: HealthMetric = {
    id: "next-cycle",
    label: "Next cycle",
    value: mmss,
    trend: cycleRisk === "critical" ? "Scan all LOBs NOW" : cycleRisk === "watch" ? "Start scan" : "Scan all LOBs by then",
    risk: cycleRisk,
  };

  const allMetrics = [...metrics, cycleMetric];

  return (
    <div className={`health-strip-container${isOutageActive ? " health-strip-container--outage" : ""}`}>
      {isOutageActive && <OutageBanner />}
      <div
        className={`health-strip${autoMode ? " health-strip--autonomous" : ""}${isOutageActive ? " health-strip--outage" : ""}`}
        role="region"
        aria-label="Operational health"
      >
        {allMetrics.map((m) => (
          <div
            key={m.id}
            className={`health-metric${m.id === "auto-sent" ? " health-metric--auto" : ""}${m.id === "next-cycle" ? " health-metric--cycle" : ""}`}
            style={{ borderBottomColor: riskBorderColor[m.risk] }}
          >
            <span
              className="health-metric__value"
              style={{
                color: m.id === "auto-sent"
                  ? "var(--ai)"
                  : riskValueColor[m.risk],
              }}
            >
              {m.value}
            </span>
            <span className="health-metric__label">
              {m.id === "auto-sent" && <span className="health-metric__auto-icon" aria-hidden="true">⚡</span>}
              {m.label}
            </span>
            {m.trend && (
              <span className="health-metric__trend">{m.trend}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
