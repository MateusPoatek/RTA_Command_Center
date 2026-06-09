/**
 * CloseShiftPanel.tsx — end-of-shift readiness modal
 *
 * What it renders:
 *   A modal overlay that appears when the RTA clicks "Close Shift".
 *   Gives a clear go/no-go signal before handing off to the next RTA.
 *
 * Sections:
 *   · Score ring  — 0–100 readiness score from calculateShiftScore()
 *   · Checklist   — did AI generate a report? Was a handoff note created?
 *   · Unresolved  — list of cards not yet sent/resolved/suppressed
 *
 * The score is calculated in App.tsx and passed as a prop. This component
 * is purely presentational — it does not modify card state.
 *
 * Production note:
 *   The "Export audit" button is not yet wired. See utils/export.ts for the
 *   exportAuditCsv() function that should be called from here.
 */

import type { CommandCard } from "../domain/types";
import { dataClassLabels } from "./ui/DataBadge";

function CheckRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className={`check-row ${checked ? "checked" : ""}`}>
      <span>{checked ? "Done" : "Open"}</span>
      <p>{label}</p>
    </div>
  );
}

interface CloseShiftPanelProps {
  cards: CommandCard[];
  shiftScore: number;
  aiReportGenerated: boolean;
  handoffGenerated: boolean;
  onClose: () => void;
}

export function CloseShiftPanel({
  cards,
  shiftScore,
  aiReportGenerated,
  handoffGenerated,
  onClose,
}: CloseShiftPanelProps) {
  const unresolved = cards.filter(
    (c) => !["resolved", "sent", "suppressed"].includes(c.status),
  );

  return (
    <div className="modal-backdrop">
      <section className="close-panel">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Close Shift Simulation</p>
            <h2>Shift handoff readiness</h2>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="checklist">
          <CheckRow checked={aiReportGenerated} label="AI action report generated" />
          <CheckRow checked={handoffGenerated} label="Handoff preview generated" />
          <CheckRow
            checked={unresolved.length === 0}
            label="All operational cards resolved"
          />
          <CheckRow
            checked={shiftScore >= 75}
            label={`Shift score acceptable (${shiftScore}%)`}
          />
        </div>

        <h3>Unresolved Items</h3>
        <div className="handoff-list">
          {unresolved.map((card) => (
            <div key={card.id}>
              <strong>{card.title}</strong>
              <span>
                {card.status} · {card.lane} · {dataClassLabels[card.dataClass]}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
