/**
 * useExtensionBridge.ts
 * ---------------------
 * Receives live CommandCards pushed by the "RTA Live Bridge" browser extension
 * (which reads Verint's own calendar API in the RTA's browser) via
 * window.postMessage, and hands them to the app.
 *
 * Additive + inert: it does nothing unless a message with our exact shape
 * arrives, so it cannot affect the existing demo/scenarios.
 */
import { useEffect } from "react";
import type { CommandCard } from "../domain/types";

export interface VerintRosterRow {
  name: string;
  scheduled_activity: string;
  out_of_adherence: string;
  actual_activity: string;
  time_in_activity: string;
  days_adherence: string;
  lob?: string;
}

interface BridgeMessage {
  __rtaLiveBridge?: boolean;
  kind?: string;
  cards?: CommandCard[];
  roster?: VerintRosterRow[];
  syncedAt?: string | null;
  /** {workResourceId: "TIB EPIC …"} from the extension's Verint skill scan (EPIC_BG only). */
  languages?: Record<string, string>;
}

export function useExtensionBridge(
  onCards: (cards: CommandCard[], syncedAt: string | null, roster: VerintRosterRow[], languages: Record<string, string>) => void,
): void {
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data as BridgeMessage;
      if (!d || d.__rtaLiveBridge !== true || d.kind !== "cards") return;
      if (Array.isArray(d.cards)) {
        onCards(d.cards, d.syncedAt ?? null, d.roster ?? [], d.languages ?? {});
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onCards]);
}
