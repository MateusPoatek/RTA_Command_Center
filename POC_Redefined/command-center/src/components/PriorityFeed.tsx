/**
 * PriorityFeed.tsx
 * ----------------
 * Left panel (40% of workspace) — the RTA's primary work surface.
 *
 * Shows AI-ranked operational priorities as a feed of cards, not a kanban.
 * Each card answers: what happened, what impact, what to do, how confident is AI.
 *
 * Card type renderers:
 *  · Default           — standard alert/task with Verint badge
 *  · exception         — dashed amber border, "EXCEPTION" header badge
 *  · rebalance         — two-LOB split header + agent chip list
 *  · outage-playbook   — interactive numbered checklist, ticked by the RTA
 *
 * Structure:
 *  · Priority card (top)   — the single most urgent item, full-width
 *  · Compact queue (below) — remaining items, scannable list
 *  · Footer               — "See full board" toggle
 *
 * Clicking any queue item promotes it to the top priority.
 * Each card can open the CopilotPanel for the AI dialogue.
 */

import { useState } from "react";
import type { CardAction, CommandCard } from "../domain/types";
import {
  actionLabels,
  confidenceLabel,
  getActiveSorted,
  getPrimaryAction,
  impactLabel,
  primaryActionLabel,
  processLabel,
  statusLabel,
} from "../utils/cardHelpers";
import { CopilotPanel, type CopilotStep } from "./CopilotPanel";

const QUEUE_MAX = 8;

// ---------------------------------------------------------------------------
// Severity border left color
// ---------------------------------------------------------------------------
const severityBorder: Record<string, string> = {
  critical: "var(--critical)",
  high:     "var(--high)",
  medium:   "var(--medium)",
  low:      "var(--low)",
  info:     "var(--info)",
};

// ---------------------------------------------------------------------------
// Outage playbook renderer — interactive checklist for outage-playbook cards
// ---------------------------------------------------------------------------

function OutagePlaybookCard({ card, onAction }: { card: CommandCard; onAction: (a: CardAction) => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (step: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(step) ? next.delete(step) : next.add(step);
      return next;
    });
  };

  const allDone = (card.outagePlaybook?.length ?? 0) > 0 && checked.size === card.outagePlaybook!.length;

  return (
    <div className="outage-playbook-card">
      <div className="outage-playbook-card__header">
        <span className="outage-playbook-card__siren" aria-hidden="true" />
        <span className="outage-playbook-card__title">{card.title}</span>
      </div>
      <p className="outage-playbook-card__summary">{card.summary}</p>
      <ol className="outage-playbook-card__steps">
        {(card.outagePlaybook ?? []).map(({ step, action, detail }) => (
          <li
            key={step}
            className={`outage-playbook-card__step${checked.has(step) ? " outage-playbook-card__step--done" : ""}`}
          >
            <label className="outage-playbook-card__step-label">
              <input
                type="checkbox"
                className="outage-playbook-card__checkbox"
                checked={checked.has(step)}
                onChange={() => toggle(step)}
              />
              <span className="outage-playbook-card__step-action">{action}</span>
            </label>
            <p className="outage-playbook-card__step-detail">{detail}</p>
          </li>
        ))}
      </ol>
      {allDone && (
        <div className="outage-playbook-card__done-banner">
          All steps completed — add to handoff for incident log.
        </div>
      )}
      <div className="outage-playbook-card__actions">
        <button
          type="button"
          className="priority-card__sec-btn"
          onClick={() => onAction("add-to-handoff")}
        >
          Add to handoff
        </button>
        <button
          type="button"
          className="priority-card__sec-btn"
          onClick={() => onAction("mark-resolved")}
        >
          Mark resolved
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rebalance card renderer — two-LOB split layout + agent chips
// ---------------------------------------------------------------------------

function RebalanceCard({ card, onAction }: { card: CommandCard; onAction: (a: CardAction) => void }) {
  const rb = card.rebalanceSuggestion;

  return (
    <div className="rebalance-card">
      <div className="rebalance-card__header">
        <div className="rebalance-card__lob-split">
          <span className="rebalance-card__lob-source">{rb?.sourceLob ?? "—"}</span>
          <span className="rebalance-card__arrow" aria-hidden="true">→</span>
          <span className="rebalance-card__lob-target">{rb?.targetLob ?? "—"}</span>
        </div>
        <span className="rebalance-card__badge">REBALANCE</span>
      </div>

      <p className="rebalance-card__reason">{rb?.reason}</p>

      <div className="rebalance-card__agents">
        {(rb?.agentNames ?? []).map((name) => (
          <span key={name} className="rebalance-card__agent-chip">{name}</span>
        ))}
      </div>

      <p className="rebalance-card__message-preview">{card.draftMessage}</p>

      <div className="rebalance-card__actions">
        <button
          type="button"
          className="priority-card__cta"
          onClick={() => onAction("approve-send")}
        >
          Approve rebalance
        </button>
        <button
          type="button"
          className="priority-card__sec-btn"
          onClick={() => onAction("edit-message")}
        >
          Edit message
        </button>
        <button
          type="button"
          className="priority-card__sec-btn"
          onClick={() => onAction("suppress")}
        >
          Suppress
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top priority card
// ---------------------------------------------------------------------------

interface PriorityCardProps {
  card: CommandCard;
  rank: number;
  total: number;
  isNew: boolean;
  onAction: (action: CardAction) => void;
  onCopilot: (initialStep?: CopilotStep) => void;
}

function PriorityCardItem({ card, rank, total, isNew, onAction, onCopilot }: PriorityCardProps) {
  const primary   = getPrimaryAction(card);
  const secondary = card.availableActions.filter((a) => a !== primary).slice(0, 3);
  const isException = card.type === "exception";

  // Delegate to specialized renderers for non-standard card types
  if (card.type === "outage-playbook") {
    return <OutagePlaybookCard card={card} onAction={onAction} />;
  }
  if (card.type === "rebalance") {
    return <RebalanceCard card={card} onAction={onAction} />;
  }

  return (
    <div
      className={`priority-card${isNew ? " card-new" : ""}${isException ? " priority-card--exception" : ""}`}
      style={isException ? undefined : { borderLeftColor: severityBorder[card.severity] }}
    >
      {/* Exception header badge (replaces the severity dot treatment) */}
      {isException && (
        <div className="priority-card__exception-banner">
          <span className="priority-card__exception-badge">EXCEPTION</span>
          <span className="priority-card__exception-hint">Review before acting — AI needs your input</span>
        </div>
      )}

      {/* Header row */}
      <div className="priority-card__header">
        <div className="priority-card__rank-group">
          <span className="priority-card__rank">Do {rank}</span>
          <span className="priority-card__process">{processLabel(card)}</span>
          {card.lob && <span className="priority-card__lob">{card.lob}</span>}
        </div>
        <span className="priority-card__counter">{rank} of {total}</span>
      </div>

      {/* Title + Verint badge */}
      <h2 className="priority-card__title">{card.title}</h2>
      {(card.agent?.currentStatus || card.rule?.description) && (
        <span className="priority-card__verint-badge">
          {card.agent?.currentStatus ?? card.rule?.description}
        </span>
      )}
      <p className="priority-card__summary">{card.summary}</p>

      {/* AI signals */}
      <div className="priority-card__signals">
        <span className="priority-card__status">{statusLabel(card.status)}</span>
        {card.confidence !== undefined && (
          <span className="priority-card__confidence">
            {Math.round(card.confidence * 100)}% confidence
          </span>
        )}
        <span className="priority-card__impact">{impactLabel(card)}</span>
        {confidenceLabel(card) && (
          <span className="priority-card__confidence-label">{confidenceLabel(card)}</span>
        )}
      </div>

      {/* Primary CTA */}
      <div className="priority-card__actions">
        <button
          className="priority-card__cta"
          type="button"
          onClick={() => onAction(primary)}
        >
          {primaryActionLabel(card, primary)}
        </button>

        <div className="priority-card__secondary">
          <button
            className="priority-card__ai-btn"
            type="button"
            onClick={() => onCopilot("why")}
          >
            Ask AI
          </button>
          {secondary.map((a) => (
            <button
              key={a}
              className="priority-card__sec-btn"
              type="button"
              onClick={() => {
                // "Edit message" and "Ask AI why" open the copilot at the
                // appropriate step rather than firing a card action directly
                if (a === "edit-message") {
                  onCopilot("draft");
                } else if (a === "ask-ai-why") {
                  onCopilot("why");
                } else {
                  onAction(a);
                }
              }}
            >
              {actionLabels[a]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact queue row
// ---------------------------------------------------------------------------

interface QueueRowProps {
  card: CommandCard;
  position: number;
  isNew: boolean;
  onPromote: () => void;
}

function QueueRow({ card, position, isNew, onPromote }: QueueRowProps) {
  return (
    <button
      className={`queue-row${isNew ? " card-new" : ""}`}
      type="button"
      onClick={onPromote}
      aria-label={`Promote: ${card.title}`}
    >
      <span
        className="queue-row__dot"
        style={{ background: severityBorder[card.severity] }}
      />
      <span className="queue-row__pos">{position}</span>
      <span className="queue-row__title">{card.title}</span>
      <span className="queue-row__process">{processLabel(card)}</span>
      {card.lob && <span className="queue-row__lob">{card.lob}</span>}
      <span className="queue-row__status">{statusLabel(card.status)}</span>
      {card.confidence !== undefined && (
        <span className="queue-row__confidence">{Math.round(card.confidence * 100)}%</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PriorityFeed — main export
// ---------------------------------------------------------------------------

interface PriorityFeedProps {
  cards: CommandCard[];
  newCardIds: Set<string>;
  focusedCardId: string | null;
  onAction: (action: CardAction, cardId: string) => void;
  onFocus: (cardId: string) => void;
  onShowBoard: () => void;
}

export function PriorityFeed({
  cards,
  newCardIds,
  focusedCardId,
  onAction,
  onFocus,
  onShowBoard,
}: PriorityFeedProps) {
  const [copilotCardId,   setCopilotCardId]   = useState<string | null>(null);
  const [copilotInitStep, setCopilotInitStep] = useState<CopilotStep>("why");

  const active = getActiveSorted(cards);

  if (active.length === 0) {
    return (
      <div className="priority-feed">
        <div className="priority-feed__empty">
          <span className="priority-feed__empty-check">✓</span>
          <p>Nothing needs your attention right now.</p>
          <p className="priority-feed__empty-sub">The AI is watching 248 agents across 6 LOBs.</p>
        </div>
        <div className="priority-feed__footer">
          <button className="priority-feed__board-btn" type="button" onClick={onShowBoard}>
            See full board
          </button>
        </div>
      </div>
    );
  }

  // Promoted card: focused card first, otherwise top of sorted list
  const priorityIdx = focusedCardId
    ? Math.max(0, active.findIndex((c) => c.id === focusedCardId))
    : 0;
  const priorityCard  = active[priorityIdx];
  const queueCards    = active.filter((_, i) => i !== priorityIdx);
  const visibleQueue  = queueCards.slice(0, QUEUE_MAX);
  const hiddenCount   = queueCards.length - visibleQueue.length;
  const copilotCard   = copilotCardId ? active.find((c) => c.id === copilotCardId) : null;

  return (
    <div className="priority-feed">

      {/* Priority card */}
      <PriorityCardItem
        card={priorityCard}
        rank={priorityIdx + 1}
        total={active.length}
        isNew={newCardIds.has(priorityCard.id)}
        onAction={(a) => {
          onAction(a, priorityCard.id);
          setCopilotCardId(null);
        }}
        onCopilot={(initStep = "why") => {
          const isOpen = copilotCardId === priorityCard.id && copilotInitStep === initStep;
          if (isOpen) {
            setCopilotCardId(null);
          } else {
            setCopilotInitStep(initStep);
            setCopilotCardId(priorityCard.id);
          }
        }}
      />

      {/* Inline copilot for priority card */}
      {copilotCard && copilotCard.id === priorityCard.id && (
        <CopilotPanel
          key={`${copilotCard.id}-${copilotInitStep}`}
          card={copilotCard}
          initialStep={copilotInitStep}
          onAction={(a) => {
            onAction(a, copilotCard.id);
            setCopilotCardId(null);
          }}
          onClose={() => setCopilotCardId(null)}
        />
      )}

      {/* Compact queue */}
      {visibleQueue.length > 0 && (
        <div className="priority-feed__queue">
          <p className="priority-feed__queue-label">Up next — {active.length - 1} more</p>
          {visibleQueue.map((card, i) => (
            <div key={card.id}>
              <QueueRow
                card={card}
                position={i + 2}
                isNew={newCardIds.has(card.id)}
                onPromote={() => {
                  onFocus(card.id);
                  setCopilotCardId(null);
                }}
              />
              {/* Inline copilot for queue items */}
              {copilotCard && copilotCard.id === card.id && (
                <CopilotPanel
                  key={`${copilotCard.id}-${copilotInitStep}`}
                  card={copilotCard}
                  initialStep={copilotInitStep}
                  onAction={(a) => {
                    onAction(a, copilotCard.id);
                    setCopilotCardId(null);
                  }}
                  onClose={() => setCopilotCardId(null)}
                />
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <button
              className="priority-feed__show-more"
              type="button"
              onClick={onShowBoard}
            >
              + {hiddenCount} more — see full board
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="priority-feed__footer">
        <button className="priority-feed__board-btn" type="button" onClick={onShowBoard}>
          See full board
        </button>
      </div>
    </div>
  );
}
