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

interface BridgeMessage {
  __rtaLiveBridge?: boolean;
  kind?: string;
  cards?: CommandCard[];
  syncedAt?: string | null;
}

export function useExtensionBridge(
  onCards: (cards: CommandCard[], syncedAt: string | null) => void,
): void {
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data as BridgeMessage;
      if (!d || d.__rtaLiveBridge !== true || d.kind !== "cards") return;
      if (Array.isArray(d.cards) && d.cards.length > 0) {
        onCards(d.cards, d.syncedAt ?? null);
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onCards]);
}
