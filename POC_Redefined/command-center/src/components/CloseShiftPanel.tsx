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
import type { DispatchEntry } from "../domain/scenario_types";
import { groupByCycle } from "../utils/dispatchHelpers";
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
  dispatchLog: DispatchEntry[];
  shiftScore: number;
  aiReportGenerated: boolean;
  handoffGenerated: boolean;
  onClose: () => void;
}

export function CloseShiftPanel({
  cards,
  dispatchLog,
  shiftScore,
  aiReportGenerated,
  handoffGenerated,
  onClose,
}: CloseShiftPanelProps) {
  const addedToHandoff = cards.filter((c) => c.status === "added-to-handoff");
  const unresolved = cards.filter(
    (c) => !["resolved", "sent", "suppressed", "added-to-handoff"].includes(c.status),
  );
  const batches = groupByCycle(dispatchLog);
  const totalDispatched = dispatchLog.filter((e) => e.status === "sent").length;

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
            checked={batches.length > 0}
            label={`Alert batches dispatched this shift (${totalDispatched} alerts, ${batches.length} batch${batches.length === 1 ? "" : "es"})`}
          />
          <CheckRow
            checked={shiftScore >= 75}
            label={`Shift score acceptable (${shiftScore}%)`}
          />
        </div>

        <h3>Batches Sent This Shift</h3>
        <div className="handoff-list">
          {batches.length === 0 ? (
            <p className="handoff-empty">No alert batches dispatched yet.</p>
          ) : (
            batches.map((batch) => (
              <div key={batch.cycle}>
                <strong>Batch #{batch.cycle}</strong>
                <span>
                  {new Date(batch.latestTimestamp).toLocaleTimeString()} ·{" "}
                  {batch.entries.filter((e) => e.status === "sent").length} sent
                  {batch.entries.some((e) => e.status === "escalated")
                    ? ` · ${batch.entries.filter((e) => e.status === "escalated").length} escalated`
                    : ""}
                  {" · "}
                  {[...new Set(batch.entries.map((e) => e.lob))].join(", ")}
                </span>
              </div>
            ))
          )}
        </div>

        <h3>Added to Handoff</h3>
        <div className="handoff-list">
          {addedToHandoff.length === 0 ? (
            <p className="handoff-empty">Nothing explicitly added to handoff.</p>
          ) : (
            addedToHandoff.map((card) => (
              <div key={card.id}>
                <strong>{card.title}</strong>
                <span>
                  {card.lane} · {dataClassLabels[card.dataClass]}
                </span>
              </div>
            ))
          )}
        </div>

        <h3>Unresolved Items</h3>
        <div className="handoff-list">
          {unresolved.length === 0 ? (
            <p className="handoff-empty">Nothing unresolved.</p>
          ) : (
            unresolved.map((card) => (
              <div key={card.id}>
                <strong>{card.title}</strong>
                <span>
                  {card.status} · {card.lane} · {dataClassLabels[card.dataClass]}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
