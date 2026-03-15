"""
Phase 4: Specialist orb agency. Real path = Nova + RAG context; mock path = load from mocks.
Each orb: get_venture_context -> prompt -> Converse/Pro -> update state -> save mock or load mock.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import zipfile
from pathlib import Path

from ..config import (
    ALLOW_WEB_GROUNDING,
    DEMO_ASSET_FORGE,
    DEMO_CODE_LAB,
    DEMO_FINANCE,
    DEMO_MARKET,
    DEMO_VC_SCOUT,
    USE_CUSTOM_WEB_SEARCH,
)
from ..schemas import (
    AgentStatus,
    FinanceAuditorPoint,
    SharedWorkspace,
    VCScoutPin,
)
from ..storage import load_state, save_state
from ..tools import get_design_skill_content
from .context import get_venture_context
from .mock_storage import load_mock_response, save_mock_response
from .nova_converse import (
    converse,
    converse_multi_turn,
    converse_research_stream,
    converse_stream_chunks,
    converse_with_citations,
)
from .nova_tools import converse_with_web_search_tool

LOG = logging.getLogger(__name__)

# --- Market Intelligence (Nova Lite + RAG) ---

# Phase 1: Web-grounded research — gather current facts, competitors, numbers (used for deeper reports).
MARKET_RESEARCH_GATHER = """You are a market research analyst. You MUST use the web_search tool to do proper research. Your ONLY job is to gather current, factual research — do NOT write a final report yet.

You MUST call web_search multiple times to cover different angles. Do at least 4–6 distinct searches, for example:
1. Market size and growth: e.g. "[industry/segment] market size 2024" or "global [category] market value".
2. Competitors: e.g. "[segment] top companies" or "[industry] market share leaders".
3. Recent trends: e.g. "[industry] trends 2024" or "[segment] growth statistics".
4. Gaps and opportunity: e.g. "[niche] underserved" or "[segment] demand vs supply".
5. Optional: specific stats, reports, or regional data as needed.

For each web_search call use a clear, specific query. Request 8–10 results per search (num_results: 8) to get good coverage. After you have enough search results, synthesize a concise "research brief" with: key facts, competitor names, numbers, and source hints. Be specific and factual. If the context is generic, still run 4+ searches on "technology and startup market trends", "SMB software market", etc."""

# Phase 2: Synthesize the full report from venture context + research brief (no web call needed).
MARKET_SYSTEM = """You are a market intelligence analyst. You will receive (1) venture context and (2) a research brief from a prior web-grounded search. Use that research to write a detailed, factual market intelligence report. Do not make up statistics — use the numbers and names from the research brief. If something is missing, say "estimates suggest" or keep that section brief.

Structure your response as follows:

**Executive Summary** (2–4 sentences): market gap, key opportunity, and one main recommendation. This section will be shown prominently—make it substantive and specific.

**Market Gap & Opportunity**: 1–2 short paragraphs on the addressable gap and why it matters.

**Competitors**: 1 paragraph on relevant competitors or alternatives and their share/positioning (use names and numbers from the research brief).

**Recommendations**: 2–4 bullet points with specific, actionable recommendations.

At the very end of your response, after all narrative, add a single JSON block so we can render charts. Use this exact format (replace with research-based numbers and labels; use hex colors for fill):

```json
{"market_share_data":[{"name":"Competitor or segment name","share":25,"fill":"#00FFE5"}],"opportunity_gap_data":[{"segment":"Segment name","gap":70,"demand":85}],"trend_data":[{"month":"Jan","market":62,"competitors":58}],"pie_colors":["#00FFE5","#7523FF","#FF8100"]}
```

Include 4–5 items in market_share_data (share must sum to 100), 4–6 in opportunity_gap_data (gap and demand 0–100), and 6 months in trend_data. Use clear section headings for the narrative. Do not put any text after the JSON block."""

# Follow-up Q&A over the report (multi-turn).
MARKET_FOLLOW_UP_SYSTEM = """You are a market intelligence analyst. The conversation below includes a market report you produced. Answer the user's follow-up question based on that report. Be concise and specific. If the question goes beyond the report, say so and give a brief informed view if possible. Do not make up statistics not in the report."""


def _run_market_intel_single_shot(state: SharedWorkspace, context: str) -> tuple[str | None, list]:
    """One-shot path: single Converse call with optional web grounding. Returns (report text, sources)."""
    user = f"Venture context:\n{context}" if context.strip() else "No venture context yet. Write a short, generic market intelligence report (2–3 paragraphs) on technology and startup market trends, with an executive summary and 2–3 recommendations."
    text, sources = converse_with_citations(
        MARKET_SYSTEM,
        user,
        model_key="market",
        max_tokens=2048,
        enable_web_grounding=True,
    )
    if not text:
        text = converse(
            MARKET_SYSTEM,
            user,
            model_key="market",
            max_tokens=2048,
            enable_web_grounding=False,
        )
        sources = []
    return text, sources


def _run_market_intel_deep_research(state: SharedWorkspace, context: str) -> tuple[str | None, list]:
    """Two-phase deep research: (1) web-grounded gather, (2) synthesize report. Returns (report text, sources from phase 1)."""
    user_gather = f"Venture context:\n{context}" if context.strip() else "Company focus: technology and startup market trends. Gather current market data and competitor insights."
    research_brief, sources = converse_with_citations(
        MARKET_RESEARCH_GATHER,
        user_gather,
        model_key="market",
        max_tokens=2048,
        enable_web_grounding=True,
    )
    if not research_brief:
        research_brief = converse(
            MARKET_RESEARCH_GATHER,
            user_gather,
            model_key="market",
            max_tokens=2048,
            enable_web_grounding=False,
        )
        sources = []
    if not research_brief:
        return None, []
    user_synth = f"""Venture context:
{context}

Research brief (use these facts and numbers in your report):
{research_brief.strip()}"""
    text = converse(
        MARKET_SYSTEM,
        user_synth,
        model_key="market",
        max_tokens=2048,
        enable_web_grounding=False,
    )
    return text, sources


async def run_market_intel() -> SharedWorkspace:
    state = await load_state()
    state.market_intel.status = AgentStatus.SYNCING
    await save_state(state)

    if DEMO_MARKET:
        print("[Market Intel] DEMO_MARKET=True -> deep research (2-phase Nova)...", flush=True)
        LOG.info("Market Intel: DEMO_MARKET=true, using two-phase deep research")
        context = await get_venture_context(state)
        # Two-phase: (1) web-grounded research gather, (2) synthesize report from brief
        text, sources = _run_market_intel_deep_research(state, context)
        if not text:
            print("[Market Intel] Deep research failed, falling back to single-shot...", flush=True)
            LOG.warning("Market Intel: deep research returned nothing, trying single-shot")
            text, sources = _run_market_intel_single_shot(state, context)
        if text:
            _apply_market_intel_result(state, text.strip(), sources=sources)
            save_mock_response("run_market_intel", _market_intel_mock_payload(state))
            print(f"[Market Intel] Nova OK -> summary len={len(state.market_intel.summary or '')}", flush=True)
            LOG.info(
                "Market Intel: Nova result applied, summary len=%d",
                len(state.market_intel.summary or ""),
            )
        else:
            print("[Market Intel] Nova returned NO TEXT -> using default (check AWS credentials/region)", flush=True)
            LOG.warning("Market Intel: Nova returned no text, applying default")
            _apply_market_intel_default(state)
    else:
        print("[Market Intel] DEMO_MARKET=False -> loading from mock file", flush=True)
        LOG.info("Market Intel: DEMO_MARKET=false, loading from mock")
        try:
            data = load_mock_response("run_market_intel")
            state.market_intel.last_message = data.get("last_message") or "I found a gap in 4000m depth drones. Pivot suggested."
            state.market_intel.market_gap = data.get("market_gap") or state.market_gap or "4000m Depth Drones"
            state.market_intel.summary = data.get("summary") or state.market_intel.last_message
            state.market_intel.report_text = data.get("report_text") or _report_text_from_nova(state.market_intel.last_message or "")
            if data.get("market_share_data"):
                state.market_intel.market_share_data = data["market_share_data"]
            if data.get("opportunity_gap_data"):
                state.market_intel.opportunity_gap_data = data["opportunity_gap_data"]
            if data.get("trend_data"):
                state.market_intel.trend_data = data["trend_data"]
            if data.get("pie_colors"):
                state.market_intel.pie_colors = data["pie_colors"]
            if data.get("sources"):
                state.market_intel.sources = [s for s in data["sources"] if isinstance(s, dict)]
            if data.get("follow_up_answers"):
                state.market_intel.follow_up_answers = [a for a in data["follow_up_answers"] if isinstance(a, dict) and "question" in a and "answer" in a]
            state.market_intel.status = AgentStatus.COMPLETE
            state.market_intel.source = "mock"
        except FileNotFoundError:
            _apply_market_intel_default(state)

    state.asset_forge.context_inherited = True
    state.context_inherited = True
    await save_state(state)
    return _mask_mock_market_intel(state)


def _mask_mock_market_intel(state: SharedWorkspace) -> SharedWorkspace:
    """When DEMO_MARKET is true, never expose mock-sourced market intel to the client. Return state (or a copy with market_intel cleared)."""
    if not DEMO_MARKET:
        return state
    if getattr(state.market_intel, "source", None) != "mock":
        return state
    out = state.model_copy(deep=True)
    out.market_intel.status = AgentStatus.IDLE
    out.market_intel.last_message = None
    out.market_intel.summary = None
    out.market_intel.report_text = None
    out.market_intel.market_share_data = []
    out.market_intel.opportunity_gap_data = []
    out.market_intel.trend_data = []
    out.market_intel.pie_colors = []
    out.market_intel.sources = []
    out.market_intel.follow_up_answers = []
    out.market_intel.source = None
    return out


def mask_mock_market_intel_for_api(state: SharedWorkspace) -> SharedWorkspace:
    """Public alias for GET /state: when Nova is used (DEMO_MARKET true), never return mock market intel."""
    return _mask_mock_market_intel(state)


async def run_market_intel_follow_up(question: str) -> SharedWorkspace:
    """Answer a follow-up question over the current market report using multi-turn Converse."""
    state = await load_state()
    question = (question or "").strip()
    if not question:
        return state
    report = state.market_intel.report_text or state.market_intel.last_message or state.market_intel.summary or ""
    if not report.strip():
        # No report yet: append a placeholder
        if not state.market_intel.follow_up_answers:
            state.market_intel.follow_up_answers = []
        state.market_intel.follow_up_answers.append({
            "question": question,
            "answer": "Generate a market report first, then you can ask follow-up questions.",
        })
        await save_state(state)
        return state
    messages = [
        {"role": "user", "content": [{"text": "The following is the market intelligence report."}]},
        {"role": "assistant", "content": [{"text": report[:28000]}]},
        {"role": "user", "content": [{"text": question[:2000]}]},
    ]
    answer = None
    if DEMO_MARKET:
        answer = converse_multi_turn(
            MARKET_FOLLOW_UP_SYSTEM,
            messages,
            model_key="market",
            max_tokens=1024,
            temperature=0.3,
            enable_web_grounding=bool(ALLOW_WEB_GROUNDING),
        )
    if not answer:
        answer = (
            "I couldn't generate an answer for that. Try rephrasing or ask about something in the report."
            if DEMO_MARKET
            else "Follow-up Q&A uses Nova when DEMO_MARKET is true. With mock data this is a placeholder."
        )
    if not state.market_intel.follow_up_answers:
        state.market_intel.follow_up_answers = []
    state.market_intel.follow_up_answers.append({"question": question, "answer": answer.strip()})
    await save_state(state)
    return _mask_mock_market_intel(state)


async def clear_market_intel_follow_ups() -> SharedWorkspace:
    """Clear follow-up Q&As so they are not shown when the user returns to the page."""
    state = await load_state()
    state.market_intel.follow_up_answers = []
    await save_state(state)
    return _mask_mock_market_intel(state)


def _sse_message(event: str, data: str) -> str:
    """Format one SSE message. Data can contain newlines (sent as multiple data: lines)."""
    lines = data.replace("\r", "").split("\n")
    data_part = "\n".join(f"data: {line}" for line in lines)
    return f"event: {event}\n{data_part}\n\n"


async def run_market_intel_stream():
    """
    Async generator yielding SSE messages for market intel: phase (researching | synthesizing), token (chunk), done (state JSON).
    Runs phase 1 (research) then streams phase 2 (synthesize) via ConverseStream.
    """
    state = await load_state()
    state.market_intel.status = AgentStatus.SYNCING
    await save_state(state)

    try:
        context = await get_venture_context(state)
    except Exception as e:
        LOG.warning("Market Intel stream: get_venture_context failed: %s", e)
        yield _sse_message("error", str(e))
        return

    if not DEMO_MARKET:
        try:
            data = load_mock_response("run_market_intel")
            state.market_intel.last_message = data.get("last_message") or "I found a gap in 4000m depth drones. Pivot suggested."
            state.market_intel.market_gap = data.get("market_gap") or state.market_gap or "4000m Depth Drones"
            state.market_intel.summary = data.get("summary") or state.market_intel.last_message
            state.market_intel.report_text = data.get("report_text") or _report_text_from_nova(state.market_intel.last_message or "")
            if data.get("market_share_data"):
                state.market_intel.market_share_data = data["market_share_data"]
            if data.get("opportunity_gap_data"):
                state.market_intel.opportunity_gap_data = data["opportunity_gap_data"]
            if data.get("trend_data"):
                state.market_intel.trend_data = data["trend_data"]
            if data.get("pie_colors"):
                state.market_intel.pie_colors = data["pie_colors"]
            if data.get("sources"):
                state.market_intel.sources = [s for s in data["sources"] if isinstance(s, dict)]
            if data.get("follow_up_answers"):
                state.market_intel.follow_up_answers = [a for a in data["follow_up_answers"] if isinstance(a, dict) and "question" in a and "answer" in a]
            state.market_intel.status = AgentStatus.COMPLETE
            state.market_intel.source = "mock"
        except FileNotFoundError:
            _apply_market_intel_default(state)
        state.asset_forge.context_inherited = True
        state.context_inherited = True
        await save_state(state)
        yield _sse_message("done", _mask_mock_market_intel(state).model_dump_json())
        return

    # Phase 1: research (streaming when web grounding on, else blocking)
    yield _sse_message("phase", "researching")
    research_brief = None
    sources: list = []

    if ALLOW_WEB_GROUNDING:
        research_queue: asyncio.Queue[dict | None] = asyncio.Queue()
        exc_holder_research: list[BaseException] = []

        def run_research_stream() -> None:
            try:
                user_research = (
                    f"Venture context:\n{context}"
                    if context.strip()
                    else "Company focus: technology and startup market trends. Gather current market data and competitor insights."
                )
                for step in converse_research_stream(
                    MARKET_RESEARCH_GATHER,
                    user_research,
                    model_key="market",
                    max_tokens=2048,
                    temperature=0.3,
                ):
                    loop.call_soon_threadsafe(research_queue.put_nowait, step)
                loop.call_soon_threadsafe(research_queue.put_nowait, None)
            except BaseException as e:
                exc_holder_research.append(e)
                loop.call_soon_threadsafe(research_queue.put_nowait, None)

        loop = asyncio.get_running_loop()
        thread = threading.Thread(target=run_research_stream, daemon=True)
        thread.start()
        while True:
            step = await research_queue.get()
            if step is None:
                break
            if exc_holder_research:
                yield _sse_message("error", str(exc_holder_research[0]))
                return
            yield _sse_message("research_step", json.dumps(step))
            if step.get("type") == "done":
                research_brief = step.get("research_brief")
                sources = step.get("sources") or []
    elif USE_CUSTOM_WEB_SEARCH:
        # Custom web_search tool: Nova invokes our tool; we run DuckDuckGo/SerpAPI and stream steps to UI.
        research_queue = asyncio.Queue()
        exc_holder_research: list[BaseException] = []
        loop = asyncio.get_running_loop()

        def run_custom_research() -> None:
            try:
                user_research = (
                    f"Venture context:\n{context}"
                    if context.strip()
                    else "Company focus: technology and startup market trends. Gather current market data and competitor insights."
                )

                def on_step(step: dict) -> None:
                    loop.call_soon_threadsafe(research_queue.put_nowait, step)

                brief, srcs = converse_with_web_search_tool(
                    MARKET_RESEARCH_GATHER,
                    user_research,
                    model_key="market",
                    max_tokens=2048,
                    temperature=0.3,
                    step_callback=on_step,
                )
                # Ensure "done" was sent (nova_tools sends it); then signal end
                loop.call_soon_threadsafe(research_queue.put_nowait, None)
            except BaseException as e:
                exc_holder_research.append(e)
                loop.call_soon_threadsafe(research_queue.put_nowait, None)

        thread = threading.Thread(target=run_custom_research, daemon=True)
        thread.start()
        while True:
            step = await research_queue.get()
            if step is None:
                break
            if exc_holder_research:
                yield _sse_message("error", str(exc_holder_research[0]))
                return
            yield _sse_message("research_step", json.dumps(step))
            if step.get("type") == "done":
                research_brief = step.get("research_brief")
                sources = step.get("sources") or []
        if exc_holder_research:
            yield _sse_message("error", str(exc_holder_research[0]))
            return
    else:
        research_brief, sources = await asyncio.to_thread(
            converse_with_citations,
            MARKET_RESEARCH_GATHER,
            f"Venture context:\n{context}" if context.strip() else "Company focus: technology and startup market trends. Gather current market data and competitor insights.",
            "market",
            2048,
            0.3,
            True,
        )
        if not research_brief:
            research_brief = await asyncio.to_thread(
                converse,
                MARKET_RESEARCH_GATHER,
                f"Venture context:\n{context}" if context.strip() else "Company focus: technology and startup market trends.",
                "market",
                2048,
                0.3,
                False,
            )
            sources = []

    if not research_brief:
        yield _sse_message("error", "Phase 1 returned no research brief")
        return

    user_synth = f"""Venture context:
{context}

Research brief (use these facts and numbers in your report):
{research_brief.strip()}"""

    # Phase 2: stream synthesize
    yield _sse_message("phase", "synthesizing")
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    exc_holder: list[BaseException] = []

    loop = asyncio.get_running_loop()

    def run_stream() -> None:
        try:
            for chunk in converse_stream_chunks(
                MARKET_SYSTEM,
                user_synth,
                model_key="market",
                max_tokens=2048,
                temperature=0.3,
            ):
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
            loop.call_soon_threadsafe(queue.put_nowait, None)
        except BaseException as e:
            exc_holder.append(e)
            loop.call_soon_threadsafe(queue.put_nowait, None)

    thread = threading.Thread(target=run_stream, daemon=True)
    thread.start()
    full_parts: list[str] = []
    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        if exc_holder:
            yield _sse_message("error", str(exc_holder[0]))
            return
        full_parts.append(chunk)
        yield _sse_message("token", chunk)

    full_text = "".join(full_parts).strip()
    if not full_text:
        yield _sse_message("error", "Phase 2 returned no text")
        return
    _apply_market_intel_result(state, full_text, sources=sources)
    save_mock_response("run_market_intel", _market_intel_mock_payload(state))
    state.asset_forge.context_inherited = True
    state.context_inherited = True
    await save_state(state)
    yield _sse_message("done", _mask_mock_market_intel(state).model_dump_json())
    LOG.info("Market Intel stream done: summary len=%d", len(state.market_intel.summary or ""))


async def run_market_intel_stream_bytes():
    """Async generator yielding UTF-8 bytes for SSE response."""
    async for msg in run_market_intel_stream():
        yield msg.encode("utf-8")


def _summary_from_report(full_report: str, max_chars: int = 1200) -> str:
    """Extract Executive Summary section for the page: content after the heading, not the heading itself."""
    s = full_report.strip()
    if not s:
        return s
    # Try to find "Executive Summary" (with optional markdown: ### or **) and take the following content
    for pattern in (
        r"(?i)(?:^|\n)\s*#+\s*Executive\s+Summary\s*\n+(.+?)(?=\n\s*#+|\n\s*\*\*|$)",
        r"(?i)(?:^|\n)\s*\*\*Executive\s+Summary\*\*\s*\n*(.+?)(?=\n\s*#+|\n\s*\*\*|$)",
        r"(?i)Executive\s+Summary\s*[:\.]?\s*\n+(.+?)(?=\n\s*#+|\n\s*\*\*|\n\n\n|$)",
    ):
        m = re.search(pattern, s, re.DOTALL)
        if m:
            summary = m.group(1).strip()
            summary = re.sub(r"^[#*\s]+", "", summary)
            if len(summary) > 20:
                return summary[:max_chars].strip() + ("..." if len(summary) > max_chars else "")
    # Fallback: first substantial paragraph (skip lines that are only markdown headers)
    lines = s.replace("\r\n", "\n").split("\n")
    chunk = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if chunk:
                return "\n".join(chunk)[:max_chars] + ("..." if len("\n".join(chunk)) > max_chars else "")
            continue
        if re.match(r"^#+\s", stripped) or re.match(r"^\*\*[^*]+\*\*\s*$", stripped):
            if chunk:
                return "\n".join(chunk)[:max_chars] + ("..." if len("\n".join(chunk)) > max_chars else "")
            continue
        chunk.append(line)
    return "\n".join(chunk)[:max_chars].strip() + ("..." if len("\n".join(chunk)) > max_chars else "") if chunk else s[:max_chars]


def _report_text_from_nova(full_report: str) -> str:
    """Formatted detailed report for download (Nova-generated)."""
    return (
        "Market Intelligence Report – Generated by Nova 2 Lite\n"
        "========================================================\n\n"
        f"{full_report}"
    )


def _parse_chart_json_from_report(full_report: str) -> dict:
    """Extract optional chart JSON from end of Nova response. Returns dict with lists or empty."""
    out = {}
    try:
        raw = None
        if "```json" in full_report:
            start = full_report.index("```json") + 7
            rest = full_report[start:]
            end = rest.find("```")
            raw = (rest[:end] if end >= 0 else rest).strip()
        if not raw or not raw.startswith("{"):
            return out
        data = json.loads(raw)
        if isinstance(data.get("market_share_data"), list) and len(data["market_share_data"]) > 0:
            out["market_share_data"] = data["market_share_data"]
        if isinstance(data.get("opportunity_gap_data"), list) and len(data["opportunity_gap_data"]) > 0:
            out["opportunity_gap_data"] = data["opportunity_gap_data"]
        if isinstance(data.get("trend_data"), list) and len(data["trend_data"]) > 0:
            out["trend_data"] = data["trend_data"]
        if isinstance(data.get("pie_colors"), list) and len(data["pie_colors"]) > 0:
            out["pie_colors"] = data["pie_colors"]
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        LOG.warning("Market Intel: could not parse chart JSON from Nova response: %s", e)
    return out


def _report_text_without_chart_json(full_report: str) -> str:
    """Remove trailing ```json ... ``` block so download report is narrative only."""
    if "```json" not in full_report:
        return full_report.strip()
    idx = full_report.index("```json")
    return full_report[:idx].strip()


def _apply_market_intel_result(
    state: SharedWorkspace,
    full_report: str,
    sources: list | None = None,
) -> None:
    """Set market_intel: summary, report_text, optional chart data, and web grounding sources."""
    state.market_intel.last_message = full_report
    state.market_intel.market_gap = state.market_gap or "From Nova analysis"
    state.market_intel.summary = _summary_from_report(full_report)
    state.market_intel.report_text = _report_text_from_nova(_report_text_without_chart_json(full_report))
    state.market_intel.status = AgentStatus.COMPLETE
    state.market_intel.source = "nova"
    if sources is not None:
        state.market_intel.sources = [s for s in sources if isinstance(s, dict)]
    charts = _parse_chart_json_from_report(full_report)
    if charts.get("market_share_data"):
        state.market_intel.market_share_data = charts["market_share_data"]
    if charts.get("opportunity_gap_data"):
        state.market_intel.opportunity_gap_data = charts["opportunity_gap_data"]
    if charts.get("trend_data"):
        state.market_intel.trend_data = charts["trend_data"]
    if charts.get("pie_colors"):
        state.market_intel.pie_colors = charts["pie_colors"]


def _market_intel_mock_payload(state: SharedWorkspace) -> dict:
    """Payload to save for mock reload (includes summary, report_text, chart data, sources)."""
    return {
        "last_message": state.market_intel.last_message,
        "market_gap": state.market_intel.market_gap,
        "summary": state.market_intel.summary,
        "report_text": state.market_intel.report_text,
        "market_share_data": state.market_intel.market_share_data,
        "opportunity_gap_data": state.market_intel.opportunity_gap_data,
        "trend_data": state.market_intel.trend_data,
        "pie_colors": state.market_intel.pie_colors,
        "sources": state.market_intel.sources,
        "follow_up_answers": state.market_intel.follow_up_answers,
    }


def _apply_market_intel_default(state: SharedWorkspace) -> None:
    state.market_intel.last_message = "I found a gap in 4000m depth drones. Pivot suggested."
    state.market_intel.market_gap = state.market_gap or "4000m Depth Drones"
    state.market_intel.summary = state.market_intel.last_message
    state.market_intel.report_text = _report_text_from_nova(state.market_intel.last_message)
    state.market_intel.status = AgentStatus.COMPLETE
    state.market_intel.source = "nova"


# --- VC Scout (Nova Lite + web_search) ---

VC_SCOUT_RESEARCH_SYSTEM = """You are a senior VC scout and research analyst. You have access to a custom web_search tool that can search the live web for funds, partners, theses, and portfolios.

You will ALWAYS be given a "Venture context" string as the user message. This context is the single source of truth about the specific startup the founder uploaded or described. It can include:
- Product and market description
- Target customer segment and geography
- Traction, stage (idea, pre-seed, seed, Series A, etc.)
- Desired or typical check size
- Any other constraints (e.g. only EU funds, climate-focused investors, B2B SaaS, etc.)

Goal:
- Using ONLY this venture context as your anchor, find real venture capital firms that are a strong fit for THIS startup.
- Do DEEP research using web_search (multiple queries) and synthesize a concise, structured shortlist.
- All matching logic (stage focus, sector, geography, check size) must be grounded in the venture context you received.

Research requirements:
- First, read the venture context carefully and infer:
  - Sector / vertical (e.g. fintech, AI infra, climate, vertical SaaS, deeptech robotics).
  - Preferred or likely funding stage (e.g. pre-seed, seed, Series A).
  - Geography preferences or constraints (e.g. US-only, EU-focus, global).
  - Approximate check size band if mentioned (e.g. "raising $1–3M seed" → $1–3M checks).
- Then use web_search at least 4–6 times:
  - Find top VCs and micro-VCs that actively invest in this startup's inferred sector and stage, and are comfortable with the geography and check size band.
  - For each candidate firm, read their website or public profiles to understand:
    - Stage focus (e.g. Seed, Series A, Seed–Series B)
    - Sector focus / thesis (e.g. Fintech, AI, Deep Tech, Climate, Vertical SaaS)
    - Typical check size (rough range or wording from the firm)
    - Contact / pitch link (or best contact URL)
  - Prefer funds with clear, current information.

Output format:
- Return ONLY a JSON object with this exact structure (no markdown, no commentary):

{
  "vcs": [
    {
      "name": "Firm name",
      "region": "City, Country or Region",
      "lat": 37.77,
      "lng": -122.41,
      "stage_focus": "Seed, Series A",
      "sector_focus": "Deep Tech, Ocean robotics",
      "check_size": "$1–5M",
      "website": "https://firm-website.com",
      "contact_url": "https://firm-website.com/contact-or-pitch",
      "match_score": 0–100,
      "compatibility_summary": "2–3 sentences explaining why this firm is a strong fit for THIS startup (stage, sector, geography, thesis)."
    }
  ]
}

Notes:
- Always include lat/lng (approximate if needed) for plotting on a map.
- match_score should be a number between 0 and 100 (higher = better fit) and must directly reflect how well the firm fits the specific startup context (stage, sector, geography, check size).
- compatibility_summary should mention exactly THREE key reasons this VC is a good match, woven into 2–3 concise sentences, and those reasons must reference concrete details from the venture context (e.g. "B2B climate SaaS", "Seed rounds of $1–3M", "EU industrial decarbonization focus").
- Return at least 6 and at most 15 VCs in the "vcs" array.
- Output MUST be valid JSON and must match this schema exactly."""


VC_SCOUT_FALLBACK_SYSTEM = """You are a senior VC scout. You DO NOT have access to any tools or web search in this mode.

You will ALWAYS be given a "Venture context" string as the user message. This context is the single source of truth about the specific startup.

Goal:
- Using only your model knowledge (no live web), propose a set of venture capital firms that are a plausible fit for this startup.

Output format:
- Return ONLY a JSON object with this exact structure (no markdown, no commentary):

{
  "vcs": [
    {
      "name": "Firm name",
      "region": "City, Country or Region",
      "lat": 37.77,
      "lng": -122.41,
      "stage_focus": "Seed, Series A",
      "sector_focus": "Deep Tech, Ocean robotics",
      "check_size": "$1–5M",
      "website": "https://firm-website.com",
      "contact_url": "https://firm-website.com/contact-or-pitch",
      "match_score": 0–100,
      "compatibility_summary": "2–3 sentences explaining why this firm is a strong fit for THIS startup (stage, sector, geography, thesis)."
    }
  ]
}

Rules:
- Always include at least 6 and at most 15 VCs in the "vcs" array.
- You may invent reasonable lat/lng, website, and contact_url values if unknown.
- Output MUST be valid JSON and must match this schema exactly."""


VC_SCOUT_DISCOVERY_SYSTEM = """You are a senior VC scout and research analyst.

You are given:
- Venture context for a specific startup.
- One target VC firm name and (optionally) its website URL.

Goal:
- Use web_search to find the VC firm's team / partners / investment professionals.
- Identify the partners whose investment focus is most relevant to THIS startup.

Research guidance:
- Use web_search to find:
  - The firm's official website (if not already provided).
  - Pages like "Team", "People", "Partners", "Investment Team".
- From search snippets and page content, extract:
  - Partner names
  - Their role or title (e.g. General Partner, Principal)
  - Their stated investment focus (sector, stage, geography)
  - A short note with 1–2 notable investments or portfolio themes when available.

Output:
- Return ONLY a JSON object with this exact structure (no markdown, no commentary):

{
  "partners": [
    {
      "name": "Full name",
      "role": "Title/role at the firm",
      "focus": "Short sentence on their sector/stage/geography focus",
      "notable_investments": "Optional short list or sentence of notable deals/companies."
    }
  ]
}

Rules:
- Only include partners or investors that appear to be involved in making investment decisions.
- Prefer partners whose focus matches the startup's sector, stage, and geography.
- Return at least 2 and at most 8 partners in the array.
- Output MUST be valid JSON and must match this schema exactly."""


async def run_vc_scout() -> SharedWorkspace:
    state = await load_state()
    state.vc_scout.status = AgentStatus.SYNCING
    await save_state(state)

    if DEMO_VC_SCOUT:
        context = await get_venture_context(state)
        user = f"Venture context:\n{context}"
        # Use Nova + custom web_search tool for deep, live VC research
        text, _sources = converse_with_web_search_tool(
            VC_SCOUT_RESEARCH_SYSTEM,
            user,
            model_key="vc_scout",
            max_tokens=4096,
            temperature=0.2,
        )
        pins: list[VCScoutPin] = []
        if text:
            try:
                cleaned = text.strip()
                if cleaned.startswith("```"):
                    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned)
                # Some Nova responses may include commentary before/after the JSON.
                # Try to extract the main JSON object by taking substring from first '{' to last '}'.
                first_brace = cleaned.find("{")
                last_brace = cleaned.rfind("}")
                json_str = cleaned[first_brace : last_brace + 1] if first_brace != -1 and last_brace != -1 else cleaned
                data = json.loads(json_str)
                vc_items = data.get("vcs") if isinstance(data, dict) else data
                if isinstance(vc_items, list):
                    for item in vc_items[:15]:
                        if not isinstance(item, dict):
                            continue
                        try:
                            pins.append(
                                VCScoutPin(
                                    name=str(item.get("name") or "").strip() or "Unknown fund",
                                    region=str(item.get("region") or "").strip() or "Unknown",
                                    lat=float(item.get("lat") or 0.0),
                                    lng=float(item.get("lng") or 0.0),
                                    stage_focus=(item.get("stage_focus") or None),
                                    sector_focus=(item.get("sector_focus") or None),
                                    check_size=(item.get("check_size") or None),
                                    website=(item.get("website") or None),
                                    contact_url=(item.get("contact_url") or None),
                                    match_score=float(item.get("match_score") or 0.0)
                                    if item.get("match_score") is not None
                                    else None,
                                    compatibility_summary=(
                                        item.get("compatibility_summary") or None
                                    ),
                                )
                            )
                        except Exception:
                            continue
            except Exception:
                # Fall back to legacy parser on error
                pins = _parse_vc_pins(text)

        # If web_search path produced nothing, fall back to a model-only VC list
        if not pins:
            fallback_text = converse(
                VC_SCOUT_FALLBACK_SYSTEM,
                user,
                model_key="vc_scout",
                max_tokens=4096,
                temperature=0.2,
            )
            if fallback_text:
                try:
                    cleaned_fb = fallback_text.strip()
                    if cleaned_fb.startswith("```"):
                        cleaned_fb = re.sub(r"^```(?:json)?\s*", "", cleaned_fb)
                        cleaned_fb = re.sub(r"\s*```$", "", cleaned_fb)
                    fb_first = cleaned_fb.find("{")
                    fb_last = cleaned_fb.rfind("}")
                    fb_json_str = (
                        cleaned_fb[fb_first : fb_last + 1]
                        if fb_first != -1 and fb_last != -1
                        else cleaned_fb
                    )
                    fb_data = json.loads(fb_json_str)
                    fb_items = fb_data.get("vcs") if isinstance(fb_data, dict) else fb_data
                    fb_pins: list[VCScoutPin] = []
                    if isinstance(fb_items, list):
                        for item in fb_items[:15]:
                            if not isinstance(item, dict):
                                continue
                            try:
                                fb_pins.append(
                                    VCScoutPin(
                                        name=str(item.get("name") or "").strip()
                                        or "Unknown fund",
                                        region=str(item.get("region") or "").strip()
                                        or "Unknown",
                                        lat=float(item.get("lat") or 0.0),
                                        lng=float(item.get("lng") or 0.0),
                                        stage_focus=(item.get("stage_focus") or None),
                                        sector_focus=(item.get("sector_focus") or None),
                                        check_size=(item.get("check_size") or None),
                                        website=(item.get("website") or None),
                                        contact_url=(item.get("contact_url") or None),
                                        match_score=float(item.get("match_score") or 0.0)
                                        if item.get("match_score") is not None
                                        else None,
                                        compatibility_summary=(
                                            item.get("compatibility_summary") or None
                                        ),
                                    )
                                )
                            except Exception:
                                continue
                    if fb_pins:
                        pins = fb_pins
                except Exception:
                    # Ignore fallback parse failure; will drop to static demo pins below
                    pass

        if not pins:
            state.vc_scout.last_message = (
                "Unable to load live VC research. Showing demo investors."
            )
            state.vc_scout.pins = _default_vc_pins()
        else:
            state.vc_scout.pins = pins
            state.vc_scout.last_message = (
                f"{len(pins)} VCs found (live search or model knowledge)."
            )

        state.vc_scout.status = AgentStatus.COMPLETE
        save_mock_response(
            "run_vc_scout",
            {
                "last_message": state.vc_scout.last_message,
                "pins": [p.model_dump() for p in state.vc_scout.pins],
            },
        )
    else:
        try:
            data = load_mock_response("run_vc_scout")
            state.vc_scout.last_message = data.get("last_message") or "3 VCs found. Drafting hyper-personalized email to Partner @ DeepSea Ventures."
            state.vc_scout.pins = [VCScoutPin.model_validate(p) for p in data.get("pins", [])] or _default_vc_pins()
            state.vc_scout.status = AgentStatus.COMPLETE
        except FileNotFoundError:
            state.vc_scout.last_message = "3 VCs found. Drafting hyper-personalized email to Partner @ DeepSea Ventures."
            state.vc_scout.pins = _default_vc_pins()
            state.vc_scout.status = AgentStatus.COMPLETE

    await save_state(state)
    return state


async def run_vc_scout_discovery(vc_index: int) -> SharedWorkspace:
    """
    For a single VC pin at vc_index, run a deeper discovery pass to identify
    individual partners and their focus using Nova + custom web_search.
    """
    state = await load_state()
    if vc_index < 0 or vc_index >= len(state.vc_scout.pins):
        raise ValueError("Invalid VC index")

    pin = state.vc_scout.pins[vc_index]
    context = await get_venture_context(state)
    user = (
        f"Venture context:\n{context}\n\n"
        f"Target VC firm name: {pin.name}\n"
        f"Region: {pin.region}\n"
        f"Website (if known): {pin.website or 'unknown'}\n"
    )

    text, _sources = converse_with_web_search_tool(
        VC_SCOUT_DISCOVERY_SYSTEM,
        user,
        model_key="vc_scout",
        max_tokens=4096,
        temperature=0.2,
    )

    partners: list[VCPartner] = []
    if text:
        try:
            cleaned = text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            json_str = (
                cleaned[first_brace : last_brace + 1]
                if first_brace != -1 and last_brace != -1
                else cleaned
            )
            data = json.loads(json_str)
            items = data.get("partners") if isinstance(data, dict) else data
            if isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    try:
                        partners.append(
                            VCPartner(
                                name=str(item.get("name") or "").strip()
                                or "Unknown partner",
                                role=(item.get("role") or None),
                                focus=(item.get("focus") or None),
                                notable_investments=(
                                    item.get("notable_investments") or None
                                ),
                            )
                        )
                    except Exception:
                        continue
        except Exception:
            # Ignore parse failure; leave partners empty
            partners = []

    # Update state even if partners is empty, so UI can show status
    state.vc_scout.pins[vc_index].partners = partners
    await save_state(state)
    return state


def _parse_vc_pins(text: str | None) -> list[VCScoutPin]:
    if not text:
        return []
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        arr = json.loads(text)
        if isinstance(arr, list):
            return [VCScoutPin.model_validate(p) for p in arr[:3] if isinstance(p, dict)]
    except Exception:
        pass
    return []


def _default_vc_pins() -> list[VCScoutPin]:
    return [
        VCScoutPin(name="DeepSea Ventures", region="San Francisco", lat=37.7749, lng=-122.4194),
        VCScoutPin(name="Abyssal Capital", region="London", lat=51.5074, lng=-0.1278),
        VCScoutPin(name="Trenchline Partners", region="Singapore", lat=1.3521, lng=103.8198),
    ]


# --- Asset Forge (Nova Pro → pitch deck PPT) ---

ASSET_FORGE_SYSTEM = """You are an expert pitch deck writer for venture-backed startups. Your output is used in investor presentations. Write in a sharp, professional, confident tone—no fluff, no generic startup clichés. Every line should be specific to THIS venture and credible to a seasoned VC.

Output ONLY a single JSON object (no other text) with this exact structure:
{"golden_thread": "One memorable, punchy sentence that captures the venture (tagline or value prop).", "slides": [{"title": "Slide title", "bullets": ["Bullet one", "Bullet two", ...]}, ...]}

Create exactly 5 slides, in this exact order. No more, no less:

1) Product / Title — Use the actual company or product name as the title (not "Title" or "The Hook"). Add 1–2 bullets: a crisp one-liner value proposition and optional tagline. Make it memorable and concrete.

2) Problem — Frame the pain clearly: who has it, how big is it (time, cost, risk), and why it matters now. Use specific numbers or outcomes where possible. Avoid vague "people struggle with X"; name the segment and the cost of inaction.

3) Solution — What you do, why it works, and why you win. Include 1–2 differentiators (tech, data, network, speed) and any proof (pilot, metric, design). Bullets should be scannable and outcome-focused (e.g. "10x faster", "50% cost reduction").

4) Business model — How you make money: revenue model (subscription, usage, license, etc.), unit economics if relevant, and why it scales. Be concrete (e.g. "€X per seat/month", "Y% gross margin"). One bullet on growth or expansion if it fits.

5) Market size / opportunity — TAM, SAM, SOM (with rationale or source), growth rate (CAGR if available), and 1–2 key competitors or alternatives. When Market Intelligence data is provided below, use its numbers and competitor names exactly; do not invent percentages.

STYLE RULES:
- Titles: Short, punchy, and slide-specific (e.g. "The $2B problem in maritime inspection", not "The Problem").
- Bullets: Parallel structure where possible; start with the insight or number; avoid filler ("We are committed to...", "Our mission is...").
- Golden thread: One sentence an investor could repeat—clear, specific, and tied to the venture.
- Every slide must use the venture's real name, product, market, and any numbers from the context. No placeholders.

If Market Intelligence data is provided, it will appear after the venture context in a section titled "Market Intelligence data". Use it only for slide 5 (Market size/opportunity).

CRITICAL:
- Output exactly 5 slides. The fifth slide must be the only Market size/opportunity slide.
- Do not add slides for "Why now", "Traction", "Team", or "Ask"; fold those points into the 5 slides above if needed.
- The first slide title MUST be the EXACT startup name from the venture context (e.g. if "Startup name: Project Cerebro", the title must be "Project Cerebro"). NEVER invent, rename, or rebrand the startup.
- Use the startup's exact name consistently across ALL slides. Do not create an alternative name.

Output only the JSON, no markdown code fence."""

ASSET_FORGE_MARKET_RESYNC_SYSTEM = """You are rewriting only the Market size/opportunity slide of a startup pitch deck.

You are given:
1) The current Market slide (title and bullets).
2) Market Intelligence data including summary, market_share_data, trend_data, and any TAM/SAM numbers.

TASK:
- Rewrite the Market slide so that all competitor names and percentages match the Market Intelligence data exactly.
- Make the slide clear, concise, and investor-ready.
- Focus on TAM/SAM, growth, and key competitors as indicated by the data.

Return ONLY a JSON object in this format (no extra text):
{"title": "Slide title", "bullets": ["Bullet one", "Bullet two", ...]}"""


ASSET_FORGE_CHAT_EDIT_SYSTEM = """You are an expert pitch deck editor. You receive:
1) The current deck as a JSON array of slides. Each slide has "id" (hook, problem, solution, business, market), "title", and "bullets" (array of strings).
2) A natural-language edit request from the user.
3) Optional: a list of attachment filenames the user added (e.g. images). The user may ask to add an image to a specific slide: slide 1 = hook (title/logo), 2 = problem, 3 = solution, 4 = business, 5 = market. Honour the slide they specify (e.g. "slide 1", "title slide", "logo placeholder" = hook; "slide 3" = solution). You cannot see file contents.

TASK:
- Apply the requested changes to the deck. Keep all other slides as close to the original as possible.
- Preserve meaning and tone unless the user asks to change them.
- When the user attaches an image and asks to add it to a slide: integrate that into the slide content with a short descriptive bullet (e.g. "Platform architecture diagram" or "Detailed pipeline overview") — do NOT add a bullet that only says "See filename.png for ...". The actual image will be embedded on the slide; your job is to add a clear caption or bullet that describes what the image shows.
- When the user asks for font, color, or background changes (e.g. "make the title bigger", "use blue background", "white text", "larger font", "dark background", "change bullet color to gray"), include a "style_overrides" object in your response with the requested values. Use only these keys (omit any key not requested):
  - title_font_size_pt: number (e.g. 44 for title slide, 36 for content slide titles; default 44/32)
  - bullet_font_size_pt: number (e.g. 16 for bullets; default 14)
  - title_color_hex: string like "#E0E7FF" (for slide titles)
  - bullet_color_hex: string like "#E2E8F0" (for bullet text)
  - title_slide_bg_hex: string like "#020617" (first slide background)
  - content_slide_bg_hex: string like "#0F172A" (content slides background)
- Return JSON: {"slides": [{"id": "hook", "title": "...", "bullets": [...]}, ...], "style_overrides": {...}}.
- Preserve exactly the same slide "id" order: hook, problem, solution, business, market. All five must be present. style_overrides is optional; omit it if the user did not ask for any styling changes.
- Output only the JSON, no markdown code fence or other text."""


# Path where generated pitch deck is saved (relative to backend app); exported for download endpoint
def get_pitch_deck_path():
    from pathlib import Path
    return Path(__file__).resolve().parent.parent / "generated" / "pitch_deck.pptx"


def get_asset_forge_assets_dir() -> Path:
    """Directory for Asset Forge uploaded files (attachments)."""
    p = Path(__file__).resolve().parent.parent / "generated" / "assets"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_code_lab_assets_dir() -> Path:
    """Directory for Code Lab generated assets (e.g. mock images)."""
    p = Path(__file__).resolve().parent.parent / "generated" / "code-lab-assets"
    p.mkdir(parents=True, exist_ok=True)
    return p


def generate_asset_forge_image(prompt: str, color_hex: str | None = None) -> dict | None:
    """
    Generate an image with Nova Canvas, save to Asset Forge assets dir.
    Returns {"filename": str, "path": str} (path = stored uuid.png) or None on failure.
    """
    import uuid as _uuid
    try:
        from .nova_canvas import generate_image as nova_canvas_generate
    except Exception as e:
        LOG.warning("Nova Canvas not available: %s", e)
        return None
    if not prompt or not prompt.strip():
        return None
    try:
        png_bytes = nova_canvas_generate(prompt.strip()[:1024], color_hex=color_hex)
    except Exception as e:
        LOG.warning("Nova Canvas generate failed: %s", e, exc_info=True)
        return None
    assets_dir = get_asset_forge_assets_dir()
    safe_name = f"{_uuid.uuid4().hex}.png"
    path = assets_dir / safe_name
    path.write_bytes(png_bytes)
    return {"filename": "generated.png", "path": safe_name}


def generate_code_lab_image(prompt: str, color_hex: str | None = None) -> dict | None:
    """
    Generate an image with Nova Canvas, save to Code Lab assets dir.
    Returns {"filename": str, "path": str} (path = stored uuid.png) or None on failure.
    """
    import uuid as _uuid
    try:
        from .nova_canvas import generate_image as nova_canvas_generate
    except Exception as e:
        LOG.warning("Nova Canvas not available for Code Lab: %s", e)
        return None
    if not prompt or not prompt.strip():
        return None
    try:
        png_bytes = nova_canvas_generate(prompt.strip()[:1024], color_hex=color_hex)
    except Exception as e:
        LOG.warning("Nova Canvas generate failed for Code Lab: %s", e, exc_info=True)
        return None
    assets_dir = get_code_lab_assets_dir()
    safe_name = f"{_uuid.uuid4().hex}.png"
    path = assets_dir / safe_name
    path.write_bytes(png_bytes)
    return {"filename": "generated-code-lab.png", "path": safe_name}


def _extract_image_gen_from_message(message: str) -> tuple[str | None, str | None]:
    """If message asks to generate an image, return (prompt, color_hex). Else (None, None)."""
    if not message or not isinstance(message, str):
        return None, None
    msg = message.lower().strip()
    if "generate" not in msg and "create" not in msg:
        return None, None
    if not any(x in msg for x in ("image", "logo", "picture", "graphic", "icon")):
        return None, None
    prompt = message.strip()[:1024]
    color = None
    if "white" in msg:
        color = "#FFFFFF"
    elif "black" in msg:
        color = "#000000"
    return prompt, color


def _narrative_chapters_to_slides_json(af) -> list:
    """Build list of {id, title, bullets} from asset_forge.narrative_chapters."""
    chapter_ids = ["hook", "problem", "solution", "business", "market"]
    out = []
    for ch_id in chapter_ids:
        block = (getattr(af, "narrative_chapters", None) or {}).get(ch_id, "")
        title = ""
        bullets = []
        for line in (block or "").splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("• "):
                bullets.append(line[2:].strip())
            else:
                if not title:
                    title = line
                else:
                    bullets.append(line)
        out.append({"id": ch_id, "title": title or ch_id.capitalize(), "bullets": bullets})
    return out


def _parse_style_from_message(message: str) -> dict:
    """Parse user message for common font/color/background keywords and return style_overrides dict."""
    if not message or not isinstance(message, str):
        return {}
    msg = message.lower().strip()
    overrides = {}
    # Font size
    if any(x in msg for x in ("bigger font", "larger font", "increase font", "bigger title", "larger title")):
        overrides["title_font_size_pt"] = 40
        overrides["bullet_font_size_pt"] = 16
    if any(x in msg for x in ("smaller font", "reduce font", "smaller title")):
        overrides["title_font_size_pt"] = 28
        overrides["bullet_font_size_pt"] = 12
    if "title size" in msg or "title font" in msg:
        if "big" in msg or "large" in msg or "increase" in msg:
            overrides["title_font_size_pt"] = 40
        elif "small" in msg:
            overrides["title_font_size_pt"] = 28
    # Colors
    if "white text" in msg or "white bullet" in msg or "bullets white" in msg:
        overrides["bullet_color_hex"] = "#FFFFFF"
    if "white title" in msg or "titles white" in msg:
        overrides["title_color_hex"] = "#FFFFFF"
    if "gray bullet" in msg or "grey bullet" in msg:
        overrides["bullet_color_hex"] = "#94A3B8"
    # Background: match broad "background" phrases first, then specific colours
    if any(x in msg for x in ("background", "bg ")) and not overrides.get("content_slide_bg_hex"):
        if any(x in msg for x in ("blue", "navy")):
            overrides["content_slide_bg_hex"] = "#1E3A5F"
            overrides["title_slide_bg_hex"] = "#0F172A"
        elif any(x in msg for x in ("dark", "black")):
            overrides["content_slide_bg_hex"] = "#020617"
            overrides["title_slide_bg_hex"] = "#020617"
        elif any(x in msg for x in ("light", "white")):
            overrides["content_slide_bg_hex"] = "#F8FAFC"
            overrides["title_slide_bg_hex"] = "#F1F5F9"
            overrides["title_color_hex"] = "#0F172A"
            overrides["bullet_color_hex"] = "#334155"
    if "blue background" in msg or "blue bg" in msg:
        overrides["content_slide_bg_hex"] = "#1E3A5F"
        overrides["title_slide_bg_hex"] = "#0F172A"
    if "dark background" in msg or "dark bg" in msg or "darker background" in msg:
        overrides["content_slide_bg_hex"] = "#020617"
        overrides["title_slide_bg_hex"] = "#020617"
    if "black background" in msg or "black bg" in msg:
        overrides["content_slide_bg_hex"] = "#000000"
        overrides["title_slide_bg_hex"] = "#000000"
    if "light background" in msg or "white background" in msg or "light bg" in msg:
        overrides["content_slide_bg_hex"] = "#F8FAFC"
        overrides["title_slide_bg_hex"] = "#F1F5F9"
        overrides["title_color_hex"] = "#0F172A"
        overrides["bullet_color_hex"] = "#334155"
    return overrides


def _infer_image_target_slide(message: str) -> str:
    """Infer which slide (hook/problem/solution/business/market) the user wants the image on.
    Slide 1 = hook (title/logo), 2 = problem, 3 = solution, 4 = business, 5 = market.
    """
    msg = (message or "").lower().strip()
    # Explicit slide numbers and synonyms first (so "slide 1" / "logo placeholder" win)
    if any(x in msg for x in ("slide 1", "first slide", "title slide", "logo placeholder", "logo place", "opening slide", "1st slide", "slide one")):
        return "hook"
    if any(x in msg for x in ("slide 2", "second slide", "2nd slide", "slide two")):
        return "problem"
    if any(x in msg for x in ("slide 3", "third slide", "3rd slide", "slide three")):
        return "solution"
    if any(x in msg for x in ("slide 4", "fourth slide", "4th slide", "slide four")):
        return "business"
    if any(x in msg for x in ("slide 5", "fifth slide", "5th slide", "slide five", "market slide")):
        return "market"
    # "logo" or "title" without "slide 2" etc. -> assume title slide (hook)
    if any(x in msg for x in ("logo", "title slide", "title page", "cover slide")):
        return "hook"
    # Fallback: keyword match (order matters; first match wins)
    for sid in ("hook", "problem", "solution", "business", "market"):
        if sid in msg:
            return sid
    return "solution"


def _image_placements_from_attachments(
    attachments: list[dict],
    message: str,
    assets_dir: Path,
) -> list[dict]:
    """From chat-edit attachments and message, return list of {path, slide_id} for embedding images."""
    image_ext = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    target = _infer_image_target_slide(message)
    out = []
    assets_dir = Path(assets_dir).resolve()
    for a in attachments or []:
        path = a.get("path") or a.get("filename") or ""
        if not path or not isinstance(path, str):
            continue
        ext = Path(path).suffix.lower()
        if ext not in image_ext:
            continue
        # path from upload is stored filename (e.g. uuid.png); resolve to absolute
        full = (assets_dir / path).resolve()
        if not full.is_file():
            LOG.warning("Asset Forge image placement: file not found %s", full)
            continue
        out.append({"path": str(full), "slide_id": target})
        LOG.info("Asset Forge: will embed image on slide %s: %s", target, full.name)
    return out


def _slides_json_to_narrative_chapters(slides: list) -> dict:
    """Convert Nova slides list (with id, title, bullets) to narrative_chapters dict."""
    chapters = {}
    for s in slides:
        ch_id = (s.get("id") or "").strip() or None
        if not ch_id or ch_id not in ("hook", "problem", "solution", "business", "market"):
            continue
        title = (s.get("title") or "").strip()
        bullets = s.get("bullets") or []
        parts = [title] if title else []
        for b in bullets[:6]:
            parts.append(f"• {str(b).strip()}")
        chapters[ch_id] = "\n".join(parts).strip() or ch_id.capitalize()
    return chapters


async def run_asset_forge_chat_edit(
    message: str,
    target: str = "auto",
    attachments: list[dict] | None = None,
) -> "SharedWorkspace":
    """Apply user edit request to the pitch deck via Nova Pro; update narrative_chapters and rebuild PPT."""
    state = await load_state()
    af = state.asset_forge
    if not af:
        return state
    chapters = getattr(af, "narrative_chapters", None) or {}
    if not chapters:
        LOG.warning("Asset Forge chat-edit: no narrative_chapters; skipping.")
        return state

    attachments = list(attachments or [])
    prompt, color_hex = _extract_image_gen_from_message(message)
    if prompt:
        gen = generate_asset_forge_image(prompt, color_hex)
        if gen:
            attachments.insert(0, gen)
            LOG.info("Asset Forge: generated image via Nova Canvas and attached: %s", gen.get("path"))

    current_slides = _narrative_chapters_to_slides_json(af)
    deck_json = json.dumps({"slides": current_slides}, indent=2)
    user_parts = [f"Current deck (JSON):\n{deck_json}", f"\nEdit request: {message}"]
    if attachments:
        names = [a.get("filename") or a.get("path") or "file" for a in attachments]
        user_parts.append(f"\nAttachments (use these filenames where relevant): {', '.join(names)}")
    user_content = "\n".join(user_parts)

    text = converse(
        ASSET_FORGE_CHAT_EDIT_SYSTEM,
        user_content,
        model_key="ingest",
        max_tokens=4096,
    )
    if not text:
        return state
    try:
        raw = json.loads(text)
        slides = raw.get("slides")
        if not slides or not isinstance(slides, list):
            return state
        new_chapters = _slides_json_to_narrative_chapters(slides)
        if new_chapters:
            af.narrative_chapters = {**chapters, **new_chapters}
            from .pptx_builder import build_pitch_deck
            # Build slides_data as list of {title, bullets} for PPT (same order as chapter_ids)
            chapter_ids = ["hook", "problem", "solution", "business", "market"]
            slides_data = []
            for ch_id in chapter_ids:
                block = af.narrative_chapters.get(ch_id, "")
                title = ""
                bullets = []
                for line in (block or "").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("• "):
                        bullets.append(line[2:].strip())
                    else:
                        if not title:
                            title = line
                        else:
                            bullets.append(line)
                bullets = [b for b in bullets if (b or "").strip()]
                slides_data.append({"title": title or ch_id.capitalize(), "bullets": bullets})
            # Resolve which slide(s) get embedded images from attachments
            image_placements = _image_placements_from_attachments(
                attachments or [], message, get_asset_forge_assets_dir()
            )
            af.embedded_slide_images = (
                {p["slide_id"]: Path(p["path"]).name for p in image_placements}
                if image_placements
                else None
            )
            # Style overrides: merge existing state + Nova response + parsed from user message
            existing = dict(af.style_overrides or {})
            from_nova = raw.get("style_overrides")
            if isinstance(from_nova, dict):
                for k, v in from_nova.items():
                    if v is not None:
                        existing[k] = v
            from_message = _parse_style_from_message(message)
            for k, v in from_message.items():
                if v is not None:
                    existing[k] = v
            af.style_overrides = existing if existing else None
            build_pitch_deck(
                slides_data,
                get_pitch_deck_path(),
                market_intel=state.market_intel if hasattr(state, "market_intel") else None,
                image_placements=image_placements,
                style_overrides=af.style_overrides,
            )
            LOG.info("Asset Forge chat-edit: deck updated and PPT rebuilt")
    except Exception as e:
        LOG.warning("Asset Forge chat-edit: parse/apply failed: %s", e, exc_info=True)
    await save_state(state)
    return state


async def run_asset_forge_update_content(narrative_chapters: dict[str, str]) -> "SharedWorkspace":
    """Update pitch deck from inline-edited narrative_chapters; rebuild PPT and save state."""
    state = await load_state()
    af = state.asset_forge
    if not af:
        return state
    valid_ids = {"hook", "problem", "solution", "business", "market"}
    updates = {k: v for k, v in (narrative_chapters or {}).items() if k in valid_ids and isinstance(v, str)}
    if not updates:
        return state
    existing = getattr(af, "narrative_chapters", None) or {}

    def _normalize_chapter(block: str) -> str:
        lines = [ln.strip() for ln in (block or "").splitlines() if ln.strip()]
        if not lines:
            return ""
        kept = [lines[0]]
        for ln in lines[1:]:
            if ln.startswith("• ") and not ln[2:].strip():
                continue
            if not ln.startswith("• ") and not ln.strip():
                continue
            kept.append(ln)
        return "\n".join(kept)

    normalized = {ch_id: _normalize_chapter(updates.get(ch_id, existing.get(ch_id, ""))) for ch_id in valid_ids}
    af.narrative_chapters = {**existing, **normalized}
    chapter_ids = ["hook", "problem", "solution", "business", "market"]
    slides_data = []
    for ch_id in chapter_ids:
        block = af.narrative_chapters.get(ch_id, "")
        title = ""
        bullets = []
        for line in (block or "").splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("• "):
                bullets.append(line[2:].strip())
            else:
                if not title:
                    title = line
                else:
                    bullets.append(line)
        bullets = [b for b in bullets if (b or "").strip()]
        slides_data.append({"title": title or ch_id.capitalize(), "bullets": bullets})
    from .pptx_builder import build_pitch_deck
    image_placements = []
    emb = getattr(af, "embedded_slide_images", None) or {}
    assets_dir = get_asset_forge_assets_dir()
    for slide_id, filename in emb.items():
        path = (assets_dir / filename).resolve()
        if path.is_file():
            image_placements.append({"path": str(path), "slide_id": slide_id})
    build_pitch_deck(
        slides_data,
        get_pitch_deck_path(),
        market_intel=state.market_intel if hasattr(state, "market_intel") else None,
        image_placements=image_placements or None,
        style_overrides=getattr(af, "style_overrides", None),
    )
    LOG.info("Asset Forge update-content: deck updated from inline edit")
    await save_state(state)
    return state


async def run_asset_forge_start_over() -> "SharedWorkspace":
    """Reset Asset Forge to initial state so the user can create a new deck from scratch."""
    state = await load_state()
    af = state.asset_forge
    if not af:
        return state
    af.status = AgentStatus.IDLE
    af.narrative_chapters = {}
    af.golden_thread = None
    af.narrative_flow = None
    af.last_message = None
    af.embedded_slide_images = None
    af.style_overrides = None
    LOG.info("Asset Forge: start over — reset to IDLE")
    await save_state(state)
    return state


def _build_market_intel_snippet(mi) -> str:
    """Compact text snippet for Market Intelligence data to feed into Nova."""
    if not mi:
        return ""
    lines: list[str] = []
    if getattr(mi, "summary", None):
        lines.append(f"- Summary: {str(mi.summary)[:600]}")
    if getattr(mi, "market_share_data", None):
        try:
            parts = []
            for item in mi.market_share_data or []:
                name = item.get("name")
                share = item.get("share")
                if name and share is not None:
                    parts.append(f"{name} {share}%")
            if parts:
                lines.append("- Market share: " + ", ".join(parts))
        except Exception:
            pass
    if getattr(mi, "trend_data", None):
        try:
            pts = []
            for row in (mi.trend_data or [])[:6]:
                month = row.get("month")
                market = row.get("market")
                competitors = row.get("competitors")
                if month and market is not None and competitors is not None:
                    pts.append(f"{month} market={market} competitors={competitors}")
            if pts:
                lines.append("- Trend data: " + "; ".join(pts))
        except Exception:
            pass
    # Include raw JSON for fidelity if present
    try:
        if getattr(mi, "market_share_data", None):
            lines.append("- market_share_data JSON: " + json.dumps(mi.market_share_data))
        if getattr(mi, "trend_data", None):
            lines.append("- trend_data JSON: " + json.dumps(mi.trend_data))
    except Exception:
        pass
    if not lines:
        return ""
    return "Market Intelligence data (use these facts for the Market slide):\n" + "\n".join(lines)


async def run_asset_forge() -> SharedWorkspace:
    # #region agent log
    try:
        _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
        _log.write(json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "orb_services.py:run_asset_forge", "message": "run_asset_forge entry", "data": {}, "hypothesisId": "H2"}) + "\n")
        _log.close()
    except Exception:
        pass
    # #endregion
    print("[Asset Forge] run_asset_forge started", flush=True)
    state = await load_state()
    state.asset_forge.status = AgentStatus.SYNCING
    await save_state(state)

    # #region agent log
    try:
        _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
        _log.write(json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "orb_services.py:run_asset_forge", "message": "DEMO_ASSET_FORGE branch", "data": {"DEMO_ASSET_FORGE": DEMO_ASSET_FORGE}, "hypothesisId": "H5"}) + "\n")
        _log.close()
    except Exception:
        pass
    # #endregion
    if DEMO_ASSET_FORGE:
        print("[Asset Forge] DEMO_ASSET_FORGE=True -> calling Nova Pro for pitch deck JSON...", flush=True)
        context = await get_venture_context(state)
        if context.strip():
            venture_block = f"Venture context:\n{context}"
        else:
            venture_block = "No venture context. Create a generic tech startup pitch deck (6 slides: Title, Problem, Solution, Market, Business Model, Ask)."
        mi_snippet = _build_market_intel_snippet(state.market_intel if hasattr(state, "market_intel") else None)
        user = venture_block
        if mi_snippet:
            user = f"{venture_block}\n\n{mi_snippet}"
        # #region agent log
        try:
            _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
            _log.write(json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "orb_services.py:run_asset_forge", "message": "before converse()", "data": {"user_len": len(user)}, "hypothesisId": "H3"}) + "\n")
            _log.close()
        except Exception:
            pass
        # #endregion
        text = converse(ASSET_FORGE_SYSTEM, user, model_key="ingest", max_tokens=4096)  # Nova Pro
        # #region agent log
        try:
            _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
            _log.write(json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "orb_services.py:run_asset_forge", "message": "after converse()", "data": {"text_len": len(text) if text else 0, "has_text": bool(text)}, "hypothesisId": "H3"}) + "\n")
            _log.close()
        except Exception:
            pass
        # #endregion
        if text:
            state.asset_forge.last_message = text.strip()[:2000]
            from .pptx_builder import parse_slides_from_json, build_pitch_deck
            slides, golden_thread = parse_slides_from_json(text)
            if slides:
                # Exactly 5 slides: hook, problem, solution, business, market (avoid duplicate Market slides)
                slides = slides[:5]
                try:
                    build_pitch_deck(
                        slides,
                        get_pitch_deck_path(),
                        market_intel=state.market_intel if hasattr(state, "market_intel") else None,
                    )
                    state.asset_forge.golden_thread = golden_thread or (slides[0].get("title") or "Pitch deck").strip()
                    state.asset_forge.narrative_flow = state.asset_forge.last_message
                    # Map Nova slides to narrative_chapters so Smart Canvas shows venture-specific content (not mock)
                    chapter_ids = ["hook", "problem", "solution", "business", "market"]
                    state.asset_forge.narrative_chapters = {}
                    for i, ch_id in enumerate(chapter_ids):
                        if i < len(slides):
                            s = slides[i]
                            title = (s.get("title") or "").strip()
                            bullets = s.get("bullets") or []
                            parts = [title] if title else []
                            for b in bullets[:6]:
                                parts.append(f"• {b}")
                            state.asset_forge.narrative_chapters[ch_id] = "\n".join(parts).strip() or f"Slide {i + 1}"
                    LOG.info("Asset Forge: pitch deck PPT generated (%d slides)", len(slides))
                except Exception as e:
                    LOG.warning("Asset Forge: could not build PPT: %s", e)
                    state.asset_forge.golden_thread = golden_thread or "Pitch deck"
                    state.asset_forge.narrative_flow = state.asset_forge.last_message
            else:
                state.asset_forge.narrative_flow = text.strip()[:2000]
                state.asset_forge.golden_thread = golden_thread or "Pitch deck"
        else:
            state.asset_forge.last_message = "Pitch deck generation is ready. Sync with narrative when Nova is available."
            state.asset_forge.narrative_flow = None
            state.asset_forge.golden_thread = "Pitch deck"
        state.asset_forge.context_inherited = bool(state.market_gap)
        state.pitch_deck_status = "Ready"
        state.asset_forge.status = AgentStatus.COMPLETE
        save_mock_response("run_asset_forge", {
            "last_message": state.asset_forge.last_message,
            "narrative_flow": state.asset_forge.narrative_flow,
            "golden_thread": state.asset_forge.golden_thread,
            "narrative_chapters": state.asset_forge.narrative_chapters,
        })
    else:
        print("[Asset Forge] DEMO_ASSET_FORGE=False -> loading from mock", flush=True)
        try:
            data = load_mock_response("run_asset_forge")
            state.asset_forge.last_message = data.get("last_message") or "Pitch deck ready. Enable DEMO_ASSET_FORGE for Nova-generated deck."
            state.asset_forge.narrative_flow = data.get("narrative_flow")
            state.asset_forge.golden_thread = data.get("golden_thread") or "Pitch deck"
            if data.get("narrative_chapters"):
                state.asset_forge.narrative_chapters = data["narrative_chapters"]
            state.asset_forge.status = AgentStatus.COMPLETE
        except FileNotFoundError:
            state.asset_forge.last_message = "Pitch deck ready. Enable DEMO_ASSET_FORGE for Nova-generated deck."
            state.asset_forge.status = AgentStatus.COMPLETE
            state.asset_forge.golden_thread = "Pitch deck"
        state.pitch_deck_status = "Ready"
        state.asset_forge.context_inherited = bool(state.market_gap)
    state.context_inherited = state.asset_forge.context_inherited
    await save_state(state)
    # #region agent log
    try:
        _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
        _log.write(json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "orb_services.py:run_asset_forge", "message": "before return", "data": {"status": str(state.asset_forge.status)}, "hypothesisId": "H4"}) + "\n")
        _log.close()
    except Exception:
        pass
    # #endregion
    return state


async def run_asset_forge_resync_market() -> SharedWorkspace:
    """Rewrite only the Market slide using latest Market Intelligence data."""
    state = await load_state()
    af = state.asset_forge
    mi = state.market_intel if hasattr(state, "market_intel") else None
    if not af or not getattr(af, "narrative_chapters", None):
        return state
    current_market = af.narrative_chapters.get("market", "")
    mi_block = _build_market_intel_snippet(mi)
    user_parts = [f"Current Market slide:\n{current_market or '(none)'}"]
    if mi_block:
        user_parts.append("\n" + mi_block)
    user = "\n\n".join(user_parts)

    text = converse(
        ASSET_FORGE_MARKET_RESYNC_SYSTEM,
        user,
        model_key="ingest",
        max_tokens=1024,
    )
    if text:
        try:
            data = json.loads(text)
            title = (data.get("title") or "").strip()
            bullets = data.get("bullets") or []
            parts: list[str] = [title] if title else []
            if isinstance(bullets, list):
                for b in bullets[:6]:
                    parts.append(f"• {b}")
            new_block = "\n".join(parts).strip()
            if new_block:
                af.narrative_chapters["market"] = new_block
        except Exception:
            LOG.warning("Asset Forge resync: could not parse market slide JSON", exc_info=True)

    await save_state(state)
    return state


# --- Code Lab (Nova Pro) ---

CODE_LAB_SYSTEM = """You are a technical architect for startups. Given the venture context, suggest a one-paragraph code/scaffold blueprint: stack, main features, and one sentence on Mission Control / dashboard. Reply with only that paragraph."""


async def run_code_lab() -> SharedWorkspace:
    state = await load_state()
    state.code_lab.status = AgentStatus.SYNCING
    await save_state(state)

    if DEMO_CODE_LAB:
        context = await get_venture_context(state)
        user = f"Venture context:\n{context}"
        text = converse(CODE_LAB_SYSTEM, user, model_key="ingest", max_tokens=512)  # Nova Pro
        if text:
            state.code_lab.scaffold_summary = text.strip()[:2000]
            state.code_lab.last_message = "Generating scaffold from blueprint."
        else:
            state.code_lab.last_message = "Generating Next.js scaffold."
            state.code_lab.scaffold_summary = "Next.js 14 App Router with Mission Control grid and Virtual Tank stage."
        state.code_lab.status = AgentStatus.COMPLETE
        save_mock_response("run_code_lab", {"last_message": state.code_lab.last_message, "scaffold_summary": state.code_lab.scaffold_summary})
    else:
        try:
            data = load_mock_response("run_code_lab")
            state.code_lab.last_message = data.get("last_message") or "Generating Next.js scaffold."
            state.code_lab.scaffold_summary = data.get("scaffold_summary") or "Next.js 14 App Router with Mission Control grid and Virtual Tank stage."
            state.code_lab.status = AgentStatus.COMPLETE
        except FileNotFoundError:
            state.code_lab.last_message = "Generating Next.js scaffold."
            state.code_lab.scaffold_summary = "Next.js 14 App Router with Mission Control grid and Virtual Tank stage."
            state.code_lab.status = AgentStatus.COMPLETE

    await save_state(state)
    return state


# --- Code Lab Build: Nova generates code files → zip artifact ---

CODE_LAB_BUILD_SYSTEM = """You are an expert full-stack developer. Given the user's build request, output ONLY a JSON object with this exact structure. No markdown, no code fence, no other text.

{"files": [{"path": "relative/file/path.ext", "content": "full file content as a string"}, ...]}

CRITICAL — generate PROPER, PRODUCTION-QUALITY code:
- Write complete, runnable implementations. No placeholders, no "TODO" or "add your code here". Every feature requested must be fully implemented.
- Generate 5 to 10 files. Each file can be 80–200+ lines as needed. Escape quotes and newlines in content for valid JSON (use \\n for newlines, \\" for quotes inside strings).
- Paths: relative only, e.g. "index.html", "styles.css", "script.js", "src/App.tsx", "package.json", "README.md".

For a LANDING PAGE or WEBPAGE (single HTML):
- Produce one main index.html that is a full, polished page. Include:
  - Semantic HTML5: header, nav, main (hero section, features/sections, testimonials or benefits, CTA), footer.
  - A complete <style> block with modern CSS: layout (flex/grid), typography, colors, spacing, responsive design (media queries for mobile), hover states, optional gradients or shadows.
  - A <script> block with real interactivity: smooth scroll, form validation and submit handling, mobile menu toggle, or simple animations. No empty stubs.
- Match the venture/startup idea in copy and tone (tagline, value prop, CTA). The page must look like a real product landing page, not a template with lorem ipsum.

For a REACT/NEXT or multi-file app:
- Use proper component structure: real props, state where needed, clean JSX. Include a proper package.json with dependencies, and README with install and run commands.
- Include at least one index.html or index file that can be used for preview if applicable.

Always include README.md with setup and run instructions. Output only the JSON object."""


def _code_lab_build_system_with_design() -> str:
    """Code Lab build system prompt + design skill for webpage generation (tool: design_skill.md)."""
    design = get_design_skill_content()
    if design:
        return CODE_LAB_BUILD_SYSTEM + "\n\n---\n## Design guidelines (follow for webpages)\n\n" + design[:6000]
    return CODE_LAB_BUILD_SYSTEM


# HTML-only build mode: guarantee index.html + styles.css + script.js
CODE_LAB_BUILD_SYSTEM_HTML = """You are an expert front-end engineer. The user wants a single static website built ONLY with plain HTML, CSS, and vanilla JavaScript.

Output ONLY a JSON object in this exact structure, no markdown or explanation:

{"files": [
  {"path": "index.html", "content": "full HTML file as a string"},
  {"path": "styles.css", "content": "full CSS file as a string"},
  {"path": "script.js", "content": "full JS file as a string"},
  {"path": "README.md", "content": "instructions"}
]}

Rules:
- You MUST include exactly these four files: index.html, styles.css, script.js, README.md.
- index.html:
  - Full, valid HTML5 document with <head> and <body>.
  - Link styles.css and script.js with correct relative paths.
  - Include all sections the user requested (hero, features, gallery, testimonials, contact form, etc.) in one page.
  - Use semantic HTML where possible.
- styles.css:
  - Contain all layout and visual styles for the page (no inline styles in HTML except very small exceptions).
  - Use a modern, responsive layout (flexbox/grid, media queries) matching the user’s theme (e.g. minimal dark).
- script.js:
  - Add simple, real interactivity only (e.g. smooth scroll, form validation, mobile menu toggle, or subtle animations).
  - No empty stubs or TODOs.
- README.md:
  - Brief instructions on how to open index.html locally in a browser.

CRITICAL JSON formatting:
- Escape newlines as \\n inside content strings.
- Escape quotes inside strings as \\".
- Do NOT put raw line breaks inside any JSON string."""


def _code_lab_build_system_html_with_design() -> str:
    design = get_design_skill_content()
    if design:
        return CODE_LAB_BUILD_SYSTEM_HTML + "\n\n---\n## Design guidelines (follow for webpages)\n\n" + design[:6000]
    return CODE_LAB_BUILD_SYSTEM_HTML


def _parse_code_json(text: str) -> list[dict] | None:
    """Extract files array from Nova response. Handles markdown wrap, extra text, and unescaped newlines in content."""
    raw = (text or "").strip()
    # Strip markdown code block if present
    if "```json" in raw:
        start = raw.index("```json") + 7
        end = raw.find("```", start)
        raw = (raw[start:end] if end >= 0 else raw[start:]).strip()
    elif "```" in raw:
        start = raw.find("```") + 3
        end = raw.find("```", start)
        raw = (raw[start:end] if end >= 0 else raw[start:]).strip()
    # Fallback: take the outermost JSON object (first { to last })
    if not raw.startswith("{"):
        first = raw.find("{")
        last = raw.rfind("}")
        if first >= 0 and last > first:
            raw = raw[first : last + 1]
    if not raw.startswith("{"):
        LOG.warning("Code Lab: no JSON object in response (len=%d). Snippet: %s", len(text or ""), (text or "")[:300])
        return None

    for attempt in [raw, _try_fix_json_content_strings(raw)]:
        if not attempt:
            continue
        try:
            data = json.loads(attempt)
            files = data.get("files")
            if isinstance(files, list) and len(files) > 0:
                result = [f for f in files if isinstance(f, dict) and f.get("path") and f.get("content") is not None]
                if result:
                    return result
        except json.JSONDecodeError as e:
            if attempt == raw:
                LOG.warning("Code Lab: JSON decode error at %s. Response snippet: %s", e, raw[:400])
        except Exception:
            pass

    # Fallback: parse --- FILE: path --- ... blocks (in case model echoed that format)
    file_blocks = re.findall(r"---\s*FILE:\s*([^\n-]+)\s*---\s*\n(.*?)(?=---\s*FILE:|\Z)", raw, re.DOTALL)
    if file_blocks:
        return [{"path": p.strip(), "content": c.strip()} for p, c in file_blocks if p.strip() and c.strip()]
    return None


def _try_fix_json_content_strings(raw: str) -> str:
    """Replace unescaped newlines inside "content": "..." values with \\n so JSON parses. Handles escaped quotes."""
    out = []
    i = 0
    while i < len(raw):
        key_match = re.search(r'"content"\s*:\s*"', raw[i:])
        if not key_match:
            out.append(raw[i:])
            break
        end_key = i + key_match.end()
        out.append(raw[i:end_key])
        j = end_key
        while j < len(raw):
            if raw[j] == "\\" and j + 1 < len(raw):
                j += 2
                continue
            if raw[j] == '"':
                # Only treat as closing quote if not escaped (even number of backslashes before it)
                k = j - 1
                backs = 0
                while k >= end_key and raw[k] == "\\":
                    backs += 1
                    k -= 1
                if backs % 2 == 0:
                    segment = raw[end_key:j]
                    segment = segment.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
                    out.append(segment)
                    out.append(raw[j])
                    i = j + 1
                    break
            j += 1
        else:
            break
    return "".join(out) if out else raw


def get_code_lab_artifact_path() -> Path:
    return Path(__file__).resolve().parent.parent / "generated" / "code-lab-scaffold.zip"


def get_code_lab_preview_html() -> str | None:
    """Extract the first HTML file from the generated zip for preview. Returns None if no zip or no HTML."""
    path = get_code_lab_artifact_path()
    if not path.is_file():
        return None
    try:
        with zipfile.ZipFile(path, "r") as zf:
            html_names = [n for n in zf.namelist() if n.lower().endswith(".html")]
            index = next((n for n in html_names if "index" in n.lower()), html_names[0] if html_names else None)
            name = index or (html_names[0] if html_names else None)
            if name:
                return zf.read(name).decode("utf-8", errors="replace")
    except Exception as e:
        LOG.warning("Code Lab preview: could not read zip: %s", e)
    return None


# Media types for preview asset serving
_CODE_LAB_MEDIA_TYPES = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


def get_code_lab_file_from_zip(file_path: str) -> tuple[bytes, str] | None:
    """Return (content, media_type) for a file in the generated zip, or None if not found. file_path is relative (e.g. styles.css)."""
    path = get_code_lab_artifact_path()
    if not path.is_file() or not file_path or file_path.startswith("/"):
        return None
    name = file_path.strip().lstrip("/").replace("\\", "/")
    if not name or ".." in name:
        return None
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            # Exact match first, then path that ends with name (e.g. css/styles.css for styles.css)
            candidate = None
            if name in names:
                candidate = name
            if not candidate:
                norm_name = name.lower()
                candidate = next((n for n in names if not n.endswith("/") and (n == name or n.lower().endswith("/" + norm_name))), None)
            if candidate:
                content = zf.read(candidate)
                ext = Path(candidate).suffix.lower()
                media_type = _CODE_LAB_MEDIA_TYPES.get(ext, "application/octet-stream")
                return (content, media_type)
            return None
    except Exception as e:
        LOG.warning("Code Lab serve file: %s", e)
        return None


def get_code_lab_zip_paths() -> list[str]:
    """Return list of file paths in the current code-lab zip (for terminal display). Empty if no zip."""
    path = get_code_lab_artifact_path()
    if not path.is_file():
        return []
    try:
        with zipfile.ZipFile(path, "r") as zf:
            return [n for n in zf.namelist() if not n.endswith("/")]
    except Exception as e:
        LOG.warning("Code Lab: could not list zip: %s", e)
        return []


def _get_code_lab_files_from_zip() -> list[dict] | None:
    """Read all files from the current code-lab zip. Returns [{"path": str, "content": str}, ...] or None."""
    path = get_code_lab_artifact_path()
    if not path.is_file():
        return None
    try:
        out = []
        with zipfile.ZipFile(path, "r") as zf:
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                content = zf.read(name).decode("utf-8", errors="replace")
                out.append({"path": name, "content": content})
        return out if out else None
    except Exception as e:
        LOG.warning("Code Lab: could not read zip for edit: %s", e)
        return None


CODE_LAB_EDIT_SYSTEM = """You are an expert developer. The user has an existing codebase below and wants one change. Output ONLY valid JSON—no markdown, no explanation.

Format: {"files": [{"path": "path/to/file.ext", "content": "full file content"}, ...]}

Rules:
- Return ONLY the files you need to change to fulfill the request. You may return 1 file (e.g. just index.html) or several. Other files are preserved automatically.
- Apply the user's request exactly. Change only what is needed; keep the rest of the file unchanged.
- Path must match the codebase (e.g. index.html, src/App.tsx). Content must be the COMPLETE file content after your edit.
- CRITICAL for valid JSON: In each "content" string, use the two characters backslash and n (\\\\n) for every newline. Use backslash-quote (\\\\") for any " inside the content. Do not put actual line breaks inside the JSON strings."""


CODE_LAB_CREATE_PAGE_SYSTEM = """You are an expert web engineer working on a Next.js / React-style project.

The user will tell you:
- The target file path (e.g. src/app/contact/page.tsx)
- A description of what that page or component should do and look like

Your job:
- Return ONLY the full source code for that ONE file, with no JSON, no markdown fences, and no surrounding explanation.
- Assume the project already has a standard React/Next.js setup; you DO NOT need to create package.json, tsconfig, or other files here.
- You MAY import from React / next/link / next/navigation and basic CSS modules or global styles, but avoid importing from files that may not exist unless the user explicitly mentions them.
- If the target path looks like a Next.js app route (e.g. src/app/contact/page.tsx), export a default React component that renders the requested UI.

Output requirements:
- Output ONLY the file content as plain text.
- Do NOT wrap in JSON.
- Do NOT include backticks, code fences, or commentary."""


def _code_lab_edit_system_with_design() -> str:
    """Code Lab edit system prompt + design skill so edits keep webpage design consistent."""
    design = get_design_skill_content()
    if design:
        return CODE_LAB_EDIT_SYSTEM + "\n\n---\n## Design guidelines (apply when editing HTML/CSS/webpages)\n\n" + design[:4000]
    return CODE_LAB_EDIT_SYSTEM


async def run_code_lab_edit(message: str, attachments: list[dict] | None = None) -> SharedWorkspace:
    """Apply user edit request to the current codebase: read zip, send to Nova, write updated zip.

    attachments: optional list of {"filename": str, "path": str} for uploaded assets (e.g. images).
    """
    state = await load_state()
    state.code_lab.status = AgentStatus.SYNCING
    await save_state(state)

    files = _get_code_lab_files_from_zip()
    if not files:
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        return state

    # Build context (cap so model has room to return full file(s)); single index.html is common
    max_context = 24000
    parts = []
    for f in files:
        path = f.get("path", "")
        content = (f.get("content") or "")[:10000]  # per-file cap
        parts.append(f"--- FILE: {path} ---\n{content}")
    codebase_text = "\n\n".join(parts)
    if len(codebase_text) > max_context:
        codebase_text = codebase_text[: max_context] + "\n\n... (truncated)"

    # If the user is asking to generate an image and place it in the UI, call Nova Canvas first.
    # Also surface any uploaded attachments (images) so Nova can place them.
    extras: list[str] = []

    prompt, color_hex = _extract_image_gen_from_message(message)
    if prompt:
        img = generate_code_lab_image(prompt, color_hex)
        if img:
            image_url = f"/api/agents/code-lab/image/{img.get('path')}"
            extras.append(
                f"- A new mock image has just been generated for this edit. Its URL is \"{image_url}\". "
                "If the user asked to place this image on a specific page/section, update the appropriate file so that this URL is used in an <img> tag (or equivalent) at the requested location, without breaking existing layout."
            )

    if attachments:
        image_ext = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        lines: list[str] = []
        for a in attachments:
            raw_path = (a.get("path") or "").strip()
            name = (a.get("filename") or "").strip() or raw_path
            if not raw_path:
                continue
            ext = Path(raw_path).suffix.lower()
            if ext not in image_ext:
                continue
            url = f"/api/agents/code-lab/image/{raw_path}"
            lines.append(f"  - {name}: {url}")
        if lines:
            extras.append(
                "Attached images available for this edit (URLs you can use in <img> tags):\n" + "\n".join(lines)
            )

    extra_instructions = ""
    if extras:
        extra_instructions = "\n\nAdditional instructions and assets for this edit:\n" + "\n".join(extras)

    user_content = f"Current codebase:\n\n{codebase_text}\n\nUser request: {message.strip()}{extra_instructions}"
    edit_system = _code_lab_edit_system_with_design()
    text = converse(edit_system, user_content, model_key="ingest", max_tokens=9999)
    files_spec = _parse_code_json(text) if text else None

    if not files_spec:
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        raise ValueError(
            "Edit could not be applied. The model returned invalid or incomplete code. "
            "Try rephrasing your request (e.g. 'Add a pricing section with 3 tiers' or 'Change the header background to blue')."
        )

    # Merge: keep all existing files, apply Nova's updates (so we never drop files Nova omitted)
    existing = {(f.get("path") or "").strip().lstrip("/"): f.get("content") or "" for f in files}
    for f in files_spec[:16]:
        path = (f.get("path") or "file.txt").strip().lstrip("/")
        content = f.get("content")
        if isinstance(content, str) and path:
            existing[path] = content

    out_path = get_code_lab_artifact_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for path, content in existing.items():
                if path:
                    zf.writestr(path, content)
        state.code_lab.generated_file_paths = list(existing.keys())
        LOG.info("Code Lab: edit applied, zip updated with %d files", len(existing))
    except Exception as e:
        LOG.warning("Code Lab: could not write zip after edit: %s", e)
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        raise ValueError("Edit could not be saved. Please try again.") from e

    state.code_lab.status = AgentStatus.COMPLETE
    await save_state(state)
    return state


async def run_code_lab_create_page(path: str, description: str) -> SharedWorkspace:
    """Generate a single new page/component file and write it into the Code Lab zip.

    This uses a simpler contract than run_code_lab_edit: Nova returns ONLY raw file
    contents (no JSON); we drop that into the zip at the requested path.
    """
    state = await load_state()
    state.code_lab.status = AgentStatus.SYNCING
    await save_state(state)

    target = (path or "").strip().lstrip("/")
    if not target:
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        raise ValueError("Path is required to create a page.")

    # Read existing files (if any) for light context and to preserve them when rewriting the zip.
    files = _get_code_lab_files_from_zip() or []
    existing = {(f.get("path") or "").strip().lstrip("/"): f.get("content") or "" for f in files}

    # Lightweight context: only list file paths so the model has a sense of structure.
    existing_paths = "\n".join(sorted(existing.keys())) if existing else "(none yet)"
    user = (
        f"Target file path: {target}\n\n"
        f"Description of what to build:\n{(description or '').strip()}\n\n"
        f"Existing files in this project (for context):\n{existing_paths}\n\n"
        "Generate the full source code for this one file now."
    )

    text = converse(
        CODE_LAB_CREATE_PAGE_SYSTEM,
        user,
        model_key="ingest",
        max_tokens=4096,
    )
    content = (text or "").lstrip()
    if not content or len(content.splitlines()) < 2:
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        raise ValueError("Page generation failed. The model did not return usable code.")

    # Merge: keep all existing files and add/overwrite the target path with new content.
    existing[target] = content

    out_path = get_code_lab_artifact_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p, c in existing.items():
                if p:
                    zf.writestr(p, c)
        state.code_lab.generated_file_paths = list(existing.keys())
        LOG.info("Code Lab: created/updated page %s (total files: %d)", target, len(existing))
    except Exception as e:
        LOG.warning("Code Lab: could not write zip after create-page: %s", e)
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        raise ValueError("Page could not be saved. Please try again.") from e

    state.code_lab.status = AgentStatus.COMPLETE
    await save_state(state)
    return state


async def run_code_lab_build(items: list[str], mode: str | None = None) -> SharedWorkspace:
    """Call Nova Pro to generate code files from plan/request, build zip, save artifact.

    mode:
      - "html": force a static HTML build with index.html + styles.css + script.js
      - anything else / None: default multi-file app mode
    """
    state = await load_state()
    state.code_lab.status = AgentStatus.SYNCING
    await save_state(state)

    if not DEMO_CODE_LAB or not items:
        state.code_lab.status = AgentStatus.COMPLETE
        await save_state(state)
        return state

    context = await get_venture_context(state)
    requirements = "\n".join(f"- {s}" for s in items if (s and isinstance(s, str)))
    user = f"Venture context:\n{context}\n\nBuild request (requirements):\n{requirements}"
    if (mode or "").lower() == "html":
        system = _code_lab_build_system_html_with_design()
    else:
        system = _code_lab_build_system_with_design()
    text = converse(system, user, model_key="ingest", max_tokens=9999)
    files_spec = _parse_code_json(text) if text else None

    if files_spec:
        out_path = get_code_lab_artifact_path()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        written_paths: list[str] = []
        try:
            with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in files_spec[:16]:  # cap at 16 files
                    path = (f.get("path") or "file.txt").strip().lstrip("/")
                    content = f.get("content")
                    if isinstance(content, str):
                        zf.writestr(path, content)
                        written_paths.append(path)
            state.code_lab.generated_file_paths = written_paths
            LOG.info("Code Lab: generated zip with %d files", len(files_spec))
        except Exception as e:
            LOG.warning("Code Lab: could not write zip: %s", e)
    state.code_lab.status = AgentStatus.COMPLETE
    await save_state(state)
    return state


# --- Finance Auditor (deterministic + Nova Lite critique) ---

FINANCE_CRITIQUE_SYSTEM = """You are a Shark Tank style finance critic. In 2-3 short sentences, give a direct, punchy critique of the burn rate and runway. Be specific and actionable. No preamble."""


async def run_finance_auditor() -> SharedWorkspace:
    state = await load_state()
    state.finance_auditor.status = AgentStatus.SYNCING
    await save_state(state)

    # Deterministic series (from Phase 2 style)
    series = [
        FinanceAuditorPoint(month="Month 1", burn=80_000, runway_months=18),
        FinanceAuditorPoint(month="Month 6", burn=95_000, runway_months=14),
        FinanceAuditorPoint(month="Month 12", burn=110_000, runway_months=9),
    ]

    if DEMO_FINANCE:
        context = await get_venture_context(state)
        user = f"Venture context:\n{context}\n\nBurn/runway projection: Month 1 burn 80k runway 18mo; Month 6 burn 95k runway 14mo; Month 12 burn 110k runway 9mo. Critique this."
        text = converse(FINANCE_CRITIQUE_SYSTEM, user, model_key="market", max_tokens=256)
        last_message = text.strip() if text else "Burn rate and runway projections updated."
        state.finance_auditor.last_message = last_message
        state.finance_auditor.series = series
        state.finance_auditor.status = AgentStatus.COMPLETE
        save_mock_response("run_finance_auditor", {"last_message": last_message, "series": [s.model_dump() for s in series]})
    else:
        try:
            data = load_mock_response("run_finance_auditor")
            state.finance_auditor.last_message = data.get("last_message") or "Burn rate and runway projections updated."
            state.finance_auditor.series = [FinanceAuditorPoint.model_validate(s) for s in data.get("series", [])] or series
            state.finance_auditor.status = AgentStatus.COMPLETE
        except FileNotFoundError:
            state.finance_auditor.last_message = "Burn rate and runway projections updated."
            state.finance_auditor.series = series
            state.finance_auditor.status = AgentStatus.COMPLETE

    await save_state(state)
    return state
