/**
 * CopilotPanel.tsx
 * ----------------
 * Embedded AI copilot dialogue that opens inline within a priority card.
 * The RTA never leaves the card to interact with AI.
 *
 * Flow:  Why  →  Recommend  →  Draft (edit + AI improve)  →  Apply
 *
 * Powered by FuelIX (Telus internal LLM, OpenAI-compatible).
 * Streams tokens so responses feel immediate, not batched.
 *
 * Props:
 *  - initialStep: jump directly to "draft" when opened from "Edit message"
 */

import { useEffect, useRef, useState } from "react";
import type { CardAction, CommandCard } from "../domain/types";
import {
  CHANNEL_LABELS,
  confidenceLabel,
  explainWhyFlagged,
  getPrimaryAction,
  primaryActionLabel,
} from "../utils/cardHelpers";
import {
  buildExplainPrompt,
  buildImproveDraftPrompt,
  buildRecommendPrompt,
  streamCompletion,
  type CardContext,
} from "../services/fuelixClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CopilotStep = "why" | "recommend" | "draft" | "done";

interface CopilotPanelProps {
  card: CommandCard;
  /** Jump to a specific step — used when "Edit message" is clicked directly */
  initialStep?: CopilotStep;
  onAction: (action: CardAction) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Streaming text hook
// ---------------------------------------------------------------------------

function useAIStream(prompt: string | null) {
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!prompt) return;
    abortRef.current = false;
    setText("");
    setLoading(true);
    setError(null);

    streamCompletion(
      prompt,
      (token) => { if (!abortRef.current) setText((t) => t + token); },
      ()      => { if (!abortRef.current) setLoading(false); },
      (err)   => { if (!abortRef.current) { setError(err); setLoading(false); } },
    );

    return () => { abortRef.current = true; };
  }, [prompt]);

  return { text, loading, error };
}

// ---------------------------------------------------------------------------
// Card context builder
// ---------------------------------------------------------------------------

function toCardContext(card: CommandCard): CardContext {
  return {
    title:             card.title,
    summary:           card.summary,
    lob:               card.lob,
    agentName:         card.agent?.name,
    currentStatus:     card.agent?.currentStatus,
    scheduledActivity: card.agent?.scheduledActivity,
    ruleName:          card.rule?.description,
    ruleThreshold:     card.rule?.threshold,
    confidence:        card.confidence,
    draftMessage:      card.draftMessage,
  };
}

// ---------------------------------------------------------------------------
// Inline streaming text renderer
// ---------------------------------------------------------------------------

function AiText({
  text,
  loading,
  error,
  fallback,
}: {
  text: string;
  loading: boolean;
  error: string | null;
  fallback: string;
}) {
  if (error) {
    return (
      <p className="copilot-step__text">
        {fallback}
        <span className="copilot-ai-note"> (AI offline — using local reasoning)</span>
      </p>
    );
  }
  if (loading && !text) {
    return (
      <p className="copilot-step__text copilot-step__text--loading">
        <span className="copilot-ai-typing">AI is thinking</span>
        <span className="copilot-ai-cursor" />
      </p>
    );
  }
  return (
    <p className="copilot-step__text">
      {text || fallback}
      {loading && <span className="copilot-ai-cursor" />}
    </p>
  );
}

// ---------------------------------------------------------------------------
// CopilotPanel
// ---------------------------------------------------------------------------

export function CopilotPanel({
  card,
  initialStep = "why",
  onAction,
  onClose,
}: CopilotPanelProps) {
  const [step,         setStep]         = useState<CopilotStep>(initialStep);
  const [draftText,    setDraftText]    = useState(card.draftMessage ?? "");
  const [improvePrompt, setImprovePrompt] = useState<string | null>(null);
  const [explainPrompt, setExplainPrompt] = useState<string | null>(null);
  const [recommendPrompt, setRecommendPrompt] = useState<string | null>(null);

  const ctx = toCardContext(card);

  // AI streams — only trigger when the RTA requests each one
  const explain   = useAIStream(explainPrompt);
  const recommend = useAIStream(recommendPrompt);
  const improve   = useAIStream(improvePrompt);

  // Sync improved text into the draft textarea when stream finishes
  useEffect(() => {
    if (!improve.loading && improve.text) {
      setDraftText(improve.text);
    }
  }, [improve.loading, improve.text]);

  const primaryAction = getPrimaryAction(card);
  const primaryLabel  = primaryActionLabel(card, primaryAction);
  const confidence    = confidenceLabel(card);

  function requestExplain() {
    if (!explainPrompt) setExplainPrompt(buildExplainPrompt(ctx));
    setStep("recommend");
  }
  function requestRecommend() {
    if (!recommendPrompt) setRecommendPrompt(buildRecommendPrompt(ctx));
    if (card.draftMessage) setStep("draft");
  }
  function requestImprove() {
    setImprovePrompt(buildImproveDraftPrompt(ctx, draftText));
  }

  const isDraftStep    = step === "draft" || step === "done";
  const isRecommendStep = step === "recommend" || isDraftStep;

  return (
    <div className="copilot-panel" aria-label="AI Copilot">

      {/* Header */}
      <div className="copilot-panel__header">
        <div className="copilot-panel__ai-tag">
          <span className="copilot-panel__ai-dot" />
          <span>AI Copilot · FuelIX</span>
        </div>
        <div className="copilot-panel__step-indicator">
          {["why", "recommend", "draft"].map((s, i) => (
            <span
              key={s}
              className={`copilot-step-dot${step === s ? " copilot-step-dot--active" : ""}${
                ["why", "recommend", "draft"].indexOf(step) > i ? " copilot-step-dot--done" : ""
              }`}
            />
          ))}
        </div>
        <button
          className="copilot-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
        >
          ×
        </button>
      </div>

      {/* ── Step 1 — Why ── */}
      <div className="copilot-step copilot-step--active">
        <p className="copilot-step__label">Why AI flagged this</p>

        <AiText
          text={explain.text}
          loading={explain.loading}
          error={explain.error}
          fallback={explainWhyFlagged(card)}
        />

        {card.rule && (
          <p className="copilot-step__rule">
            Rule: {card.rule.description}
            {card.rule.threshold ? ` · threshold: ${card.rule.threshold}` : ""}
          </p>
        )}

        {card.confidence !== undefined && (
          <div className="copilot-confidence">
            <span className="copilot-confidence__label">{confidence}</span>
            <div className="copilot-confidence__bar">
              <div
                className="copilot-confidence__fill"
                style={{ width: `${Math.round(card.confidence * 100)}%` }}
              />
            </div>
            <span className="copilot-confidence__pct">
              {Math.round(card.confidence * 100)}%
            </span>
          </div>
        )}

        {/* Only show "Ask AI to explain" if we haven't asked yet */}
        {step === "why" && (
          <div className="copilot-step__actions">
            {!explainPrompt ? (
              <button
                className="copilot-btn copilot-btn--ai"
                type="button"
                onClick={() => {
                  setExplainPrompt(buildExplainPrompt(ctx));
                }}
              >
                ✦ Ask AI to explain
              </button>
            ) : null}
            <button
              className="copilot-btn copilot-btn--next"
              type="button"
              onClick={requestExplain}
            >
              What do you recommend? →
            </button>
          </div>
        )}
      </div>

      {/* ── Step 2 — Recommend ── */}
      {isRecommendStep && (
        <div className="copilot-step copilot-step--active">
          <p className="copilot-step__label">What I recommend</p>

          <AiText
            text={recommend.text}
            loading={recommend.loading}
            error={recommend.error}
            fallback={card.aiRecommendation ?? card.recommendedAction}
          />

          {card.agent && (
            <div className="copilot-agent-context">
              <p className="copilot-agent-context__name">{card.agent.name}</p>
              <p className="copilot-agent-context__detail">
                {card.agent.lob} · {card.agent.currentStatus}
                {" "}(scheduled: {card.agent.scheduledActivity})
              </p>
              <div className="copilot-adherence-bar">
                <div
                  className={`copilot-adherence-fill${
                    card.agent.adherenceInPercent < 75 ? " copilot-adherence-fill--low" : ""
                  }`}
                  style={{ width: `${card.agent.adherenceInPercent}%` }}
                />
              </div>
              <span className="copilot-adherence-label">
                {card.agent.adherenceInPercent}% in-adherence
              </span>
              {(card.agent.shiftSpanMinutes != null || card.agent.productivePaidMinutes != null) && (
                <p className="copilot-agent-context__detail">
                  {card.agent.shiftSpanMinutes != null &&
                    `Shift ${Math.floor(card.agent.shiftSpanMinutes / 60)}h ${card.agent.shiftSpanMinutes % 60}m`}
                  {card.agent.productivePaidMinutes != null &&
                    ` · Productive ${Math.floor(card.agent.productivePaidMinutes / 60)}h ${card.agent.productivePaidMinutes % 60}m (paid)`}
                </p>
              )}
            </div>
          )}

          {step === "recommend" && (
            <div className="copilot-step__actions">
              {!recommendPrompt && (
                <button
                  className="copilot-btn copilot-btn--ai"
                  type="button"
                  onClick={() => setRecommendPrompt(buildRecommendPrompt(ctx))}
                >
                  ✦ Get AI recommendation
                </button>
              )}
              {card.draftMessage ? (
                <button
                  className="copilot-btn copilot-btn--next"
                  type="button"
                  onClick={requestRecommend}
                >
                  See the draft →
                </button>
              ) : (
                <button
                  className="copilot-btn copilot-btn--primary"
                  type="button"
                  onClick={() => { onAction(primaryAction); setStep("done"); }}
                >
                  {primaryLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3 — Draft & Edit ── */}
      {isDraftStep && (card.draftMessage || initialStep === "draft") && (
        <div className="copilot-step copilot-step--active">
          <p className="copilot-step__label">Draft message</p>

          {card.selectedChannel && (
            <div className="copilot-channel">
              <span className="copilot-channel__arrow">→</span>
              <span>{CHANNEL_LABELS[card.selectedChannel!] ?? card.selectedChannel}</span>
            </div>
          )}

          {/* Always-visible edit textarea */}
          <div className="copilot-draft-edit-always">
            <textarea
              className="copilot-draft-textarea"
              value={draftText}
              rows={4}
              placeholder="Type or edit the message here…"
              onChange={(e) => setDraftText(e.target.value)}
            />

            <div className="copilot-draft-toolbar">
              {/* AI improve button */}
              <button
                className="copilot-btn copilot-btn--ai copilot-btn--sm"
                type="button"
                onClick={requestImprove}
                disabled={improve.loading}
                title="Ask FuelIX AI to improve this message"
              >
                {improve.loading ? "Improving…" : "✦ Improve with AI"}
              </button>
              {improve.text && !improve.loading && (
                <span className="copilot-draft-toolbar__note">AI improved ✓</span>
              )}
            </div>

            {/* Char count */}
            <span className="copilot-draft-charcount">{draftText.length} characters</span>
          </div>

          {step === "draft" && (
            <div className="copilot-draft-actions">
              <button
                className="copilot-btn copilot-btn--primary"
                type="button"
                onClick={() => { onAction(primaryAction); setStep("done"); }}
              >
                {primaryLabel}
              </button>
              <button
                className="copilot-btn copilot-btn--ghost"
                type="button"
                onClick={() => { onAction("suppress"); setStep("done"); }}
              >
                Skip this
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4 — Done ── */}
      {step === "done" && (
        <div className="copilot-step copilot-step--done">
          <p className="copilot-step__label">Done</p>
          <p className="copilot-step__text copilot-step__text--muted">
            AI recorded your decision as a learning signal.
          </p>
          <button
            className="copilot-btn copilot-btn--ghost"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      )}

    </div>
  );
}
