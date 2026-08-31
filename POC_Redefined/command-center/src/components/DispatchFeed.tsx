/**
 * DispatchFeed.tsx — reverse-chronological alert dispatch log
 *
 * What it renders:
 *   A scrollable list of every alert sent (or suppressed/escalated) this shift.
 *   Populated from the active scenario's dispatchLog and updated in real time
 *   as the RTA approves cards or the autonomous AI acts.
 *
 * Props:
 *   - entries  : DispatchEntry[] — newest last; the component reverses for display.
 *   - onSelect : optional callback to open AlertDetailModal for a row.
 *
 * Attribution badges:
 *   - "AI · auto" — the autonomous engine sent this without an RTA click.
 *   - "RTA"       — the RTA reviewed and approved this dispatch.
 *   - (no badge)  — scenario seed data (treat as RTA for display).
 *
 * Channel labels:
 *   Previously this file had its own channelLabels map.
 *   Now it uses formatChannel() from shared/channelConfig.ts.
 *   If you need to add a new channel, update channelConfig.ts only.
 */

import { useState } from "react";
import type { DispatchEntry } from "../domain/scenario_types";
import { formatChannel } from "../shared/channelConfig";
import { type DispatchBatch, groupByCycle } from "../utils/dispatchHelpers";

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface DispatchRowProps {
  entry: DispatchEntry;
  onSelect?: (entry: DispatchEntry) => void;
}

function DispatchRow({ entry, onSelect }: DispatchRowProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const statusColor =
    entry.status === "sent"       ? "var(--ai)"         :
    entry.status === "escalated"  ? "var(--medium)"     :
    entry.status === "suppressed" ? "var(--text-muted)" :
                                    "var(--info)";

  const statusLabel =
    entry.status === "sent"       ? "SENT"       :
    entry.status === "escalated"  ? "ESCALATED"  :
    entry.status === "suppressed" ? "SUPPRESSED" :
                                    "PENDING";

  const channelLabel = formatChannel(entry.channel);
  const isAi         = entry.sentBy === "ai";
  const isEscalation = entry.status === "escalated";
  const isClickable  = Boolean(onSelect);

  return (
    <div
      className={`dispatch-row${isAi ? " dispatch-row--ai" : ""}${isEscalation ? " dispatch-row--escalated" : ""}${isClickable ? " dispatch-row--clickable" : ""}`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={() => onSelect?.(entry)}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.(entry);
        }
      }}
      aria-label={
        isClickable
          ? `View details for ${entry.status === "escalated" ? "escalation" : "alert"}: ${entry.agent}, ${channelLabel}`
          : undefined
      }
    >
      {/* Left column: status + time + sentBy badge */}
      <div className="dispatch-row__meta">
        <span
          className="dispatch-row__status-pill"
          style={{
            background:
              entry.status === "sent"      ? "var(--ai-dim)"     :
              entry.status === "escalated" ? "var(--medium-dim)" :
              "var(--accent-dim)",
            borderColor: statusColor,
            color:       statusColor,
          }}
        >
          {statusLabel}
        </span>
        <span className="dispatch-row__time">{time}</span>
        {isAi ? (
          <span className="dispatch-row__sent-by dispatch-row__sent-by--ai">AI · auto</span>
        ) : entry.sentBy === "rta" ? (
          <span className="dispatch-row__sent-by dispatch-row__sent-by--rta">RTA</span>
        ) : null}
      </div>

      {/* Centre: agent, LOB, channel, message */}
      <div className="dispatch-row__body">
        <div className="dispatch-row__header-row">
          <span className="dispatch-row__agent">{entry.agent}</span>
          <span className="dispatch-row__lob">{entry.lob}</span>
          <span className="dispatch-row__channel">→ {channelLabel}</span>
        </div>
        <p className="dispatch-row__message">{entry.message}</p>
      </div>

      {/* Right: escalation level + inspect hint */}
      <div className="dispatch-row__right">
        <span className="dispatch-row__escalation">
          {entry.escalationLevel.replace("-", " ")}
        </span>
        {isClickable && (
          <span className="dispatch-row__inspect-hint" aria-hidden="true">
            Inspect →
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch rollup — reads as "Batch #N — HH:MM: X alerts sent" by default,
// expandable to the individual entries, instead of a flat list of
// near-identical rows for every agent in a batch. Grouping logic lives in
// utils/dispatchHelpers.ts (shared with CloseShiftPanel's handoff summary).
// ---------------------------------------------------------------------------

function DispatchBatchRow({ batch, onSelect }: { batch: DispatchBatch; onSelect?: (entry: DispatchEntry) => void }) {
  const [expanded, setExpanded] = useState(false);

  // A batch of one reads exactly like a plain row — no rollup step needed.
  if (batch.entries.length === 1) {
    return <DispatchRow entry={batch.entries[0]} onSelect={onSelect} />;
  }

  const time = new Date(batch.latestTimestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const sentCount = batch.entries.filter((e) => e.status === "sent").length;
  const escalatedCount = batch.entries.filter((e) => e.status === "escalated").length;

  return (
    <div className="dispatch-batch">
      <button
        type="button"
        className="dispatch-batch__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="dispatch-batch__label">Batch #{batch.cycle}</span>
        <span className="dispatch-batch__time">{time}</span>
        <span className="dispatch-batch__count">
          {sentCount > 0 && `${sentCount} sent`}
          {escalatedCount > 0 && `${sentCount > 0 ? " · " : ""}${escalatedCount} escalated`}
        </span>
        <span className="dispatch-batch__toggle">{expanded ? "Hide" : "Show"} details</span>
      </button>
      {expanded && (
        <div className="dispatch-batch__rows">
          {batch.entries.map((entry) => (
            <DispatchRow entry={entry} key={entry.id} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DispatchFeed — exported panel
// ---------------------------------------------------------------------------

interface DispatchFeedProps {
  entries: DispatchEntry[];
  /** When provided, every row becomes clickable and fires this callback. */
  onSelect?: (entry: DispatchEntry) => void;
}

export function DispatchFeed({ entries, onSelect }: DispatchFeedProps) {
  if (entries.length === 0) {
    return (
      <div className="dispatch-feed dispatch-feed--empty">
        <p className="dispatch-feed__empty-label">No dispatches yet</p>
        <p className="dispatch-feed__empty-sub">
          Approve a card's send action to see the alert appear here.
        </p>
      </div>
    );
  }

  const aiCount         = entries.filter((e) => e.sentBy === "ai").length;
  const escalationCount = entries.filter((e) => e.status === "escalated").length;
  const sentCount       = entries.filter((e) => e.status === "sent").length;

  return (
    <div className="dispatch-feed">
      {/* Summary bar */}
      <div className="dispatch-feed__summary">
        <span className="dispatch-feed__count-pill">
          {entries.length} DISPATCHED THIS SHIFT
        </span>
        {sentCount > 0 && aiCount > 0 && (
          <span className="dispatch-feed__ai-tally">{aiCount} by AI</span>
        )}
        {escalationCount > 0 && (
          <span className="dispatch-feed__escalation-tally">{escalationCount} escalated</span>
        )}
        <span className="dispatch-feed__order-hint">Latest first</span>
      </div>

      {/* Batches — grouped by dispatch cycle, newest batch first */}
      <div className="dispatch-feed__list">
        {groupByCycle(entries).map((batch) => (
          <DispatchBatchRow batch={batch} key={batch.cycle} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
