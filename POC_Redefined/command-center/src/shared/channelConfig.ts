/**
 * channelConfig.ts — single source of truth for dispatch channel labels and icons.
 *
 * Why this file exists:
 *   The same channel label map was copied into four different files:
 *   cardHelpers.ts, DispatchFeed.tsx, PriorityFeed.tsx, AlertDetailModal.tsx.
 *   A copy-paste bug meant they could silently diverge.
 *   This file is the one place to update if channels change.
 *
 * How to use:
 *   import { CHANNEL_LABELS, formatChannel } from "../shared/channelConfig";
 *
 * What is a "channel"?
 *   In the RTA workflow, every alert is sent to a specific destination.
 *   A "channel" is that destination — for example, a Google Chat space for a
 *   specific Line of Business, or the Operations Manager's Teams inbox.
 *   The full channel map is derived from ABD_RT_Adherence_Monitoring.docx and
 *   POC/07_simulation/data/lob_channel_map.json.
 */

import type { TargetChannel } from "../domain/types";

// ---------------------------------------------------------------------------
// Human-readable labels for each channel
// ---------------------------------------------------------------------------

/**
 * Maps each TargetChannel ID to the label shown in the UI.
 *
 * @example
 * CHANNEL_LABELS["google-chat-lob"]  // → "Google Chat LOB"
 * CHANNEL_LABELS["om"]               // → "Operations Manager"
 */
export const CHANNEL_LABELS: Record<TargetChannel, string> = {
  "google-chat-lob":  "Google Chat LOB",
  "teams-workforce":  "Teams Workforce",
  "supervisor":       "Supervisor",
  "om":               "Operations Manager",
  "senior-rta":       "Senior RTA",
  "servicenow":       "ServiceNow",
  "handoff":          "Handoff Notes",
  "audit-only":       "Audit Log Only",
};

// ---------------------------------------------------------------------------
// Helper function
// ---------------------------------------------------------------------------

/**
 * Returns the display label for a given channel ID.
 * Falls back to the raw channel string if the ID is not in the map.
 *
 * @param id - A TargetChannel value (e.g. "google-chat-lob")
 * @returns  The human-readable label (e.g. "Google Chat LOB")
 *
 * @example
 * formatChannel("supervisor")  // → "Supervisor"
 * formatChannel("om")          // → "Operations Manager"
 */
export function formatChannel(id: TargetChannel | string): string {
  return CHANNEL_LABELS[id as TargetChannel] ?? id;
}

// ---------------------------------------------------------------------------
// Channel icons (emoji used in the UI)
// ---------------------------------------------------------------------------

/**
 * Maps each channel to a short emoji prefix for compact display.
 * Used in the Dispatch Feed and alert detail modals.
 */
export const CHANNEL_ICONS: Record<TargetChannel, string> = {
  "google-chat-lob":  "💬",
  "teams-workforce":  "📣",
  "supervisor":       "👤",
  "om":               "🔺",
  "senior-rta":       "⭐",
  "servicenow":       "🎫",
  "handoff":          "📋",
  "audit-only":       "🔍",
};

/**
 * Returns the emoji icon for a given channel.
 *
 * @param id - A TargetChannel value
 * @returns  The emoji string (e.g. "💬")
 */
export function channelIcon(id: TargetChannel | string): string {
  return CHANNEL_ICONS[id as TargetChannel] ?? "📨";
}
