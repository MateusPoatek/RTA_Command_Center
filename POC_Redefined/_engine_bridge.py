"""
_engine_bridge.py
-----------------
Bridge to the existing CIBC RTA simulation engine package.

The engine lives at POC/07_simulation/engine. Its parent directory name
('07_simulation') is not a valid Python identifier, so we add the parent to
sys.path and import the `engine` package by name. engine/__init__.py is empty,
so this import has NO side effects (alert_formatter's JSON load is not
triggered), and the AgentRow / AlertResult classes re-exported here are the
*same* class objects that POC/07_simulation/engine/card_builder.py imports.

That identity matters: when the live path later calls build_card() with an
AlertResult produced by verint_triage, it will be the exact class build_card
expects — no duck-typing surprises.

Path resolution is anchored to this file, so it works from any cwd.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ENGINE_PARENT = Path(__file__).resolve().parent.parent / "POC" / "07_simulation"

if not (_ENGINE_PARENT / "engine" / "alert_engine.py").exists():  # pragma: no cover
    raise ImportError(
        f"Could not locate the simulation engine at {_ENGINE_PARENT / 'engine'}. "
        "Expected POC/07_simulation/engine/alert_engine.py relative to the repo root."
    )

if str(_ENGINE_PARENT) not in sys.path:
    sys.path.insert(0, str(_ENGINE_PARENT))

from engine.alert_engine import AgentRow, AlertResult  # noqa: E402

__all__ = ["AgentRow", "AlertResult"]
