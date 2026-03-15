"""
Converse with custom tools so Nova can do web research without bedrock:InvokeTool on nova_grounding.
Used when ALLOW_WEB_GROUNDING is False (e.g. org SCP denies it). Nova invokes our web_search tool;
we run it in-process and return results as toolResult.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, List, Optional

from .bedrock_client import get_bedrock_client, get_model
from .web_search_tool import run_web_search

LOG = logging.getLogger(__name__)

# Bedrock Converse toolSpec for web_search (custom tool, no SCP).
WEB_SEARCH_TOOL_SPEC = {
    "name": "web_search",
    "description": "Search the public web for current market data. You MUST use this tool multiple times for proper research: run separate searches for market size, competitors, trends, and gaps. Each call returns real web results (title, url, snippet). Use specific queries and request 8-10 results per search.",
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Specific search query (e.g. 'luxury handbag market size 2024', 'SaaS SMB market share')"},
                "num_results": {"type": "integer", "description": "Number of results to return (5-12). Use 8 or 10 for thorough research.", "default": 8},
            },
            "required": ["query"],
        }
    },
}

# Source dict for UI: url, domain?, title?
SourceDict = dict[str, Any]
# Step callback: step = { "type": "search"|"citation"|"done", "text"?, "url"? }
StepCallback = Callable[[dict[str, Any]], None]


def _extract_text_and_tool_uses(response: dict) -> tuple[str, list[dict]]:
    """Parse Converse response: combined text and list of toolUse blocks."""
    text_parts: List[str] = []
    tool_uses: List[dict] = []
    try:
        content = (response.get("output") or {}).get("message") or {}
        content = content.get("content") or []
    except Exception:
        return "", []
    for block in content:
        if not isinstance(block, dict):
            continue
        if "text" in block:
            text_parts.append(block.get("text") or "")
        if "toolUse" in block:
            tool_uses.append(block["toolUse"])
    return "".join(text_parts), tool_uses


def converse_with_web_search_tool(
    system_prompt: str,
    user_text: str,
    model_key: str = "market",
    max_tokens: int = 2048,
    temperature: float = 0.3,
    step_callback: Optional[StepCallback] = None,
) -> tuple[Optional[str], List[SourceDict]]:
    """
    Multi-turn Converse where Nova can call custom web_search. Runs search in-process,
    returns (research_brief_text, sources). step_callback(step) is called for each search
    and citation so the UI can show live research flow.
    """
    if not user_text.strip():
        return None, []

    client = get_bedrock_client()
    model_id = get_model(model_key)
    tool_config = {"tools": [{"toolSpec": WEB_SEARCH_TOOL_SPEC}]}

    messages: List[dict] = [
        {"role": "user", "content": [{"text": user_text[:32000]}]},
    ]
    all_sources: List[SourceDict] = []
    seen_urls: set[str] = set()
    max_rounds = 10  # Allow many tool rounds for proper multi-query research

    for round_num in range(max_rounds):
        LOG.info("Converse with web_search tool round %d", round_num + 1)
        response = client.converse(
            modelId=model_id,
            system=[{"text": system_prompt[:8000]}],
            messages=messages,
            toolConfig=tool_config,
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
        )
        text, tool_uses = _extract_text_and_tool_uses(response)

        if not tool_uses:
            # Final answer
            out = text.strip() or None
            if out:
                LOG.info("Converse web_search done: text_len=%d sources=%d", len(out), len(all_sources))
            if step_callback:
                step_callback({"type": "done", "research_brief": out, "sources": all_sources})
            return out, all_sources

        # Build assistant message (model's turn with toolUse)
        assistant_content: List[dict] = []
        for tu in tool_uses:
            assistant_content.append({"toolUse": tu})

        messages.append({"role": "assistant", "content": assistant_content})

        # Run our tool(s) and build user toolResult message
        user_content: List[dict] = []
        for tu in tool_uses:
            name = (tu.get("name") or "").strip()
            tool_use_id = tu.get("toolUseId")
            inp = tu.get("input")
            if not isinstance(inp, dict):
                inp = {}

            if name == "web_search":
                query = (inp.get("query") or "").strip() or "market trends"
                num_results = max(5, min(12, int(inp.get("num_results") or 8)))
                if step_callback:
                    step_callback({"type": "search", "text": query})
                results = run_web_search(query, num_results=num_results)
                for r in results:
                    url = (r.get("url") or "").strip()
                    title = (r.get("title") or r.get("snippet") or url or "Source")[:500]
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        all_sources.append({"url": url, "title": title, "domain": None})
                    if step_callback and url:
                        step_callback({"type": "citation", "text": title, "url": url})
                user_content.append({
                    "toolResult": {
                        "toolUseId": tool_use_id,
                        "content": [{"json": {"query": query, "results": results}}],
                        "status": "success",
                    }
                })
            else:
                user_content.append({
                    "toolResult": {
                        "toolUseId": tool_use_id,
                        "content": [{"text": "Tool not available."}],
                        "status": "error",
                    }
                })

        messages.append({"role": "user", "content": user_content})

    # Max rounds reached; return whatever we have
    final_text = None
    if messages and messages[-1].get("role") == "assistant":
        # Last response might have text
        response = client.converse(
            modelId=model_id,
            system=[{"text": system_prompt[:8000]}],
            messages=messages,
            toolConfig=tool_config,
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
        )
        final_text, _ = _extract_text_and_tool_uses(response)
        final_text = (final_text or "").strip() or None
    if step_callback:
        step_callback({"type": "done", "research_brief": final_text, "sources": all_sources})
    return final_text, all_sources
