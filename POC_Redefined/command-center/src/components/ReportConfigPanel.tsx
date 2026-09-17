/**
 * ReportConfigPanel.tsx — slide-in configuration drawer for the GTT report.
 *
 * Sections:
 *   · Data Source  — functional area, sites
 *   · Columns      — which DiscrepancyRow fields to show in the table
 *   · Recipients   — comma-separated emails (clipboard copy for MVP)
 *   · Schedule     — off / 3x-day / 5x-day / custom times (stored in localStorage,
 *                    executed by useReportScheduler in App.tsx)
 *   · Chat Digest  — send a combined Attendance+Adherence summary to Google
 *                    Chat now, or automatically every 30 min (independent of
 *                    Schedule above — see sendChatDigest in App.tsx)
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
  AccountId,
} from "../domain/types";
import { ACCOUNT_CATALOG } from "../domain/accounts";

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

// Keyed per-account — a global key here was the root of the account-mixing
// bug (switching from EPIC to CORELOGIC kept showing EPIC's functionalArea/
// sites/schedule until the RTA manually edited the panel again).
const storageConfigKey  = (accountId: string) => `rta.report.config.${accountId}`;
const storageHistoryKey = (accountId: string) => `rta.report.history.${accountId}`;

export function loadReportConfig(accountId: string, defaults: ReportConfig): ReportConfig {
  try {
    const raw = localStorage.getItem(storageConfigKey(accountId));
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function loadHistory(accountId: string): ReportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageHistoryKey(accountId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(accountId: string, entry: ReportHistoryEntry): void {
  const history = loadHistory(accountId);
  const updated = [entry, ...history.filter((h) => h.date !== entry.date)].slice(0, 30);
  localStorage.setItem(storageHistoryKey(accountId), JSON.stringify(updated));
}

interface ReportConfigPanelProps {
  accountId: string;
  defaults: ReportConfig;
  onClose: () => void;
  onConfigSave: (cfg: ReportConfig) => void;
  /** Sends the Attendance + Adherence digest to Google Chat right now, independent of the toggle below. */
  onSendChatDigestNow: () => void;
}

export function ReportConfigPanel({ accountId, defaults, onClose, onConfigSave, onSendChatDigestNow }: ReportConfigPanelProps) {
  const [cfg, setCfg] = useState<ReportConfig>(() => loadReportConfig(accountId, defaults));
  const [history, setHistory] = useState<ReportHistoryEntry[]>(() => loadHistory(accountId));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function persist(next: ReportConfig) {
    setCfg(next);
    localStorage.setItem(storageConfigKey(accountId), JSON.stringify(next));
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
            <div className="grd-section-label">Data Source — {ACCOUNT_CATALOG[accountId as AccountId]?.label ?? accountId}</div>
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <button
                className={`grd-filter-btn${cfg.source === "gtt_verint" ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, source: "gtt_verint" })}
              >
                GTT + Verint
              </button>
              <button
                className={`grd-filter-btn${cfg.source === "verint_only" ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, source: "verint_only" })}
              >
                Verint only
              </button>
            </div>
            {cfg.source === "verint_only" ? (
              <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                GTT isn't queried for this account — the report is built from Verint capture
                (attendance/adherence) only, with no GTT cross-reference.
              </p>
            ) : (
              <>
                {!ACCOUNT_CATALOG[accountId as AccountId]?.confirmed && (
                  <p style={{ fontSize: "0.7rem", color: "#f59e0b", marginBottom: "0.5rem" }}>
                    ⚠ This account's GTT functional area/sites aren't confirmed live yet (see
                    ACCOUNT_ONBOARDING_PLAN.md) — a wrong site string returns HTTP 200 with 0 rows, not an
                    error, so an empty report here doesn't necessarily mean a clean shift.
                  </p>
                )}
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
              </>
            )}
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
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <button
                className={`grd-filter-btn${cfg.schedule.mode === "off" ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, schedule: { mode: "off" } })}
              >
                Off
              </button>
              <button
                className={`grd-filter-btn${cfg.schedule.mode === "preset" && cfg.schedule.timesPerDay === 3 ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, schedule: { mode: "preset", timesPerDay: 3 } })}
              >
                3x per day
              </button>
              <button
                className={`grd-filter-btn${cfg.schedule.mode === "preset" && cfg.schedule.timesPerDay === 5 ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, schedule: { mode: "preset", timesPerDay: 5 } })}
              >
                5x per day
              </button>
              <button
                className={`grd-filter-btn${cfg.schedule.mode === "custom" ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, schedule: { mode: "custom", times: cfg.schedule.mode === "custom" ? cfg.schedule.times : ["09:00"] } })}
              >
                Custom
              </button>
            </div>
            {cfg.schedule.mode === "custom" && (
              <label className="grd-field-label" style={{ marginTop: "0.5rem" }}>
                Times (24h, comma-separated)
                <input
                  className="grd-input"
                  defaultValue={cfg.schedule.times.join(", ")}
                  onBlur={(e) => {
                    const times = e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
                    persist({ ...cfg, schedule: { mode: "custom", times: times.length ? times : ["09:00"] } });
                  }}
                  placeholder="08:00, 12:00, 16:00, 20:00"
                />
              </label>
            )}
            {cfg.schedule.mode !== "off" && (
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.35rem" }}>
                A fresh Verint capture runs automatically before each scheduled generation.
              </p>
            )}
          </section>

          {/* Chat Digest — independent of the report-generation schedule above.
              Sends a combined Attendance + Adherence summary to Google Chat,
              either now (button) or automatically every 30 minutes (toggle). */}
          <section>
            <div className="grd-section-label">Chat Digest (Attendance + Adherence)</div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="grd-btn grd-btn--primary"
                onClick={onSendChatDigestNow}
                title="Send the current Attendance + Adherence summary to Google Chat right now"
              >
                Send Now
              </button>
              <button
                className={`grd-filter-btn${!cfg.chatDigestEnabled ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, chatDigestEnabled: false })}
              >
                Off
              </button>
              <button
                className={`grd-filter-btn${cfg.chatDigestEnabled ? " grd-filter-btn--active" : ""}`}
                onClick={() => persist({ ...cfg, chatDigestEnabled: true })}
              >
                Every 30 min
              </button>
            </div>
            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.35rem" }}>
              Uses whatever Attendance report and live Adherence data already exist — doesn't trigger a new capture or generation.
            </p>
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
