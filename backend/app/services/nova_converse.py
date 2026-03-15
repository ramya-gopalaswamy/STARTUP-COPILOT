"""
Phase 4: Converse API helper for orbs. Single turn: system + user -> assistant text.
When web grounding is enabled, response can include citationsContent with citations (url, domain, title).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Iterator, List, Optional

from ..config import ALLOW_WEB_GROUNDING
from .bedrock_client import get_bedrock_client, get_model

LOG = logging.getLogger(__name__)

# Message shape for multi-turn: {"role": "user"|"assistant", "content": [{"text": "..."}]}
MessageDict = dict[str, Any]

# Type for a single source extracted from Converse citations (web grounding).
SourceDict = dict[str, Any]  # url?, domain?, title?

# Research step payload for SSE "research_step" event (type: reasoning | search | citation | done).
ResearchStepDict = dict[str, Any]


def _get_converse_text(response: dict) -> str:
    try:
        text, _ = _parse_converse_content(response)
        return text
    except Exception:
        return ""


def _parse_converse_content(response: dict) -> tuple[str, list[SourceDict]]:
    """
    Parse Converse API response: extract full text and (when present) citation sources.
    Content blocks can be: {"text": "..."} or {"citationsContent": {"content": [...], "citations": [...]}}.
    Citation can have location.web.url, location.web.domain; citation.title or citation.source.
    Returns (combined_text, list of unique sources with url, domain, title).
    """
    text_parts: list[str] = []
    sources: list[SourceDict] = []
    seen_urls: set[str] = set()

    try:
        output = response.get("output") or {}
        message = output.get("message") or {}
        content = message.get("content") or []
    except Exception:
        return "", []

    for block in content:
        if not isinstance(block, dict):
            continue
        if "text" in block:
            text_parts.append(block["text"] or "")
        if "citationsContent" in block:
            cc = block["citationsContent"] or {}
            for item in cc.get("content") or []:
                if isinstance(item, dict) and "text" in item:
                    text_parts.append(item.get("text") or "")
            for cit in cc.get("citations") or []:
                if not isinstance(cit, dict):
                    continue
                loc = cit.get("location") or {}
                web = loc.get("web") or {}
                url = web.get("url") or cit.get("source")
                if url and isinstance(url, str) and url not in seen_urls:
                    seen_urls.add(url)
                    domain = web.get("domain")
                    title = cit.get("title") or cit.get("source")
                    sources.append({
                        "url": url,
                        "domain": domain if isinstance(domain, str) else None,
                        "title": title if isinstance(title, str) else None,
                    })

    return "".join(text_parts), sources


def converse(
    system_prompt: str,
    user_text: str,
    model_key: str = "market",
    max_tokens: int = 1024,
    temperature: float = 0.3,
    enable_web_grounding: bool = False,
) -> Optional[str]:
    """
    One Converse call: system + user -> assistant text. Returns None on failure.
    model_key: 'market' | 'vc_scout' | 'ingest' (Pro) | 'tank_logic' etc.
    enable_web_grounding: if True, enable Nova Web Grounding (real-time web search + citations).
    """
    if not user_text.strip():
        return None
    effective_grounding = enable_web_grounding and ALLOW_WEB_GROUNDING
    try:
        client = get_bedrock_client()
        model_id = get_model(model_key)
        print(
            f"[Nova] Converse: model={model_id} feature={model_key} grounding={effective_grounding}",
            flush=True,
        )
        LOG.info(
            "Nova Converse called: model=%s feature=%s grounding=%s",
            model_id,
            model_key,
            effective_grounding,
        )
        kwargs = {
            "modelId": model_id,
            "messages": [{"role": "user", "content": [{"text": user_text[:32000]}]}],
            "system": [{"text": system_prompt[:8000]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        if effective_grounding:
            kwargs["toolConfig"] = {
                "tools": [{"systemTool": {"name": "nova_grounding"}}],
            }
        response = client.converse(**kwargs)
        out = _get_converse_text(response) or None
        if out:
            LOG.info("Nova Converse OK: feature=%s response_len=%d", model_key, len(out or ""))
        else:
            LOG.warning("Nova Converse returned empty text: feature=%s", model_key)
        return out
    except Exception as e:
        print(f"[Nova] Converse FAILED: {e}", flush=True)
        LOG.warning("Converse (%s) failed: %s", model_key, e)
        return None


def converse_multi_turn(
    system_prompt: str,
    messages: List[dict],
    model_key: str = "market",
    max_tokens: int = 1024,
    temperature: float = 0.3,
    enable_web_grounding: bool = False,
) -> Optional[str]:
    """
    Converse with a multi-turn messages array. Each message: {"role": "user"|"assistant", "content": [{"text": "..."}]}.
    Returns the assistant reply text or None on failure.
    """
    if not messages:
        return None
    effective_grounding = enable_web_grounding and ALLOW_WEB_GROUNDING
    try:
        client = get_bedrock_client()
        model_id = get_model(model_key)
        LOG.info(
            "Nova Converse (multi-turn): model=%s feature=%s messages=%d grounding=%s",
            model_id,
            model_key,
            len(messages),
            effective_grounding,
        )
        # Normalize: each content item must be {"text": str}; truncate per message if needed
        normalized = []
        for m in messages:
            role = m.get("role") or "user"
            content = m.get("content")
            if isinstance(content, list):
                text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and "text" in c]
                text = "".join(text_parts)[:32000]
            else:
                text = str(content or "")[:32000]
            if text.strip():
                normalized.append({"role": role, "content": [{"text": text}]})
        if not normalized:
            return None
        kwargs = {
            "modelId": model_id,
            "messages": normalized,
            "system": [{"text": system_prompt[:8000]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        if effective_grounding:
            kwargs["toolConfig"] = {
                "tools": [{"systemTool": {"name": "nova_grounding"}}],
            }
        response = client.converse(**kwargs)
        out = _get_converse_text(response) or None
        if out:
            LOG.info("Nova Converse multi-turn OK: feature=%s response_len=%d", model_key, len(out))
        return out
    except Exception as e:
        LOG.warning("Converse multi-turn (%s) failed: %s", model_key, e)
        return None


def converse_with_citations(
    system_prompt: str,
    user_text: str,
    model_key: str = "market",
    max_tokens: int = 1024,
    temperature: float = 0.3,
    enable_web_grounding: bool = False,
) -> tuple[Optional[str], list[SourceDict]]:
    """
    Same as converse() but returns (text, sources). When enable_web_grounding is True,
    sources are parsed from citationsContent (url, domain, title). Otherwise sources=[].
    """
    if not user_text.strip():
        return None, []
    effective_grounding = enable_web_grounding and ALLOW_WEB_GROUNDING
    try:
        client = get_bedrock_client()
        model_id = get_model(model_key)
        LOG.info(
            "Nova Converse (with citations): model=%s feature=%s grounding=%s",
            model_id,
            model_key,
            effective_grounding,
        )
        kwargs = {
            "modelId": model_id,
            "messages": [{"role": "user", "content": [{"text": user_text[:32000]}]}],
            "system": [{"text": system_prompt[:8000]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        if effective_grounding:
            kwargs["toolConfig"] = {
                "tools": [{"systemTool": {"name": "nova_grounding"}}],
            }
        response = client.converse(**kwargs)
        text, sources = _parse_converse_content(response)
        out = text.strip() or None
        if out:
            LOG.info(
                "Nova Converse OK: feature=%s response_len=%d sources=%d",
                model_key,
                len(out),
                len(sources),
            )
        return out, sources if effective_grounding else []
    except Exception as e:
        LOG.warning("Converse with citations (%s) failed: %s", model_key, e)
        return None, []


def converse_stream_chunks(
    system_prompt: str,
    user_text: str,
    model_key: str = "market",
    max_tokens: int = 1024,
    temperature: float = 0.3,
) -> Iterator[str]:
    """
    ConverseStream: yield text chunks as they arrive. No web grounding.
    Raises on API errors.
    """
    if not user_text.strip():
        return
    try:
        client = get_bedrock_client()
        model_id = get_model(model_key)
        LOG.info("Nova ConverseStream: model=%s feature=%s", model_id, model_key)
        kwargs = {
            "modelId": model_id,
            "messages": [{"role": "user", "content": [{"text": user_text[:32000]}]}],
            "system": [{"text": system_prompt[:8000]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        stream = client.converse_stream(**kwargs)
        for event in stream.get("stream", []):
            if not isinstance(event, dict):
                continue
            delta = (event.get("contentBlockDelta") or {}).get("delta") or {}
            text = delta.get("text")
            if text and isinstance(text, str):
                yield text
        LOG.info("Nova ConverseStream done: feature=%s", model_key)
    except Exception as e:
        LOG.warning("ConverseStream (%s) failed: %s", model_key, e)
        raise


def converse_research_stream(
    system_prompt: str,
    user_text: str,
    model_key: str = "market",
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> Iterator[ResearchStepDict]:
    """
    Run research phase with ConverseStream + web grounding; yield research_step payloads
    (reasoning, search, citation) for live UI, then a final step with type "done" and
    research_brief + sources. Only used when ALLOW_WEB_GROUNDING is True.
    Raises on API errors.
    """
    if not user_text.strip():
        return
    if not ALLOW_WEB_GROUNDING:
        return
    text_parts: list[str] = []
    sources: list[SourceDict] = []
    seen_urls: set[str] = set()

    try:
        client = get_bedrock_client()
        model_id = get_model(model_key)
        LOG.info("Nova ConverseStream (research): model=%s grounding=on", model_id)
        kwargs = {
            "modelId": model_id,
            "messages": [{"role": "user", "content": [{"text": user_text[:32000]}]}],
            "system": [{"text": system_prompt[:8000]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
            "toolConfig": {"tools": [{"systemTool": {"name": "nova_grounding"}}]},
        }
        stream = client.converse_stream(**kwargs)
        for event in stream.get("stream", []):
            if not isinstance(event, dict):
                continue
            # contentBlockStart: e.g. toolUse (search starting)
            start = (event.get("contentBlockStart") or {}).get("start") or {}
            tool_use = start.get("toolUse")
            if isinstance(tool_use, dict):
                name = tool_use.get("name") or "search"
                yield {"type": "search", "text": f"Using tool: {name}"}

            delta = (event.get("contentBlockDelta") or {}).get("delta") or {}
            # Reasoning (thinking)
            reasoning = delta.get("reasoningContent")
            if isinstance(reasoning, dict):
                # boto3: reasoningContent can have 'text' or reasoningText.text
                rtext = reasoning.get("text")
                if not rtext and "reasoningText" in reasoning:
                    rtext = (reasoning.get("reasoningText") or {}).get("text")
                if rtext and isinstance(rtext, str) and rtext.strip():
                    yield {"type": "reasoning", "text": rtext}
            # Tool use input (e.g. search query)
            tool_input = delta.get("toolUse")
            if isinstance(tool_input, dict):
                inp = tool_input.get("input")
                if isinstance(inp, str) and inp.strip():
                    yield {"type": "search", "text": inp[:500]}
                elif isinstance(inp, dict):
                    query = inp.get("query") or inp.get("search_query") or json.dumps(inp)[:500]
                    if query:
                        yield {"type": "search", "text": query}
            # Citation (source found)
            citation = delta.get("citation")
            if isinstance(citation, dict):
                title = citation.get("title") or ""
                source = citation.get("source") or ""
                loc = citation.get("location") or {}
                web = loc.get("web") or {}
                url = web.get("url") or source
                domain = web.get("domain")
                if url and isinstance(url, str) and url not in seen_urls:
                    seen_urls.add(url)
                    sources.append({
                        "url": url,
                        "domain": domain if isinstance(domain, str) else None,
                        "title": (title if isinstance(title, str) else None) or source or url,
                    })
                    yield {"type": "citation", "text": title or source or url, "url": url}
            # Output text (research brief)
            text = delta.get("text")
            if text and isinstance(text, str):
                text_parts.append(text)

        research_brief = "".join(text_parts).strip()
        yield {"type": "done", "research_brief": research_brief or None, "sources": sources}
        LOG.info("Nova research stream done: brief_len=%d sources=%d", len(research_brief), len(sources))
    except Exception as e:
        LOG.warning("ConverseStream research failed: %s", e)
        raise
