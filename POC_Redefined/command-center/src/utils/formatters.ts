/**
 * formatters.ts — pure formatting utilities shared across the UI
 *
 * What this file does:
 *   Provides small, reusable formatting functions for display values.
 *   All functions are pure (no side effects, no state) and safe to use anywhere.
 *
 * Status: formatDuration is used in LOBQueueDetail rows and card detail panels.
 *   If you add more formatting needs (e.g. percentages, timestamps), add them here.
 */

/**
 * Converts a total second count into a compact "m:ss" display string.
 * Used to display call durations, hold times, and coaching session lengths.
 *
 * @param totalSeconds - Non-negative integer number of seconds.
 * @returns            Formatted string (e.g. 570 → "9:30", 62 → "1:02").
 *
 * @example
 * formatDuration(570)  // → "9:30"   (9 min 30 sec — COAC threshold territory)
 * formatDuration(62)   // → "1:02"
 * formatDuration(0)    // → "0:00"
 */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats a percentage value as a rounded integer string with a "%" suffix.
 *
 * @param value - A number between 0 and 100.
 * @returns     Formatted string (e.g. 94.3 → "94%", 100 → "100%").
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Converts an ISO 8601 timestamp to a short "HH:MM" time string in local time.
 * Used in dispatch log rows and audit trail entries.
 *
 * @param iso - ISO 8601 timestamp string (e.g. "2026-04-28T14:37:00.000Z").
 * @returns   Formatted time string (e.g. "14:37").
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
