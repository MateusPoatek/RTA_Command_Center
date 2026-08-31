/**
 * dispatchHelpers.ts — pure helpers for grouping DispatchEntry records
 *
 * A dispatch batch (App.tsx's flushBatch) stamps every DispatchEntry it
 * creates with the same `cycle` number. groupByCycle() turns a flat
 * DispatchEntry[] back into that batch structure for display — used by both
 * DispatchFeed (live, this-shift view) and CloseShiftPanel (end-of-shift
 * handoff summary), so the two views can't drift apart.
 */

import type { DispatchEntry } from "../domain/scenario_types";

export interface DispatchBatch {
  cycle: number;
  entries: DispatchEntry[];
  latestTimestamp: string;
}

/**
 * Groups entries by DispatchEntry.cycle, newest batch first.
 *
 * @param entries - Any DispatchEntry list (already filtered by account, if applicable).
 * @returns        Batches, newest first. A cycle with a single entry (e.g. a
 *                 lone escalation) is still returned as a batch of size 1 —
 *                 callers can render it exactly like an individual entry.
 */
export function groupByCycle(entries: DispatchEntry[]): DispatchBatch[] {
  const buckets = new Map<number, DispatchEntry[]>();
  for (const e of entries) {
    const list = buckets.get(e.cycle);
    if (list) list.push(e);
    else buckets.set(e.cycle, [e]);
  }
  return [...buckets.entries()]
    .map(([cycle, es]) => ({
      cycle,
      entries: es,
      latestTimestamp: es.reduce((max, e) => (e.timestamp > max ? e.timestamp : max), es[0].timestamp),
    }))
    .sort((a, b) => b.cycle - a.cycle);
}
