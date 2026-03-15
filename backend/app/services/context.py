"""
Phase 4: Venture context for orbs. RAG-style context from mission_graph or state.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from ..db import get_mission_graph, is_configured
from ..schemas import SharedWorkspace

LOG = logging.getLogger(__name__)

_MOCK_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "mocks" / "analyze_document_latest.json"


def _append_venture_dna(parts: list[str], vd: dict, founder_name: str | None) -> str | None:
    """Append VentureDNA fields to parts list. Returns startup_name if found."""
    startup_name = None
    if not founder_name and vd.get("founder_name"):
        founder_name = vd["founder_name"]
    if vd.get("startup_name"):
        startup_name = vd["startup_name"]
    if founder_name:
        parts.append(f"Founder name: {founder_name}")
    if startup_name:
        parts.append(f"Startup name: {startup_name}")
    if vd.get("problem"):
        parts.append(f"Problem: {vd['problem']}")
    if vd.get("solution"):
        parts.append(f"Solution: {vd['solution']}")
    if vd.get("target_market"):
        tm = vd["target_market"]
        if isinstance(tm, dict):
            for key in ("summary", "segment", "size"):
                if tm.get(key):
                    parts.append(f"Target market ({key}): {tm[key]}")
        else:
            parts.append(f"Target market: {tm}")
    if vd.get("financials"):
        fin = vd["financials"]
        if isinstance(fin, dict):
            fin_items = []
            for key in ("stage", "revenue", "burn", "runway"):
                if fin.get(key) and fin[key] != "Not specified":
                    fin_items.append(f"{key}={fin[key]}")
            if fin_items:
                parts.append(f"Financials: {', '.join(fin_items)}")
        else:
            parts.append(f"Financials: {fin}")
    return startup_name


async def get_venture_context(state: SharedWorkspace, founder_name_override: str | None = None) -> str:
    """
    Return a text summary of the venture for orb prompts. Uses mission_graph when
    workspace_id is set and DB is configured; falls back to VentureDNA mock file
    and state fields.
    """
    founder_name = founder_name_override or state.virtual_tank.founder_name
    parts: list[str] = []

    # Priority 1: mission_graph DB
    if state.workspace_id and is_configured():
        row = await get_mission_graph(state.workspace_id)
        if row:
            if not founder_name and row.get("founder_name"):
                founder_name = row["founder_name"]
            vd = row.get("venture_dna") or {}
            _append_venture_dna(parts, vd, founder_name)
            if parts:
                return "\n".join(parts)

    # Priority 2: VentureDNA from the last ingest (mock/cache file)
    if _MOCK_PATH.exists():
        try:
            vd = json.loads(_MOCK_PATH.read_text())
            _append_venture_dna(parts, vd, founder_name)
        except Exception as e:
            LOG.warning("Failed to read VentureDNA cache: %s", e)

    # Priority 3: state-level fields
    if not parts:
        if founder_name:
            parts.append(f"Founder name: {founder_name}")
    if state.market_gap:
        parts.append(f"Market gap / focus: {state.market_gap}")
    if state.fundability_score is not None:
        parts.append(f"Fundability score: {state.fundability_score}")

    mi = state.market_intel
    if mi.summary:
        parts.append(f"Market intelligence summary: {mi.summary}")
    if mi.report_text:
        parts.append(f"Market intelligence report:\n{mi.report_text[:6000]}")
    elif mi.market_gap:
        parts.append(f"Market gap (intel): {mi.market_gap}")
    if mi.competitor:
        parts.append(f"Key competitor: {mi.competitor}")

    return "\n".join(parts) if parts else "No venture context yet. Upload a pitch deck or one-pager first."
