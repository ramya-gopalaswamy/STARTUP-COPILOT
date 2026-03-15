from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class VentureDNA(BaseModel):
    """Extracted from document (Nova 2 Pro) or loaded from mocks. Same shape for both paths."""
    problem: Optional[str] = None
    solution: Optional[str] = None
    target_market: Dict[str, Any] = Field(default_factory=dict)
    financials: Dict[str, Any] = Field(default_factory=dict)
    founder_name: Optional[str] = None
    startup_name: Optional[str] = None


class AgentStatus(str, Enum):
    IDLE = "IDLE"
    SYNCING = "SYNCING"
    COMPLETE = "COMPLETE"


class MarketIntelSource(BaseModel):
    """One citation from web grounding (url, domain, title)."""
    url: Optional[str] = None
    domain: Optional[str] = None
    title: Optional[str] = None


class MarketIntelFollowUp(BaseModel):
    """One Q&A from a follow-up question over the report."""
    question: str
    answer: str


class MarketIntelState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    last_message: Optional[str] = None
    competitor: Optional[str] = None
    market_gap: Optional[str] = None
    summary: Optional[str] = None
    report_text: Optional[str] = None
    market_share_data: List[Dict[str, Any]] = Field(default_factory=list)
    opportunity_gap_data: List[Dict[str, Any]] = Field(default_factory=list)
    trend_data: List[Dict[str, Any]] = Field(default_factory=list)
    pie_colors: List[str] = Field(default_factory=list)
    sources: List[Dict[str, Any]] = Field(default_factory=list)  # [{url?, domain?, title?}] from web grounding
    follow_up_answers: List[Dict[str, str]] = Field(default_factory=list)  # [{question, answer}]
    source: Optional[str] = None  # "nova" | "mock" — when DEMO_MARKET true we never expose "mock" to the client


class AssetForgeState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    last_message: Optional[str] = None
    narrative_flow: Optional[str] = None
    context_inherited: bool = False
    golden_thread: Optional[str] = None
    narrative_chapters: Dict[str, str] = Field(default_factory=dict)
    assets: List[Dict[str, Any]] = Field(default_factory=list)
    # After chat-edit with image: which stored filename is on which slide (for UI preview)
    embedded_slide_images: Optional[Dict[str, str]] = None  # slide_id -> stored filename
    # Font/color/background overrides from chat (e.g. title_font_size_pt, bullet_color_hex, content_slide_bg_hex)
    style_overrides: Optional[Dict[str, Any]] = None


class VCPartner(BaseModel):
    name: str
    role: Optional[str] = None
    focus: Optional[str] = None
    notable_investments: Optional[str] = None


class VCScoutPin(BaseModel):
    name: str
    region: str
    lat: float
    lng: float
    # Enriched fields for VC Scout cards
    stage_focus: Optional[str] = None  # e.g. "Seed, Series A"
    sector_focus: Optional[str] = None  # e.g. "Fintech, SaaS"
    check_size: Optional[str] = None  # e.g. "$1–5M"
    website: Optional[str] = None
    contact_url: Optional[str] = None
    match_score: Optional[float] = None  # 0–100 compatibility
    compatibility_summary: Optional[str] = None  # 2–3 sentences why this VC fits the venture
    partners: list[VCPartner] = Field(default_factory=list)


class VCScoutState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    last_message: Optional[str] = None
    pins: list[VCScoutPin] = Field(default_factory=list)


class CodeLabState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    last_message: Optional[str] = None
    scaffold_summary: Optional[str] = None
    generated_file_paths: list[str] = Field(default_factory=list)


class FinanceAuditorPoint(BaseModel):
    month: str
    burn: float
    runway_months: float


class FinanceAuditorState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    last_message: Optional[str] = None
    series: list[FinanceAuditorPoint] = Field(default_factory=list)


class SharkPersonaMessage(BaseModel):
    shark_id: str
    display_name: str
    role: str
    color: str
    text: str
    is_barge_in: bool = False


class VirtualTankMetrics(BaseModel):
    filler_count: int = 0
    user_utterances: list[str] = Field(default_factory=list)
    clarity_score: Optional[float] = None
    clarity_notes: Optional[str] = None
    confidence_score: Optional[float] = None


class SharkVerdict(BaseModel):
    shark_id: str
    display_name: str
    verdict: str  # "IN" or "OUT"
    detail: str
    feedback: str = ""


class VirtualTankState(BaseModel):
    active: bool = False
    last_messages: list[SharkPersonaMessage] = Field(default_factory=list)
    fundability_score: Optional[float] = None
    metrics: VirtualTankMetrics = Field(default_factory=VirtualTankMetrics)
    verdicts: list[SharkVerdict] = Field(default_factory=list)
    founder_name: Optional[str] = None


class SharedWorkspace(BaseModel):
    idea_parsed: bool = False
    market_gap: Optional[str] = None
    pitch_deck_status: str = "NotStarted"
    fundability_score: Optional[float] = None
    workspace_id: Optional[str] = None  # mission_graph id when DB + Phase 3 ingest
    context_inherited: bool = False

    market_intel: MarketIntelState = Field(default_factory=MarketIntelState)
    asset_forge: AssetForgeState = Field(default_factory=AssetForgeState)
    vc_scout: VCScoutState = Field(default_factory=VCScoutState)
    code_lab: CodeLabState = Field(default_factory=CodeLabState)
    finance_auditor: FinanceAuditorState = Field(
        default_factory=FinanceAuditorState
    )
    virtual_tank: VirtualTankState = Field(default_factory=VirtualTankState)

