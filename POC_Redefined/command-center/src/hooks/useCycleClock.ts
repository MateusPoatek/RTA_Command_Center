/**
 * useCycleClock.ts — Verint 15-minute cycle countdown hook
 *
 * What this hook does:
 *   Counts down the seconds remaining until the next 15-minute monitoring cycle.
 *   Every RTA sees the same countdown because it aligns to real wall-clock time:
 *   the cycle boundaries are always :00, :15, :30, :45 of each hour.
 *
 * Why this matters:
 *   The 15-minute cycle is the core of the RTA's job. At the end of each cycle,
 *   the RTA must have reviewed all alerts and sent all dispatches. The countdown
 *   creates urgency and helps the RTA prioritise.
 *   Source: ABD_RT_Adherence_Monitoring.docx — "Monitoring cadence: every 15 min"
 *
 * Returns:
 *   - secondsLeft : number, 0–899 (0 = cycle boundary, 899 = just reset)
 *   - mmss        : string, formatted "MM:SS" (e.g. "07:23")
 *   - risk        : "ok" | "watch" (< 3 min left) | "critical" (< 1 min left)
 *
 * Usage:
 *   const { mmss, risk } = useCycleClock();
 */

import { useEffect, useState } from "react";

function getSecondsLeft(): number {
  const now = new Date();
  const totalSeconds = now.getMinutes() * 60 + now.getSeconds();
  const cycleSeconds = 15 * 60;
  return cycleSeconds - (totalSeconds % cycleSeconds);
}

function formatMmss(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export type CycleRisk = "ok" | "watch" | "critical";

export interface CycleClockResult {
  secondsLeft: number;
  mmss: string;
  risk: CycleRisk;
}

export function useCycleClock(): CycleClockResult {
  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsLeft);

  useEffect(() => {
    const tick = () => setSecondsLeft(getSecondsLeft());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const risk: CycleRisk =
    secondsLeft < 60 ? "critical" :
    secondsLeft < 180 ? "watch" :
    "ok";

  return { secondsLeft, mmss: formatMmss(secondsLeft), risk };
}
