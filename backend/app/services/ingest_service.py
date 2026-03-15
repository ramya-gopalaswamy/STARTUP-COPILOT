"""
Ingest service: analyze_document with toggle-to-mock. Real path uses Nova 2 Pro
(Phase 3): extract text → Venture DNA → embedding → mission_graph when DB set.
Mock path loads from analyze_document_latest.json.
"""
from __future__ import annotations

from ..config import DEMO_INGEST
from ..db import insert_mission_graph, is_configured
from ..schemas import AgentStatus, SharedWorkspace, VentureDNA
from ..storage import load_state, save_state
from .document_extract import extract_text
from .mock_storage import load_mock_response, save_mock_response
from .nova_ingest import extract_venture_dna_from_text, get_embedding


def _venture_dna_to_shared_workspace(
    venture_dna: VentureDNA,
    existing: SharedWorkspace,
) -> SharedWorkspace:
    """Build SharedWorkspace from Venture DNA. Same logic for real and mock paths."""
    state = existing.model_copy(deep=True)
    state.idea_parsed = True
    state.market_gap = venture_dna.problem or venture_dna.target_market.get("summary") or "4000m Depth Drones"
    state.pitch_deck_status = "InProgress"
    state.context_inherited = True

    state.market_intel.status = AgentStatus.COMPLETE
    state.market_intel.last_message = (
        "Document parsed. Mission Graph initialized: "
        "Scoping 4,000m Depth Moat."
    )
    state.market_intel.market_gap = state.market_gap

    state.asset_forge.status = AgentStatus.SYNCING
    state.asset_forge.last_message = (
        "Generating Bioluminescent Infographics... Narrative Flow synced."
    )
    state.asset_forge.context_inherited = True

    return state


def _placeholder_venture_dna(filename: str) -> VentureDNA:
    """Fallback when extraction or Nova fails (e.g. empty file, no AWS)."""
    return VentureDNA(
        problem="4000m Depth Drones",
        solution="Deep-sea exploration and data capture.",
        target_market={"summary": "4000m Depth Drones", "segment": "Marine tech"},
        financials={"stage": "early", "burn": None},
    )


def _venture_dna_to_embedding_text(venture_dna: VentureDNA) -> str:
    """Concatenate Venture DNA fields for embedding (same as stored concept)."""
    parts = [
        venture_dna.problem or "",
        venture_dna.solution or "",
        str(venture_dna.target_market or {}),
        str(venture_dna.financials or {}),
    ]
    return " ".join(p for p in parts if p).strip() or "(no content)"


def _health_score_from_venture_dna(venture_dna: VentureDNA) -> float:
    """Simple 0–100 fundability/health score from Venture DNA completeness."""
    score = 50.0
    if venture_dna.problem and venture_dna.problem.strip():
        score += 10.0
    if venture_dna.solution and venture_dna.solution.strip():
        score += 10.0
    if venture_dna.target_market and isinstance(venture_dna.target_market, dict):
        if venture_dna.target_market.get("summary") or venture_dna.target_market.get("segment"):
            score += 15.0
    if venture_dna.financials and isinstance(venture_dna.financials, dict):
        if any(venture_dna.financials.get(k) for k in ("stage", "burn", "runway", "revenue")):
            score += 15.0
    return min(100.0, score)


async def analyze_document(file: bytes, filename: str) -> SharedWorkspace:
    """
    Analyze uploaded document: real path (DEMO_INGEST true) calls Bedrock and saves
    response to mocks; mock path loads from mocks. Both paths produce the same
    SharedWorkspace so the frontend never breaks.
    """
    existing = await load_state()

    if DEMO_INGEST:
        # Real path: extract text → Nova 2 Pro Venture DNA → embedding → mission_graph.
        document_text = extract_text(file, filename)
        venture_dna = (
            extract_venture_dna_from_text(document_text)
            if document_text.strip()
            else _placeholder_venture_dna(filename)
        )
        save_mock_response("analyze_document", venture_dna.model_dump())

        workspace_id = None
        if is_configured():
            embedding_text = _venture_dna_to_embedding_text(venture_dna)
            embedding = get_embedding(embedding_text, dimension=1024)
            founder_name = venture_dna.founder_name
            if embedding:
                workspace_id = await insert_mission_graph(
                    founder_name, venture_dna.model_dump(), embedding
                )

        state = _venture_dna_to_shared_workspace(venture_dna, existing)
        state.fundability_score = _health_score_from_venture_dna(venture_dna)
        if workspace_id is not None:
            state.workspace_id = str(workspace_id)
    else:
        # Mock path: load from file, no AWS.
        data = load_mock_response("analyze_document")
        venture_dna = VentureDNA.model_validate(data)
        state = _venture_dna_to_shared_workspace(venture_dna, existing)

    await save_state(state)
    return state
