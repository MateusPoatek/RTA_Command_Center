/**
 * useReportScheduler.ts
 * ---------------------
 * Fires `onTrigger()` once at each of today's scheduled report times (per
 * `ReportConfig.schedule`), then never again for that same time today.
 * Off when schedule.mode === "off". One global schedule (not per-account).
 *
 * Same spirit as useCaptureScheduler.ts (dumb ticker, checked on an
 * interval) but time-of-day-aware instead of a fixed repeating interval,
 * since "3x a day" means specific clock times, not "every N seconds".
 */
import { useEffect, useRef } from "react";
import type { ReportSchedule } from "../domain/types";

const CHECK_INTERVAL_MS = 30_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Evenly spaces `timesPerDay` generations across a standard 08:00-20:00
// shift window (inclusive of both ends).
function presetTimes(timesPerDay: 3 | 5): string[] {
  const start = 8;
  const end = 20;
  const step = (end - start) / (timesPerDay - 1);
  const times: string[] = [];
  for (let i = 0; i < timesPerDay; i++) {
    const hour = start + step * i;
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    times.push(`${pad2(h)}:${pad2(m)}`);
  }
  return times;
}

function todaysTriggerTimes(schedule: ReportSchedule): string[] {
  if (schedule.mode === "off") return [];
  if (schedule.mode === "custom") return schedule.times;
  return presetTimes(schedule.timesPerDay);
}

export function useReportScheduler(schedule: ReportSchedule, onTrigger: () => void): void {
  const cb = useRef(onTrigger);
  cb.current = onTrigger;
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => {
      const times = todaysTriggerTimes(schedule);
      if (times.length === 0) return;
      const now = new Date();
      const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      const fireKey = `${now.toISOString().slice(0, 10)}T${hhmm}`;
      if (times.includes(hhmm) && !firedRef.current.has(fireKey)) {
        firedRef.current.add(fireKey);
        cb.current();
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [schedule]);
}
