/**
 * ReportConfigPanel.tsx — slide-in configuration drawer for the GTT report.
 *
 * Sections:
 *   · Data Source  — functional area, sites
 *   · Columns      — which DiscrepancyRow fields to show in the table
 *   · Recipients   — comma-separated emails (clipboard copy for MVP)
 *   · Schedule     — off / daily / weekly (stored in localStorage)
 *   · History      — past report summaries with intelligence bullets
 *
 * State persisted to localStorage["rta.report.config"] and ["rta.report.history"].
 */

import { useState, useEffect } from "react";
import type {
  ReportConfig,
  ReportHistoryEntry,
  DiscrepancyRow,
  DEFAULT_REPORT_CONFIG,
} from "../domain/types";

const ALL_COLUMNS: { key: keyof DiscrepancyRow; label: string }[] = [
  { key: "employee",          label: "Employee" },
  { key: "workday_id",        label: "Workday ID" },
  { key: "subgroup",          label: "Subgroup (GTT)" },
  { key: "lob",               label: "LOB (Verint)" },
  { key: "gtt_event",         label: "GTT Events" },
  { key: "gtt_event_count",   label: "# GTT Events" },
  { key: "verint_status",     label: "Verint Status" },
  { key: "adherence_pct",     label: "Adherence %" },
  { key: "adherence_minutes", label: "Adherence Minutes" },
  { key: "ooa_seconds",       label: "OOA Duration" },
  { key: "ooa_minutes",       label: "OOA Minutes (Total)" },
  { key: "productive_minutes", label: "Productive Time" },
  { key: "scheduled_minutes", label: "Scheduled Time" },
  { key: "discrepancy_type",  label: "Discrepancy Type" },
];

const STORAGE_CONFIG  = "rta.report.config";
const STORAGE_HISTORY = "rta.report.history";

function loadConfig(defaults: ReportConfig): ReportConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function loadHistory(): ReportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: ReportHistoryEntry): void {
  const history = loadHistory();
  const updated = [entry, ...history.filter((h) => h.date !== entry.date)].slice(0, 30);
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(updated));
}

interface ReportConfigPanelProps {
  defaults: ReportConfig;
  onClose: () => void;
  onConfigSave: (cfg: ReportConfig) => void;
}

export function ReportConfigPanel({ defaults, onClose, onConfigSave }: ReportConfigPanelProps) {
  const [cfg, setCfg] = useState<ReportConfig>(() => loadConfig(defaults));
  const [history, setHistory] = useState<ReportHistoryEntry[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function persist(next: ReportConfig) {
    setCfg(next);
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(next));
  }

  function toggleColumn(key: keyof DiscrepancyRow) {
    const cols = cfg.visibleColumns.includes(key)
      ? cfg.visibleColumns.filter((c) => c !== key)
      : [...cfg.visibleColumns, key];
    persist({ ...cfg, visibleColumns: cols });
  }

  function copyRecipients() {
    navigator.clipboard.writeText(cfg.recipients).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSave() {
    onConfigSave(cfg);
    onClose();
  }

  return (
    <div
      className="adm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Report configuration"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="adm"
        style={{ maxWidth: 480, width: "90vw", maxHeight: "90vh", overflowY: "auto", marginLeft: "auto", marginRight: 0, borderRadius: "12px 0 0 12px" }}
      >
        {/* Header */}
        <div className="adm__header">
          <span className="adm__title">Report Config</span>
          <button className="adm__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="adm__body" style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Data Source */}
          <section>
            <div className="grd-section-label">Data Source</div>
            <label className="grd-field-label">Functional Area
              <input
                className="grd-input"
                value={cfg.functionalArea}
                onChange={(e) => persist({ ...cfg, functionalArea: e.target.value })}
                placeholder="FA_CIBC"
              />
            </label>
            <label className="grd-field-label" style={{ marginTop: "0.5rem" }}>Sites (pipe-semicolon separated)
              <input
                className="grd-input"
                value={cfg.sites}
                onChange={(e) => persist({ ...cfg, sites: e.target.value })}
                placeholder="GT - Guatemala - Pradera East"
              />
            </label>
          </section>

          {/* Visible Columns */}
          <section>
            <div className="grd-section-label">Visible Columns</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {ALL_COLUMNS.map(({ key, label }) => {
                const active = cfg.visibleColumns.includes(key);
                return (
                  <button
                    key={key}
                    className={`grd-filter-btn${active ? " grd-filter-btn--active" : ""}`}
                    onClick={() => toggleColumn(key)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recipients */}
          <section>
            <div className="grd-section-label">Recipients</div>
            <textarea
              className="grd-input"
              rows={3}
              value={cfg.recipients}
              onChange={(e) => persist({ ...cfg, recipients: e.target.value })}
              placeholder="name@cibc.com, name2@cibc.com"
              style={{ resize: "vertical" }}
            />
            <button
              className="grd-btn grd-btn--ghost"
              style={{ marginTop: "0.4rem", fontSize: "0.75rem" }}
              onClick={copyRecipients}
              disabled={!cfg.recipients}
            >
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
          </section>

          {/* Schedule */}
          <section>
            <div className="grd-section-label">Schedule</div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              {(["off", "daily", "weekly"] as const).map((s) => (
                <button
                  key={s}
                  className={`grd-filter-btn${cfg.schedule === s ? " grd-filter-btn--active" : ""}`}
                  onClick={() => persist({ ...cfg, schedule: s })}
                  style={{ textTransform: "capitalize" }}
                >
                  {s}
                </button>
              ))}
            </div>
            {cfg.schedule !== "off" && (
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.35rem" }}>
                Schedule stored locally — cron wiring coming in a future release.
              </p>
            )}
          </section>

          {/* Visualisations History */}
          <section>
            <button
              className="grd-section-label"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%", padding: 0 }}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <span>Visualisations History ({history.length})</span>
              <span>{historyOpen ? "▲" : "▼"}</span>
            </button>

            {historyOpen && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {history.length === 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#64748b" }}>No reports generated yet.</p>
                )}
                {history.map((h, i) => (
                  <div key={i} style={{ padding: "0.6rem 0.8rem", background: "#1e293b", borderRadius: 6, fontSize: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                      <strong style={{ color: "#e2e8f0" }}>{h.date}</strong>
                      <span style={{ color: "#64748b" }}>{new Date(h.generated_at).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ color: "#94a3b8", marginBottom: "0.3rem" }}>
                      GTT {h.gtt_total} · Verint {h.verint_total} · Matched {h.matched} · ⚠ {h.discrepancy_count}
                    </div>
                    {h.intelligence.map((b, j) => (
                      <div key={j} style={{ color: "#64748b", fontSize: "0.7rem" }}>• {b}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Footer */}
        <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button className="grd-btn grd-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="grd-btn grd-btn--primary" onClick={handleSave}>Apply</button>
        </div>
      </div>
    </div>
  );
}
