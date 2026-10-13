// Board — airport-departures-style alert board. One row per thing needing
// attention, ranked by priority. RTA sends a row to the team lead; the team
// lead acknowledges it. "Acknowledged" rows sink to the bottom; rows sent but
// unacknowledged past ACK_SLA_MIN flash. Send/ack are simulated in-dashboard
// (ponytail: swap sendToLead for /api/dispatch-alert + an ack endpoint when
// the Chat app lands).
import { useEffect, useState } from "react";
import { buildBoardRows } from "../domain/board";
import type { BoardRow } from "../domain/board";
import type { CommandCard } from "../domain/types";
import type { VerintRosterRow } from "../hooks/useExtensionBridge";

export type BoardState = Record<string, { sentAt?: number; ackAt?: number }>;
const ACK_SLA_MIN = 5;

interface BoardProps {
  cards: CommandCard[];
  roster: VerintRosterRow[];
  state: BoardState;
  onChange: (id: string, patch: BoardState[string]) => void;
  onOpenCard: (cardId: string) => void;
}

const KIND_LABEL: Record<BoardRow["kind"], string> = {
  reactive: "NOW", "late-login": "LATE", "pre-shift": "SOON", "activity-change": "NEXT",
};

function countdown(dueMs: number, now: number) {
  const s = Math.round((dueMs - now) / 1000);
  const m = Math.floor(Math.abs(s) / 60);
  return `${s < 0 ? "+" : "−"}${m}m`;
}

export function Board({ cards, roster, state, onChange, onOpenCard }: BoardProps) {
  const [now, setNow] = useState(() => Date.now());
  const [leadView, setLeadView] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const all = buildBoardRows(cards, roster, now);
  const open = all.filter((r) => !state[r.id]?.ackAt);
  const acked = all.filter((r) => state[r.id]?.ackAt);
  // Leads only see what the RTA sent them.
  const visible = leadView ? open.filter((r) => state[r.id]?.sentAt) : [...open, ...acked];

  return (
    <section className="board" data-testid="board">
      <div className="board__head">
        <span className="board__title">Alert Board</span>
        <span className="board__count">{open.length} open · {acked.length} acknowledged</span>
        <button type="button" className="board__toggle" onClick={() => setLeadView((v) => !v)}>
          {leadView ? "Team Lead view" : "RTA view"} ⇄
        </button>
      </div>
      <div className="board__cols">
        <span>Pri</span><span>Agent</span><span>LOB</span><span>Alert</span><span>Due</span><span />
      </div>
      {visible.map((r) => {
        const st = state[r.id] ?? {};
        const stale = !!st.sentAt && !st.ackAt && now - st.sentAt > ACK_SLA_MIN * 60000;
        return (
          <div key={r.id} className={`board__row board__row--${r.severity}${st.ackAt ? " board__row--acked" : ""}${stale ? " board__row--stale" : ""}`}>
            <span className="board__kind">{KIND_LABEL[r.kind]}</span>
            <button type="button" className="board__agent" disabled={!r.cardId} onClick={() => r.cardId && onOpenCard(r.cardId)}>
              {r.agent}
            </button>
            <span>{r.lob}</span>
            <span>{r.headline}</span>
            <span>{r.dueMs ? countdown(r.dueMs, now) : ""}</span>
            <span className="board__act">
              {st.ackAt ? "ACK ✓"
                : leadView ? <button type="button" onClick={() => onChange(r.id, { ackAt: Date.now() })}>Acknowledge</button>
                : st.sentAt ? (stale ? "NO ACK" : "Sent to TL")
                : <button type="button" onClick={() => onChange(r.id, { sentAt: Date.now() })}>Send to TL</button>}
            </span>
          </div>
        );
      })}
      {visible.length === 0 && <div className="board__empty">Nothing needs attention.</div>}
    </section>
  );
}
