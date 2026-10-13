// Run: npx tsx scripts/board.test.ts
import assert from "node:assert";
import { buildBoardRows } from "../src/domain/board";

const now = Date.parse("2026-10-07T14:00:00Z");
const at = (m: number) => new Date(now + m * 60000).toISOString();
const base = { scheduled_activity: "", out_of_adherence: "", actual_activity: "", time_in_activity: "", days_adherence: "" };
const rows = buildBoardRows([], [
  { ...base, name: "A", lob: "EPIC", scheduled_shift_start: at(4), shift_start: "" },    // pre-shift, medium
  { ...base, name: "B", lob: "EPIC", scheduled_shift_start: at(-3), shift_start: "" },   // late, high
  { ...base, name: "C", lob: "EPIC", scheduled_shift_start: at(-3), shift_start: at(-2) }, // started: none
  { ...base, name: "D", lob: "EPIC", scheduled_shift_start: at(-60), shift_start: "" },  // too old: none
  { ...base, name: "E", lob: "EPIC", shift_start: at(-100), next_activity: "Lunch", next_activity_start: at(7) },
  { ...base, name: "F", lob: "EPIC", shift_start: at(-100), next_activity: "Lunch", next_activity_start: at(40) }, // too far: none
], now);
assert.deepStrictEqual(rows.map((r) => [r.agent, r.kind]), [["B", "late-login"], ["A", "pre-shift"], ["E", "activity-change"]]);
console.log("board ok");
