"""
Phase 3: Nova 2 Pro (Venture DNA) and Nova Multimodal Embeddings (1024-dim).
Uses Bedrock Converse and InvokeModel. Call only when DEMO_INGEST is True.
"""
from __future__ import annotations

import json
import logging
import re
from typing import List

from ..schemas import VentureDNA
from .bedrock_client import NOVA_EMBEDDINGS_ID, NOVA_PRO_ID, get_bedrock_client

LOG = logging.getLogger(__name__)

VENTURE_DNA_SYSTEM = """You are an analyst extracting structured "Venture DNA" from founder documents (pitch decks, one-pagers).
Extract and return ONLY a single JSON object with these exact keys (no markdown, no explanation):
- "problem": string (one sentence)
- "solution": string (one sentence)
- "target_market": object with keys like "summary", "segment", "size" (strings or numbers)
- "financials": object with keys like "stage", "burn", "runway", "revenue" (strings or numbers)
- "founder_name": string or null (the founder's full name if mentioned in the document)
- "startup_name": string or null (the startup/company/product name if mentioned)

If something is missing, use null or empty object. Output nothing but the JSON."""

# Keep input small so Nova Pro responds in seconds; pitch decks rarely need more.
MAX_DOCUMENT_CHARS_FOR_VENTURE_DNA = 25_000


def extract_venture_dna_from_text(document_text: str) -> VentureDNA:
    """
    Call Nova 2 Pro via Converse API to extract Venture DNA from document text.
    Returns VentureDNA; on failure returns a minimal placeholder and logs.
    """
    if not document_text or not document_text.strip():
        return VentureDNA(problem="(No text extracted)", solution=None, target_market={}, financials={})
    try:
        client = get_bedrock_client()
        text_for_model = document_text.strip()[:MAX_DOCUMENT_CHARS_FOR_VENTURE_DNA]
        LOG.info("Nova Pro called: Venture DNA extraction model=%s (input len=%d)", NOVA_PRO_ID, len(text_for_model))
        response = client.converse(
            modelId=NOVA_PRO_ID,
            messages=[
                {"role": "user", "content": [{"text": text_for_model}]},
            ],
            system=[{"text": VENTURE_DNA_SYSTEM}],
            inferenceConfig={"maxTokens": 1024, "temperature": 0.2},
        )
        text = _get_converse_text(response)
        if not text:
            return _fallback_venture_dna()
        data = _parse_json_from_text(text)
        if data:
            LOG.info("Nova Pro Venture DNA OK: extracted problem/solution/target_market/financials")
            return VentureDNA(
                problem=data.get("problem"),
                solution=data.get("solution"),
                target_market=data.get("target_market") or {},
                financials=data.get("financials") or {},
                founder_name=data.get("founder_name"),
                startup_name=data.get("startup_name"),
            )
        return _fallback_venture_dna()
    except Exception as e:
        LOG.warning("Nova Pro Venture DNA extraction failed: %s", e)
        return _fallback_venture_dna()


def _get_converse_text(response: dict) -> str:
    try:
        output = response.get("output") or {}
        message = output.get("message") or {}
        content = message.get("content") or []
        for block in content:
            if "text" in block:
                return block["text"]
        return ""
    except Exception:
        return ""


def _parse_json_from_text(text: str) -> dict | None:
    text = text.strip()
    # Strip markdown code block if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _fallback_venture_dna() -> VentureDNA:
    return VentureDNA(
        problem="(Analysis unavailable)",
        solution=None,
        target_market={},
        financials={},
    )


def get_embedding(text: str, dimension: int = 1024) -> List[float]:
    """
    Call Nova Multimodal Embeddings for text. Returns list of floats (length = dimension).
    Truncates text to fit model limits. On failure returns empty list and logs.
    """
    if not text or not text.strip():
        return []
    # Model limit ~8K tokens; truncate to ~6K chars to be safe
    truncated = (text.strip()[:6000]) or " "
    try:
        client = get_bedrock_client()
        LOG.info("Nova Embeddings called: model=%s dimension=%d", NOVA_EMBEDDINGS_ID, dimension)
        body = {
            "taskType": "SINGLE_EMBEDDING",
            "singleEmbeddingParams": {
                "embeddingPurpose": "GENERIC_INDEX",
                "embeddingDimension": dimension,
                "text": {"truncationMode": "END", "value": truncated},
            },
        }
        response = client.invoke_model(
            modelId=NOVA_EMBEDDINGS_ID,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
        response_body = json.loads(response["body"].read())
        emb = response_body.get("embedding") or response_body.get("embeddings", [None])[0]
        if isinstance(emb, list) and len(emb) == dimension:
            LOG.info("Nova Embeddings OK: dimension=%d", dimension)
            return emb
        return []
    except Exception as e:
        LOG.warning("Nova embeddings failed: %s", e)
        return []
