/**
 * fuelixClient.ts — FuelIX AI API streaming client
 *
 * What this file does:
 *   Provides a thin wrapper around the FuelIX AI API (OpenAI-compatible).
 *   All three Copilot panel actions (explain, recommend, improve draft) use
 *   this client. Responses are streamed token-by-token so the RTA sees words
 *   appear immediately rather than waiting for the full answer.
 *
 * ⚠️  SECURITY WARNING — READ BEFORE DEPLOYING ⚠️
 * ---------------------------------------------------
 * The API key is read from the Vite env variable VITE_FUELIX_API_KEY.
 * Vite embeds any variable prefixed with VITE_ directly into the browser
 * JavaScript bundle at build time. This means the key is visible to anyone
 * who opens DevTools → Sources. This is acceptable for an internal demo, but
 * IS NOT ACCEPTABLE FOR PRODUCTION.
 *
 * Production fix options (pick one):
 *   Option A — Backend proxy:
 *     Create a /api/ai-chat endpoint (Node.js, Next.js API route, Azure Function).
 *     The browser sends the prompt; the backend holds the API key server-side
 *     and forwards the request to FuelIX. The key never reaches the browser.
 *
 *   Option B — Replace with Azure OpenAI + Managed Identity:
 *     Use Azure AD tokens issued to the user's browser session instead of a
 *     shared API key. Works well inside CIBC's Azure tenant.
 *
 *   Option C — Model Context Protocol (MCP) gateway:
 *     Route all AI calls through an MCP server running inside the CIBC network.
 *     The browser talks only to the MCP server; it never sees external credentials.
 *
 * Configuration:
 *   VITE_FUELIX_BASE_URL  — base URL of the FuelIX-compatible API
 *                           (defaults to https://api.fuelix.ai/v1)
 *   VITE_FUELIX_API_KEY   — API key (leave blank to disable AI features)
 *   VITE_FUELIX_MODEL     — model name (defaults to claude-haiku-4-5)
 *
 * See also: .env.example for setup instructions.
 */

const BASE_URL = import.meta.env.VITE_FUELIX_BASE_URL ?? "https://api.fuelix.ai/v1";
const API_KEY  = import.meta.env.VITE_FUELIX_API_KEY  ?? "";
const MODEL    = import.meta.env.VITE_FUELIX_MODEL    ?? "claude-haiku-4-5";

// ---------------------------------------------------------------------------
// System prompt — who the AI is and how it should behave
// ---------------------------------------------------------------------------

/**
 * Injected as the system message in every completion request.
 * Keeps responses concise, operational, and free of jargon.
 * Modify this if the RTA role or LOB context changes.
 */
const SYSTEM_PROMPT = `You are an AI assistant embedded in the CIBC Real-Time Analyst (RTA) Command Center.
The RTA monitors agent adherence and service level across multiple Lines of Business (LOBs) in a contact centre.
Your role is to help the RTA make fast, confident operational decisions.
Be concise, direct, and action-oriented. Never use jargon the RTA wouldn't know.
Respond in 2–4 sentences maximum unless asked for more. No markdown.`;

// ---------------------------------------------------------------------------
// Core streaming call
// ---------------------------------------------------------------------------

/**
 * Calls the FuelIX API and streams completion tokens back via callbacks.
 *
 * @param userPrompt - The full prompt text to send to the model.
 * @param onToken    - Called with each new token string as it arrives.
 * @param onDone     - Called when the stream is complete (no error).
 * @param onError    - Called with an error message if something fails.
 * @param signal     - Optional AbortSignal to cancel the request in flight.
 *                     Pass `controller.signal` from an AbortController.
 *                     This prevents memory leaks when the user closes a card
 *                     while the stream is still running.
 *
 * @example
 * const controller = new AbortController();
 * await streamCompletion(prompt, setToken, onDone, setError, controller.signal);
 * // To cancel: controller.abort();
 */
export async function streamCompletion(
  userPrompt: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!API_KEY) {
    onError("FuelIX API key not configured. Add VITE_FUELIX_API_KEY to .env.local.");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        stream:      true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
        max_tokens:  AI_MAX_TOKENS,
        temperature: 0.4,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      onError(`FuelIX API error ${res.status}: ${text.slice(0, 120)}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError("No response body from FuelIX API."); return; }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") { onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (token) onToken(token);
        } catch {
          // Partial JSON line from the SSE stream — expected, safe to skip.
        }
      }
    }
    onDone();
  } catch (err) {
    // AbortError is intentional (user closed the panel) — don't surface it as an error.
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Network error");
  }
}

// ---------------------------------------------------------------------------
// Prompt builders — one per Copilot action
// ---------------------------------------------------------------------------

/**
 * Context passed to all prompt builders.
 * Subset of CommandCard fields, typed independently so the service layer
 * does not depend on the full CommandCard type.
 */
export interface CardContext {
  /** Card title as shown in the Priority Feed. */
  title: string;
  /** One-sentence summary of what the AI detected. */
  summary: string;
  /** Line of Business (e.g. "TLB", "Fraud ITR"). */
  lob?: string;
  /** Agent's full name if the card is about a specific agent. */
  agentName?: string;
  /** Agent's current Verint status (e.g. "COAC", "INBD"). */
  currentStatus?: string;
  /** What the schedule says the agent should be doing. */
  scheduledActivity?: string;
  /** Human-readable duration (e.g. "32 min 14 sec"). */
  duration?: string;
  /** The alert rule that triggered this card. */
  ruleName?: string;
  /** The threshold that was crossed (e.g. "9 min"). */
  ruleThreshold?: string;
  /** AI confidence at time of review (0–1). */
  confidence?: number;
  /** The draft message already on the card. */
  draftMessage?: string;
}

/**
 * Builds the "explain this card" prompt for the Copilot panel.
 * Asks the AI: what happened, why does it matter, what is the risk?
 *
 * @param card - Context extracted from the selected CommandCard.
 * @returns    Formatted prompt string ready to send to streamCompletion.
 */
export function buildExplainPrompt(card: CardContext): string {
  return `An AI system flagged this situation:

Title: ${card.title}
Summary: ${card.summary}
LOB: ${card.lob ?? "Unknown"}
${card.agentName        ? `Agent: ${card.agentName}` : ""}
${card.currentStatus    ? `Current status: ${card.currentStatus}` : ""}
${card.scheduledActivity ? `Scheduled: ${card.scheduledActivity}` : ""}
${card.ruleName         ? `Rule triggered: ${card.ruleName}` : ""}
${card.ruleThreshold    ? `Threshold: ${card.ruleThreshold}` : ""}
${card.confidence       ? `AI confidence: ${Math.round(card.confidence * 100)}%` : ""}

Explain to the RTA in plain language — what is happening, why it matters right now, and what the risk is if it is not addressed.`;
}

/**
 * Builds the "recommend an action" prompt for the Copilot panel.
 * Asks the AI: what should the RTA do right now, and who should they notify?
 *
 * @param card - Context extracted from the selected CommandCard.
 * @returns    Formatted prompt string ready to send to streamCompletion.
 */
export function buildRecommendPrompt(card: CardContext): string {
  return `Based on this situation, give the RTA a specific, actionable recommendation:

Title: ${card.title}
LOB: ${card.lob ?? "Unknown"}
${card.agentName        ? `Agent: ${card.agentName}` : ""}
${card.currentStatus    ? `Current status: ${card.currentStatus}` : ""}
${card.scheduledActivity ? `Scheduled: ${card.scheduledActivity}` : ""}
${card.ruleName         ? `Rule: ${card.ruleName}` : ""}

What should the RTA do right now? Be specific about who to notify and how.`;
}

/**
 * Builds the "improve the draft message" prompt for the Copilot panel.
 * Asks the AI to make the message clearer, shorter, and more professional.
 *
 * @param card       - Context extracted from the selected CommandCard.
 * @param editedText - The RTA's current text in the message editor.
 * @returns          Formatted prompt ready to send to streamCompletion.
 */
export function buildImproveDraftPrompt(card: CardContext, editedText: string): string {
  return `The RTA is editing this alert message before sending it to the LOB team:

Original draft: "${card.draftMessage ?? ""}"
Current text: "${editedText}"
Context: ${card.title} — ${card.lob ?? "unknown LOB"}
${card.agentName ? `Agent: ${card.agentName}` : ""}

Make the message clearer, more professional, and easy to act on. Keep it under 3 sentences. Return only the improved message text with no introduction or explanation.`;
}

// ---------------------------------------------------------------------------
// Internal constant (sourced from shared/constants.ts at build time)
// ---------------------------------------------------------------------------

/**
 * Maximum tokens the AI will generate per response.
 * Imported here to avoid a circular dependency with shared/constants.ts.
 * Kept in sync with AI_MAX_TOKENS in that file — update both if you change it.
 */
const AI_MAX_TOKENS = 200;
