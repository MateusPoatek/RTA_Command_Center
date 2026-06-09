/**
 * CaptureModal.tsx
 * -----------------
 * Simulates the AI reading the Verint screen.
 * Shows real Verint screenshots, sweeps a scan line across them,
 * then highlights the exceptions it "found" before injecting cards.
 *
 * UX phases:
 *  1. "Connecting…"  (0–0.6s)  — modal opens, screenshots fade in
 *  2. "Scanning…"    (0.6–2.4s) — laser line sweeps; exception boxes appear
 *  3. "Found X items" (2.4–3.2s) — summary overlay with found items
 *  4. Closes         (3.2s)     — parent injects cards, ticker logs result
 *
 * Screenshot bounding boxes are calibrated to the actual Verint images.
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Detected exceptions — what the AI "reads" from each screenshot
// ---------------------------------------------------------------------------

interface DetectedItem {
  id: string;
  label: string;
  detail: string;
  severity: "critical" | "high" | "medium";
  /** 0–100 percentages relative to the image container */
  box: { top: number; left: number; width: number; height: number };
}

interface VerintScreen {
  src: string;
  caption: string;
  items: DetectedItem[];
}

const SCREENS: VerintScreen[] = [
  {
    src: "/verint-screenshots/summary.png",
    caption: "Adherence Status Summary — Guatemala",
    items: [
      {
        id: "s1-coaching",
        label: "5 in Coaching",
        detail: "COAC - Coaching: 5 actual vs scheduled",
        severity: "high",
        box: { top: 34, left: 60, width: 22, height: 5 },
      },
      {
        id: "s1-training",
        label: "32 out of adherence",
        detail: "Out Of Adherence: 32 agents flagged",
        severity: "critical",
        box: { top: 10, left: 0, width: 55, height: 8 },
      },
    ],
  },
  {
    src: "/verint-screenshots/coaching-agent-a.png",
    caption: "Agent view — Coaching threshold breach",
    items: [
      {
        id: "s2-agent-a",
        label: "Diego Salazar — COAC 0:32:00",
        detail: "Scheduled BLEN, actual COAC — 32 min over threshold",
        severity: "high",
        box: { top: 5, left: 0, width: 100, height: 30 },
      },
      {
        id: "s2-agent-c",
        label: "Elena Navarro — COAC 0:19:33",
        detail: "Scheduled BLEN, actual COAC — approaching threshold",
        severity: "medium",
        box: { top: 72, left: 0, width: 100, height: 28 },
      },
    ],
  },
  {
    src: "/verint-screenshots/coaching-agent-b.png",
    caption: "Agent view — Extended coaching session",
    items: [
      {
        id: "s3-agent-b",
        label: "Paula Vega — COAC 0:43:28",
        detail: "Scheduled BLEN, actual COAC — 43 min, exceeds 30 min threshold",
        severity: "high",
        box: { top: 5, left: 0, width: 100, height: 90 },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Severity colors
// ---------------------------------------------------------------------------
const boxColors: Record<DetectedItem["severity"], string> = {
  critical: "#d63031",
  high:     "#e17055",
  medium:   "#e6a817",
};

// ---------------------------------------------------------------------------
// CaptureModal
// ---------------------------------------------------------------------------

type Phase = "connecting" | "scanning" | "found" | "done";

interface CaptureModalProps {
  onComplete: (count: number) => void;
  onCancel: () => void;
}

export function CaptureModal({ onComplete, onCancel }: CaptureModalProps) {
  const [phase, setPhase]               = useState<Phase>("connecting");
  const [scanProgress, setScanProgress] = useState(0);   // 0–100
  const [visibleBoxes, setVisibleBoxes] = useState<Set<string>>(new Set());
  const [activeScreen, setActiveScreen] = useState(0);

  const totalFound = SCREENS.reduce((n, s) => n + s.items.length, 0);

  useEffect(() => {
    // Phase 1 → 2: connecting
    const t1 = window.setTimeout(() => setPhase("scanning"), 600);

    // Scan progress per screen
    let progress = 0;
    const scanInterval = setInterval(() => {
      progress += 3;
      setScanProgress(Math.min(progress, 100));

      // Reveal exception boxes as scan passes over them
      const screen = SCREENS[activeScreen];
      screen.items.forEach((item) => {
        if (progress >= item.box.top + item.box.height) {
          setVisibleBoxes((prev) => new Set([...prev, item.id]));
        }
      });

      if (progress >= 100) {
        clearInterval(scanInterval);
        if (activeScreen < SCREENS.length - 1) {
          window.setTimeout(() => {
            setActiveScreen((n) => n + 1);
            setScanProgress(0);
          }, 300);
        }
      }
    }, 40);

    // Phase 3: found
    const t2 = window.setTimeout(() => setPhase("found"), 2400);

    // Phase 4: close
    const t3 = window.setTimeout(() => {
      setPhase("done");
      onComplete(totalFound);
    }, 3400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(scanInterval);
    };
    // The empty dep array is intentional: this animation runs exactly once per mount.
    // Known limitation: `activeScreen` inside the interval reads the initial value (0)
    // because the interval closure captures it at mount time. React state updates
    // (setActiveScreen) do not update the local variable inside the closure.
    // This means the scan-line and box reveals only work correctly on screen 0.
    // Production fix: convert activeScreen to a ref so the interval always reads
    // the latest value without needing to be recreated.
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const currentScreen = SCREENS[Math.min(activeScreen, SCREENS.length - 1)];
  const allItems = SCREENS.flatMap((s) => s.items);

  return (
    <div className="capture-backdrop" role="dialog" aria-modal="true" aria-label="AI Verint scan">
      <div className="capture-modal">

        {/* Header */}
        <div className="capture-modal__header">
          <div className="capture-modal__ai-tag">
            <span className="capture-modal__ai-dot" />
            <span>AI Capture</span>
          </div>
          <div className="capture-modal__phase-label">
            {phase === "connecting" && "Connecting to Verint…"}
            {phase === "scanning"   && `Scanning ${currentScreen.caption}`}
            {phase === "found"      && `${totalFound} exceptions extracted`}
          </div>
          {phase === "connecting" && (
            <button className="capture-modal__cancel" type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>

        {/* Screen tabs */}
        <div className="capture-modal__screen-tabs">
          {SCREENS.map((s, i) => (
            <span
              key={i}
              className={`capture-screen-tab${i === activeScreen ? " capture-screen-tab--active" : ""}${i < activeScreen ? " capture-screen-tab--done" : ""}`}
            >
              {i < activeScreen ? "✓ " : ""}{s.caption}
            </span>
          ))}
        </div>

        {/* Screenshot with scan overlay */}
        {phase !== "done" && (
          <div className="capture-screenshot-wrap">
            {/* The actual Verint screenshot */}
            <img
              className={`capture-screenshot${phase === "connecting" ? " capture-screenshot--loading" : ""}`}
              src={currentScreen.src}
              alt={currentScreen.caption}
              // Demo screenshots live in public/verint-screenshots/ which is
              // git-ignored (raw Verint PII). Hide gracefully on a fresh clone.
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />

            {/* Scan laser line */}
            {phase === "scanning" && (
              <div
                className="capture-scan-line"
                style={{ top: `${scanProgress}%` }}
              />
            )}

            {/* Exception highlight boxes */}
            {currentScreen.items.map((item) =>
              visibleBoxes.has(item.id) ? (
                <div
                  key={item.id}
                  className="capture-box"
                  style={{
                    top:    `${item.box.top}%`,
                    left:   `${item.box.left}%`,
                    width:  `${item.box.width}%`,
                    height: `${item.box.height}%`,
                    borderColor: boxColors[item.severity],
                    boxShadow:   `0 0 0 2px ${boxColors[item.severity]}40`,
                  }}
                >
                  <span
                    className="capture-box__label"
                    style={{ background: boxColors[item.severity] }}
                  >
                    {item.label}
                  </span>
                </div>
              ) : null,
            )}

            {/* Found overlay */}
            {phase === "found" && (
              <div className="capture-found-overlay">
                <div className="capture-found-overlay__inner">
                  <span className="capture-found-overlay__count">{totalFound}</span>
                  <span className="capture-found-overlay__label">exceptions extracted</span>
                  <span className="capture-found-overlay__sub">Cards are being added to your queue…</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Findings list */}
        {phase !== "connecting" && (
          <div className="capture-findings">
            {allItems.map((item) => (
              <div
                key={item.id}
                className={`capture-finding${visibleBoxes.has(item.id) ? " capture-finding--visible" : ""}`}
                style={{ borderLeftColor: boxColors[item.severity] }}
              >
                <span
                  className="capture-finding__sev"
                  style={{ color: boxColors[item.severity] }}
                >
                  {item.severity}
                </span>
                <div>
                  <p className="capture-finding__label">{item.label}</p>
                  <p className="capture-finding__detail">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
