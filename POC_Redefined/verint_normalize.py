"""
verint_normalize.py
--------------------
Deterministic, side-effect-free normalization of raw rows extracted from the
live Verint ADHERENCE -> Quick View grid into the engine's AgentRow contract.

Confirmed live grid columns (Tracking -> ADHERENCE -> Quick View):
    Name | Scheduled Activity | Out Of Adherence | Actual Activity |
    Time In Activity | Day's Adherence

Design notes (see POC_Redefined/Computer_Use_Plan_0603.md):
  * D6 (triage, not re-detect): we do NOT remap activity names to CIBC canonical
    statuses. The LOB-custom activity names (e.g. "Zillow_Break 2") flow through
    verbatim into the card/message text. Verint's own "Out Of Adherence" verdict
    is the detection signal.
  * The alert-relevant duration is Verint's OOA duration, so
    AgentRow.duration_seconds = parse_duration(out_of_adherence_text). A row that
    is in adherence has a blank/zero OOA column and parses to 0 -> triage skips.
  * LOB comes from the selected View / config (OCR baseline proved LOB is not
    recoverable from the row itself). GEO comes from config.

No network, no LLM, no file I/O. Pure functions, fully unit-testable.
"""

from __future__ import annotations

import hashlib
import re
from typing import Iterable

from _engine_bridge import AgentRow

# Keys expected on a raw extracted row (all values are display strings).
RAW_KEYS = (
    "name",
    "scheduled_activity",
    "out_of_adherence",
    "actual_activity",
    "time_in_activity",
    "days_adherence",
)


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def parse_duration(text: str | None) -> int:
    """
    Parse a Verint duration string into whole seconds.

    Accepts the live grid's colon formats:
        "H:MM:SS"  -> hours:minutes:seconds   (e.g. "0:11:07" -> 667)
        "MM:SS"    -> minutes:seconds         (e.g. "11:07"   -> 667)
    A blank/None value -> 0 (agent is in adherence; nothing to flag).
    A bare integer is treated as seconds.

    Raises ValueError on anything that is non-empty but unparseable, so bad
    extraction is loud rather than silently producing a 0-second alert.
    """
    if text is None:
        return 0
    s = text.strip()
    if not s:
        return 0

    if ":" in s:
        parts = s.split(":")
        if not all(p.strip().isdigit() for p in parts) or len(parts) > 3:
            raise ValueError(f"Unparseable duration: {text!r}")
        nums = [int(p) for p in parts]
        # Pad left to [hours, minutes, seconds].
        while len(nums) < 3:
            nums.insert(0, 0)
        hours, minutes, seconds = nums
        return hours * 3600 + minutes * 60 + seconds

    if s.isdigit():
        return int(s)

    raise ValueError(f"Unparseable duration: {text!r}")


def parse_pct(text: str | None) -> float:
    """
    Parse a percentage string into a float.

        "78%" -> 78.0 ; " 78 % " -> 78.0 ; "100" -> 100.0
    Blank/None -> 0.0.
    """
    if text is None:
        return 0.0
    s = text.strip().rstrip("%").strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError as exc:
        raise ValueError(f"Unparseable percentage: {text!r}") from exc


def stable_agent_id(agent_name: str, lob: str, geo: str) -> str:
    """
    Deterministic agent id from name + LOB + GEO.

    Verint's grid does not expose a stable internal id in the Quick View, so we
    derive one. Same (name, lob, geo) always yields the same id across runs,
    which lets persistence/escalation tracking work between refresh cycles.
    """
    key = f"{agent_name.strip().lower()}:{lob.strip().lower()}:{geo.strip().lower()}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Row mapping
# ---------------------------------------------------------------------------

def to_agent_row(raw: dict, lob: str, geo: str) -> AgentRow:
    """
    Map one raw grid row into an AgentRow.

    `raw` is a dict with the keys in RAW_KEYS (missing keys default to "").
    `lob` / `geo` are injected from the selected View / config (not the row).
    """
    name = (raw.get("name") or "").strip()
    if not name:
        raise ValueError(f"Raw row missing agent name: {raw!r}")

    return AgentRow(
        agent_id=stable_agent_id(name, lob, geo),
        agent_name=name,
        lob=lob,
        geo=geo,
        # Verbatim, LOB-custom activity names (D6 — no canonical remap).
        actual_status=(raw.get("actual_activity") or "").strip(),
        scheduled_activity=(raw.get("scheduled_activity") or "").strip(),
        # Alert-relevant duration is Verint's OOA duration.
        duration_seconds=parse_duration(raw.get("out_of_adherence")),
        adherence_pct=parse_pct(raw.get("days_adherence")),
    )


def to_agent_rows(raws: Iterable[dict], lob: str, geo: str) -> list[AgentRow]:
    """Map a batch of raw grid rows into AgentRow objects."""
    return [to_agent_row(raw, lob, geo) for raw in raws]
