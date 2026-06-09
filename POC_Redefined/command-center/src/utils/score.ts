/**
 * score.ts — shift close scoring logic
 *
 * What this file does:
 *   Calculates a 0–100 readiness score at shift close.
 *   The score tells the RTA whether it is safe to hand off the shift,
 *   and gives leadership a simple quality signal per shift.
 *
 * Score formula:
 *   Starts at 100. Deductions for unresolved work. Bonus for AI-generated report.
 *
 * Weight rationale:
 *   - Overdue reports:     -8 per report  (reporting is a compliance obligation)
 *   - High escalations:   -8 per card     (unresolved escalations carry people risk)
 *   - HITL cards:         -5 per card     (every unreviewed card is a potential miss)
 *   - Unresolved tickets: -3 per ticket   (SNOW tickets can be deferred to next shift)
 *   - No handoff note:    -5              (incoming RTA has no context — high risk)
 *   - AI report generated: +5             (shows AI completed at least one full cycle)
 *
 * DEMO NOTE:
 *   This scoring model is illustrative. Real shift quality should also consider
 *   SLA outcomes, escalation resolution time, and coaching completion rate.
 */

import type { CommandCard } from "../domain/types";

// ---------------------------------------------------------------------------
// Deduction weights — change these to tune the score model
// ---------------------------------------------------------------------------

const WEIGHTS = {
  overdueReport:       8,
  highEscalation:      8,
  hitlCard:            5,
  unresolvedTicket:    3,
  noHandoff:           5,
  aiReportBonus:       5,
} as const;

// ---------------------------------------------------------------------------
// Scoring function
// ---------------------------------------------------------------------------

/**
 * Calculates the shift close readiness score.
 *
 * @param cards             - Full card list from App state.
 * @param aiReportGenerated - True if the RTA generated at least one AI report.
 * @param handoffGenerated  - True if the shift handoff note was created.
 * @returns                 Integer score 0–100. 90+ is "Ready to close".
 */
export function calculateShiftScore(
  cards: CommandCard[],
  aiReportGenerated: boolean,
  handoffGenerated: boolean,
): number {
  let score = 100;

  const overdueReports = cards.filter(
    (card) => card.type === "report" && card.status !== "sent",
  ).length;

  const highEscalations = cards.filter(
    (card) => card.type === "escalation" && card.status !== "resolved",
  ).length;

  const hitlCards = cards.filter(
    (card) => card.status === "needs-review",
  ).length;

  const unresolvedTickets = cards.filter(
    (card) => card.lane === "tickets-exceptions" && card.status !== "resolved",
  ).length;

  score -= overdueReports    * WEIGHTS.overdueReport;
  score -= highEscalations   * WEIGHTS.highEscalation;
  score -= hitlCards         * WEIGHTS.hitlCard;
  score -= unresolvedTickets * WEIGHTS.unresolvedTicket;

  if (!handoffGenerated)  score -= WEIGHTS.noHandoff;
  if (aiReportGenerated)  score += WEIGHTS.aiReportBonus;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Score label
// ---------------------------------------------------------------------------

/**
 * Converts a numeric score into a readiness label for the CloseShiftPanel.
 *
 * @param score - Integer 0–100 from calculateShiftScore.
 * @returns     A short plain-language status label.
 *
 * @example
 * scoreLabel(95)  // → "Ready to close"
 * scoreLabel(60)  // → "Needs attention"
 */
export function scoreLabel(score: number): string {
  if (score >= 90) return "Ready to close";
  if (score >= 75) return "Stable, review pending items";
  if (score >= 50) return "Needs attention";
  return "Not ready to close";
}
