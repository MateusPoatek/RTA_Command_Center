// Plain language for the floor ("don't make me think"): one sentence per alert,
// in the card wording the floor already likes ("on X, should be on Y, for N min").
import type { Exception } from "./exceptions";

/** "Méndez, Carlos" -> "Carlos Méndez" (Verint writes Last, First). */
export const displayName = (n: string) => (n.includes(",") ? n.split(",").map((s) => s.trim()).reverse().join(" ") : n);

/** "EPIC_New ticket" -> "New ticket": drop the account prefix Verint puts on activity names. */
export const activity = (a: string) => a.replace(/^[A-Za-z]+_/, "").replace(/\s*\+\d+m$/, "");

/** What is wrong, after the agent's name. */
export function sentence(e: Exception): string {
  switch (e.kind) {
    case "no-clock-in": return "hasn't clocked in — shift started";
    case "no-clock-out": return "hasn't clocked out — shift ended";
    case "no-show": return "didn't show up — no clock-in or activity all shift (time off not in Verint?)";
    case "break-overrun": return `is still on ${activity(e.on)} — should be back on ${activity(e.should)}`;
    case "ooa": return `is on ${activity(e.on)} — should be on ${activity(e.should)}`;
  }
}

/** "EPIC - TISV · Player Support" -> "TISV · Player Support"; a bare account id stays as is. */
export const lobLabel = (lob: string) => lob.split(" - ").slice(1).join(" - ") || lob;
