// FloorView — a spatial radar of the floor (see floor_view/docs/DESIGN.md).
//
// Neighbourhoods = LOBs. Each agent is a dot. Calm (in-adherence) dots are
// still + muted; only OUT-of-adherence avatars glow (heat = severity) —
// stillness-is-the-reward. Clicking a flaring avatar focuses its existing
// CommandCard (radar finds, card resolves). No names/scores on the board
// (state-not-scoreboard); identity shows on hover + on click.
//
// FIRST SLICE: flaring avatars come from the live/active alert cards; the calm
// majority is a SAMPLED count from lobHealth.queueDetails (the CC doesn't yet
// receive the full roster — that arrives when we wire the live census tier).
import { useMemo } from "react";
import type { CommandCard, LOBHealth, Severity } from "../domain/types";

interface FloorViewProps {
  cards: CommandCard[];
  lobData: LOBHealth[];
  onAgentClick: (cardId: string) => void;
}

// Cards in these states are no longer "on the floor" as live exceptions.
const RESOLVED: CommandCard["status"][] = ["sent", "suppressed", "resolved", "archived", "added-to-handoff"];

// Heat by severity — brighter = worse. rank also drives within-neighbourhood sort.
const HEAT: Record<Severity, { color: string; glow: string; rank: number }> = {
  critical: { color: "#d63031", glow: "rgba(214,48,49,.65)", rank: 4 },
  high: { color: "#e17055", glow: "rgba(225,112,85,.55)", rank: 3 },
  medium: { color: "#e6a817", glow: "rgba(230,168,23,.5)", rank: 2 },
  low: { color: "#6c757d", glow: "rgba(108,117,125,.4)", rank: 1 },
  info: { color: "#0984e3", glow: "rgba(9,132,227,.4)", rank: 0 },
};

export function FloorView({ cards, lobData, onAgentClick }: FloorViewProps) {
  const neighbourhoods = useMemo(() => {
    // Group case-insensitively: cards use "Costco", lobHealth uses "COSTCO" —
    // they're the same neighbourhood. Key on a normalized LOB; keep a display name.
    const norm = (s: string) => s.trim().toUpperCase();
    const flaggedByLob: Record<string, CommandCard[]> = {};
    const display: Record<string, string> = {};
    for (const c of cards) {
      if (!c.agent || RESOLVED.includes(c.status)) continue;
      const raw = c.lob || c.agent.lob || "—";
      const key = norm(raw);
      if (!flaggedByLob[key]) flaggedByLob[key] = [];
      flaggedByLob[key].push(c);
      if (!display[key]) display[key] = raw;
    }
    const metaByKey: Record<string, LOBHealth> = {};
    for (const l of lobData) metaByKey[norm(l.lob)] = l;
    const keys = Array.from(new Set([...Object.keys(metaByKey), ...Object.keys(flaggedByLob)]));
    return keys
      .map((key) => {
        const meta = metaByKey[key];
        const flagged = (flaggedByLob[key] || [])
          .slice()
          .sort((a, b) => HEAT[b.severity].rank - HEAT[a.severity].rank);
        const flaggedNames = new Set(flagged.map((c) => c.agent?.name));
        // Calm = sampled queue agents not already flagged (honest proxy until the
        // live census gives us the full roster).
        const calmCount = meta ? meta.queueDetails.filter((q) => !flaggedNames.has(q.agentName)).length : 0;
        return { lob: meta ? meta.lob : display[key] || key, meta, flagged, calmCount };
      })
      .sort((a, b) => b.flagged.length - a.flagged.length || a.lob.localeCompare(b.lob));
  }, [cards, lobData]);

  return (
    <section className="floor-view" data-testid="floor-view">
      <div className="floor-view__head">
        <span className="floor-view__title">Floor View</span>
        <span className="floor-view__legend">
          <i className="floor-dot floor-dot--calm" /> in adherence ·{" "}
          <i className="floor-dot floor-dot--heat" /> out (brightness = severity) · click to open the card
        </span>
      </div>

      <div className="floor-view__grid">
        {neighbourhoods.map((n) => (
          <div key={n.lob} className={`floor-hood${n.flagged.length >= 3 ? " floor-hood--hot" : ""}`}>
            <div className="floor-hood__head">
              <span className="floor-hood__name">{n.lob}</span>
              {n.meta && (
                <span
                  className={`floor-hood__health floor-hood__health--${n.meta.lineHealthCode.toLowerCase()}`}
                  title={`Line health: ${n.meta.lineHealthCode}`}
                />
              )}
            </div>

            <div className="floor-hood__floor">
              {n.flagged.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="floor-avatar"
                  data-severity={c.severity}
                  style={{ background: HEAT[c.severity].color, boxShadow: `0 0 8px 2px ${HEAT[c.severity].glow}` }}
                  title={`${c.agent?.name ?? "agent"} — ${c.agent?.currentStatus ?? ""} (scheduled ${
                    c.agent?.scheduledActivity ?? "?"
                  }) · click to open the card`}
                  onClick={() => onAgentClick(c.id)}
                />
              ))}
              {Array.from({ length: Math.min(n.calmCount, 40) }).map((_, i) => (
                <span key={i} className="floor-dot floor-dot--calm" title="in adherence" />
              ))}
            </div>

            <div className="floor-hood__foot">
              <b>{n.flagged.length}</b> out
              {n.meta ? (
                <>
                  {" · "}
                  {n.calmCount} calm <span className="floor-hood__sample">(sampled)</span>
                </>
              ) : (
                <> · roster pending live census</>
              )}
            </div>
          </div>
        ))}

        {neighbourhoods.length === 0 && (
          <div className="floor-view__empty">
            No floor data yet — capture a live Verint day (the RTA Live Bridge feeds this).
          </div>
        )}
      </div>
    </section>
  );
}
