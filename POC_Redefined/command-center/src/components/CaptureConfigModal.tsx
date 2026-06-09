/**
 * CaptureConfigModal.tsx
 * ----------------------
 * The "Capture Data" hub: configure WHERE the AI captures from (System), HOW
 * (Method), and HOW OFTEN (Frequency) — plus a "Sync now" override and a
 * "last synced" transparency readout.
 *
 * Product stance: capture runs AUTOMATICALLY on the chosen frequency; this panel
 * is the configuration + override + transparency surface, not a manual chore.
 *
 * Honesty: only Verint + Browser Extension is LIVE today. ServiceNow / GTT and
 * API / OCR / Computer Vision are shown as "planned" (disabled). "Simulated" runs
 * the built-in demo scan. We never present a non-working adapter as working.
 */
import { useState } from "react";

export type CaptureSystem = "verint" | "simulated";

interface CaptureConfigModalProps {
  system: CaptureSystem;
  setSystem: (s: CaptureSystem) => void;
  frequency: number | null; // seconds; null = Off
  setFrequency: (n: number | null) => void;
  lastSynced: string | null;
  live: boolean;
  onSyncNow: () => void;
  onClose: () => void;
}

type Status = "live" | "planned" | "demo";

const SYSTEMS: { id: CaptureSystem | string; label: string; status: Status }[] = [
  { id: "verint", label: "Verint", status: "live" },
  { id: "servicenow", label: "ServiceNow", status: "planned" },
  { id: "gtt", label: "GTT (Attendance)", status: "planned" },
  { id: "simulated", label: "Simulated (demo)", status: "demo" },
];

const METHODS: Record<string, { label: string; status: Status }[]> = {
  verint: [
    { label: "Browser Extension", status: "live" },
    { label: "Verint REST API", status: "planned" },
    { label: "OCR", status: "planned" },
    { label: "Computer Vision", status: "planned" },
  ],
  simulated: [{ label: "Built-in scan", status: "demo" }],
  servicenow: [{ label: "REST API", status: "planned" }],
  gtt: [{ label: "CSV / API", status: "planned" }],
};

const FREQS: { label: string; v: number | null }[] = [
  { label: "Off", v: null },
  { label: "30s", v: 30 },
  { label: "1 min", v: 60 },
  { label: "5 min", v: 300 },
  { label: "15 min", v: 900 },
];

const badge = (s: Status) =>
  s === "live"
    ? { text: "LIVE", bg: "#16a34a" }
    : s === "demo"
    ? { text: "DEMO", bg: "#6b7280" }
    : { text: "PLANNED", bg: "#9ca3af" };

export function CaptureConfigModal(p: CaptureConfigModalProps) {
  const [selectedSystem, setSelectedSystem] = useState<string>(p.system);
  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(10,12,24,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  };
  const card: React.CSSProperties = {
    background: "#fff", color: "#1a1a2e", width: 460, maxWidth: "92vw",
    borderRadius: 12, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.35)",
    font: "13px -apple-system, system-ui, sans-serif",
  };
  const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 };

  const choosable = (id: string) => id === "verint" || id === "simulated";

  function chip(active: boolean, disabled: boolean): React.CSSProperties {
    return {
      padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
      background: active ? "#eff6ff" : "#fff",
      color: disabled ? "#9ca3af" : "#1a1a2e",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1,
      display: "flex", alignItems: "center", gap: 6,
    };
  }
  function pill(s: Status): React.CSSProperties {
    const b = badge(s);
    return { fontSize: 9, fontWeight: 700, color: "#fff", background: b.bg, borderRadius: 4, padding: "1px 5px" };
  }

  const methods = METHODS[selectedSystem] || [];

  return (
    <div style={overlay} onClick={p.onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Capture Data</h2>
          <button onClick={p.onClose} style={{ border: 0, background: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        <p style={{ color: "#666", marginTop: 4 }}>
          The AI captures automatically on the chosen frequency. Configure the source, method, and cadence —
          or use <b>Sync now</b> to refresh on demand.
        </p>

        {/* System */}
        <div style={{ marginTop: 12, fontWeight: 700 }}>System</div>
        <div style={row}>
          {SYSTEMS.map((s) => {
            const disabled = s.status === "planned";
            const active = selectedSystem === s.id;
            return (
              <button key={s.id} style={chip(active, disabled)} disabled={disabled}
                onClick={() => { if (!disabled && choosable(s.id)) { setSelectedSystem(s.id); p.setSystem(s.id as CaptureSystem); } }}>
                {s.label} <span style={pill(s.status)}>{badge(s.status).text}</span>
              </button>
            );
          })}
        </div>

        {/* Method */}
        <div style={{ marginTop: 14, fontWeight: 700 }}>Method</div>
        <div style={row}>
          {methods.map((m, i) => {
            const disabled = m.status === "planned";
            const active = !disabled && i === 0; // the live/demo method is the active one
            return (
              <span key={m.label} style={chip(active, disabled)}>
                {m.label} <span style={pill(m.status)}>{badge(m.status).text}</span>
              </span>
            );
          })}
        </div>

        {/* Frequency */}
        <div style={{ marginTop: 14, fontWeight: 700 }}>Frequency</div>
        <div style={row}>
          {FREQS.map((f) => (
            <button key={f.label} style={chip(p.frequency === f.v, false)} onClick={() => p.setFrequency(f.v)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Sync now + transparency */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
          <button onClick={p.onSyncNow}
            style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
            Sync now
          </button>
          <span style={{ color: "#666", fontSize: 12 }}>
            {p.live && p.lastSynced ? `last synced ${new Date(p.lastSynced).toLocaleTimeString()}` : "not synced yet"}
          </span>
        </div>

        <p style={{ color: "#9ca3af", fontSize: 10, marginTop: 14, lineHeight: 1.5 }}>
          Only <b>Verint + Browser Extension</b> is live in this demo; ServiceNow, GTT, API, OCR and Computer
          Vision are planned. Capture is read-only. Live capture requires the RTA Live Bridge extension and an
          open Verint session.
        </p>
      </div>
    </div>
  );
}
