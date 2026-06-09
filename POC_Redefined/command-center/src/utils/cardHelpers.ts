/**
 * cardHelpers.ts — pure display helpers for CommandCard logic
 *
 * What this file does:
 *   Provides pure functions and label maps used to display CommandCard data
 *   in the Priority Feed, ProcessView, and card detail panels.
 *   All functions are side-effect-free and safe to call in any render context.
 *
 * Channel labels:
 *   Previously, this file had its own channelLabels map. That was replaced by
 *   the shared channelConfig.ts to eliminate duplication. Import from there
 *   for any new code that needs channel labels.
 *   See: src/shared/channelConfig.ts
 *
 * Language note:
 *   Labels are written at a B2 English level so that RTAs can understand them
 *   without technical training. Avoid abbreviations and jargon.
 */

import type { CardAction, CommandCard, ProcessId, Severity } from "../domain/types";
import { PROCESSES } from "../domain/types";
export { formatChannel, channelIcon, CHANNEL_LABELS } from "../shared/channelConfig";

// ---------------------------------------------------------------------------
// Process resolution
// ---------------------------------------------------------------------------

/**
 * Returns the ProcessId for a card based on its lane value.
 * If the lane does not match any process, defaults to "adherence".
 *
 * @param card - Any CommandCard.
 * @returns    The matching ProcessId from the PROCESSES definition list.
 *
 * @example
 * getProcessId({ lane: "coaching-huddles", ... })  // → "coaching"
 */
export function getProcessId(card: CommandCard): ProcessId {
  for (const process of PROCESSES) {
    if (process.lanes.includes(card.lane)) return process.id;
  }
  return "adherence";
}

/**
 * Returns the human-readable label for the process a card belongs to.
 *
 * @param card - Any CommandCard.
 * @returns    The process label (e.g. "Coaching", "Tickets").
 */
export function processLabel(card: CommandCard): string {
  const pid = card.processId ?? getProcessId(card);
  return PROCESSES.find((p) => p.id === pid)?.label ?? pid;
}

// ---------------------------------------------------------------------------
// Priority sorting
// ---------------------------------------------------------------------------

/**
 * Numeric weights assigned to each severity level.
 * Higher = more urgent. Used in sortByPriority.
 */
const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

/**
 * Numeric weights assigned to each card status.
 * Cards that need RTA attention are ranked above those that don't.
 */
const STATUS_SCORE: Partial<Record<CommandCard["status"], number>> = {
  "needs-review": 5,
  classified:     4,
  detected:       3,
  "ready-to-send": 3,
  escalated:      2,
};

/**
 * Sorts a list of cards by composite AI priority score (highest first).
 * Score = severity weight + status weight.
 * Used by PriorityFeed to order the feed.
 *
 * @param cards - Array of CommandCards to sort.
 * @returns     A new sorted array (original is not mutated).
 */
export function sortByPriority(cards: CommandCard[]): CommandCard[] {
  return [...cards].sort((a, b) => {
    const aScore = (SEVERITY_SCORE[a.severity] ?? 0) + (STATUS_SCORE[a.status] ?? 0);
    const bScore = (SEVERITY_SCORE[b.severity] ?? 0) + (STATUS_SCORE[b.status] ?? 0);
    return bScore - aScore;
  });
}

/**
 * Filters to active (unresolved) cards and sorts them by priority.
 * "Active" means: not resolved, not sent, not suppressed, not archived.
 * Used to build the main priority feed view.
 *
 * @param cards - Full card list from App state.
 * @returns     Filtered and sorted array of actionable cards.
 */
export function getActiveSorted(cards: CommandCard[]): CommandCard[] {
  return sortByPriority(
    cards.filter(
      (c) => !["resolved", "sent", "suppressed", "archived"].includes(c.status),
    ),
  );
}

// ---------------------------------------------------------------------------
// Status labels — plain language for non-technical RTA audience
// ---------------------------------------------------------------------------

/**
 * Converts a CardStatus value to a short, plain-language label.
 * Used in card chips, list views, and the close-shift panel.
 *
 * @param status - A valid CardStatus value.
 * @returns      A human-readable label (e.g. "Needs your decision", "Sent").
 */
export function statusLabel(status: CommandCard["status"]): string {
  const map: Record<CommandCard["status"], string> = {
    detected:           "New",
    classified:         "AI handling",
    "needs-review":     "Needs your decision",
    "ready-to-send":    "Ready",
    "in-progress":      "In progress",
    sent:               "Sent",
    suppressed:         "Skipped",
    escalated:          "Escalated",
    resolved:           "Done",
    "added-to-handoff": "In handoff",
    archived:           "Archived",
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Action labels
// ---------------------------------------------------------------------------

/**
 * Maps each CardAction to a plain-language button label.
 * Used in card action button rows and keyboard shortcut tooltips.
 */
export const actionLabels: Record<CardAction, string> = {
  "approve-send":                "Send alert",
  "edit-message":                "Edit message",
  suppress:                      "Skip this",
  "escalate-supervisor":         "Escalate",
  "escalate-om":                 "Escalate to manager",
  "create-servicenow-follow-up": "Open ticket",
  "mark-resolved":               "Mark done",
  "add-to-handoff":              "Add to handoff",
  "ask-ai-why":                  "Why did AI flag this?",
  "teach-ai-correct-rule":       "Correct AI",
  "generate-report":             "Generate report",
};

/**
 * Returns a context-aware label for the primary action button.
 * "Send alert" becomes "Send report" on report cards.
 *
 * @param card   - The card the button is on.
 * @param action - The action this button triggers.
 * @returns      The appropriate button label.
 */
export function primaryActionLabel(card: CommandCard, action: CardAction): string {
  if (action === "approve-send")   return card.type === "report" ? "Send report" : "Send alert";
  if (action === "generate-report") return "Generate report";
  if (action === "mark-resolved")  return "Mark done";
  if (action === "escalate-supervisor") return "Escalate";
  return actionLabels[action];
}

/**
 * Determines the primary action for a card based on its available actions.
 * Priority: approve-send > escalate-supervisor > generate-report > mark-resolved > first available.
 *
 * @param card - The card to evaluate.
 * @returns    The CardAction that should be shown as the primary button.
 */
export function getPrimaryAction(card: CommandCard): CardAction {
  if (card.availableActions.includes("approve-send"))       return "approve-send";
  if (card.availableActions.includes("escalate-supervisor")) return "escalate-supervisor";
  if (card.availableActions.includes("generate-report"))    return "generate-report";
  if (card.availableActions.includes("mark-resolved"))      return "mark-resolved";
  return card.availableActions[0];
}

/**
 * Returns up to 3 secondary actions for a card (all available except the primary).
 * Used to build the overflow action menu.
 *
 * @param card - The card to evaluate.
 * @returns    Array of secondary CardAction values (max 3).
 */
export function getSecondaryActions(card: CommandCard): CardAction[] {
  const primary = getPrimaryAction(card);
  return card.availableActions.filter((a) => a !== primary).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Copilot text helpers
// ---------------------------------------------------------------------------

/**
 * Returns a short explanation of why the AI flagged this card.
 * Shown above the action buttons on high-priority cards.
 *
 * @param card - The card to explain.
 * @returns    A one-sentence plain-language explanation.
 */
export function explainWhyFlagged(card: CommandCard): string {
  if (card.severity === "critical")     return "This is affecting service level right now. Handle before anything else.";
  if (card.severity === "high")         return "This will become an escalation if it stays open.";
  if (card.status === "needs-review")   return "The AI prepared this — it needs your decision to act.";
  if (card.type === "report")           return "A report is due. The AI drafted it — you just need to send.";
  if (card.status === "ready-to-send")  return "The message is ready. Review the channel and send.";
  return "The AI is watching this so you do not have to.";
}

/**
 * Returns a confidence label based on the card's AI confidence value.
 * Used in the card detail panel near the confidence indicator.
 *
 * @param card - The card to label.
 * @returns    A short text label (e.g. "Ready to send", "Review carefully").
 */
export function confidenceLabel(card: CommandCard): string {
  if (!card.confidence) return card.owner === "ai" ? "AI is watching" : "";
  if (card.confidence >= 0.8) return "Ready to send";
  if (card.confidence >= 0.6) return "Check before sending";
  return "Review carefully";
}

/**
 * Returns a predicted business impact label for a card.
 * Falls back to severity-derived labels if predictedImpact is not set.
 *
 * @param card - The card to label.
 * @returns    A short impact label (e.g. "High impact", "Low impact").
 */
export function impactLabel(card: CommandCard): string {
  if (card.predictedImpact === "high")   return "High impact";
  if (card.predictedImpact === "medium") return "Medium impact";
  if (card.predictedImpact === "low")    return "Low impact";
  if (card.severity === "critical")      return "High impact";
  if (card.severity === "high")          return "Medium impact";
  return "Low impact";
}
