"""
Custom web search tool for Nova. Used when org SCP denies bedrock:InvokeTool on amazon.nova_grounding.
DuckDuckGo (no API key) by default; optional SerpAPI via SERPAPI_API_KEY for richer results.
"""
from __future__ import annotations

import logging
import os
from typing import Any

LOG = logging.getLogger(__name__)

# Optional: set SERPAPI_API_KEY in .env for SerpAPI (Google results). Else DuckDuckGo is used.
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY")


def run_web_search(query: str, num_results: int = 8) -> list[dict[str, Any]]:
    """
    Run web search and return list of {title, url, snippet}.
    Uses DuckDuckGo (no key) or SerpAPI if SERPAPI_API_KEY is set.
    """
    query = (query or "").strip()
    num_results = max(1, min(15, int(num_results)))

    if SERPAPI_API_KEY:
        return _search_serpapi(query, num_results)
    return _search_duckduckgo(query, num_results)


def _search_duckduckgo(query: str, num_results: int) -> list[dict[str, Any]]:
    """DuckDuckGo-style text search via ddgs package (no API key)."""
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            LOG.warning("ddgs not installed; pip install ddgs")
            return _stub_results(query, num_results)

    try:
        results: list[dict[str, Any]] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=num_results):
                if not isinstance(r, dict):
                    continue
                results.append({
                    "title": (r.get("title") or "")[:500],
                    "url": (r.get("href") or r.get("url") or "")[:2048],
                    "snippet": (r.get("body") or r.get("snippet") or "")[:1000],
                })
        LOG.info("Web search (DuckDuckGo): query=%r results=%d", query[:80], len(results))
        return results
    except Exception as e:
        LOG.warning("DuckDuckGo search failed: %s", e)
        return _stub_results(query, num_results)


def _search_serpapi(query: str, num_results: int) -> list[dict[str, Any]]:
    """SerpAPI Google search (requires SERPAPI_API_KEY)."""
    try:
        import urllib.request
        import urllib.parse

        params = urllib.parse.urlencode({
            "engine": "google",
            "q": query,
            "num": num_results,
            "api_key": SERPAPI_API_KEY,
        })
        url = f"https://serpapi.com/search?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "StartupCopilot/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            import json as _json
            data = _json.loads(resp.read().decode())
        results = []
        for item in (data.get("organic_results") or [])[:num_results]:
            results.append({
                "title": (item.get("title") or "")[:500],
                "url": (item.get("link") or "")[:2048],
                "snippet": (item.get("snippet") or "")[:1000],
            })
        LOG.info("Web search (SerpAPI): query=%r results=%d", query[:80], len(results))
        return results
    except Exception as e:
        LOG.warning("SerpAPI search failed: %s", e)
        return _search_duckduckgo(query, num_results)


def _stub_results(query: str, num_results: int) -> list[dict[str, Any]]:
    """Fallback when search is unavailable."""
    return [
        {
            "title": "Web search unavailable",
            "url": "",
            "snippet": f"Configure duckduckgo-search (pip install duckduckgo-search) or SERPAPI_API_KEY for live results. Query was: {query[:200]}",
        }
    ]
