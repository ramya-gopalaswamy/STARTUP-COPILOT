"""
Bedrock runtime client for Amazon Nova. Lazy init when DEMO_* or DEMO_GLOBAL is True.
Phase 2.3: verify access to Nova Pro, Lite, Sonic (and embeddings model).
Single source of truth for which model is used per feature.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from ..config import (
    AWS_PROFILE,
    AWS_REGION,
    DEMO_ASSET_FORGE,
    DEMO_CODE_LAB,
    DEMO_FINANCE,
    DEMO_GLOBAL,
    DEMO_INGEST,
    DEMO_MARKET,
    DEMO_VC_SCOUT,
)

LOG = logging.getLogger(__name__)

_client: Any = None  # boto3 bedrock-runtime client

# Single source of truth: feature -> model/inference profile id.
# Use inference profile IDs (us.amazon.*) so on-demand Converse works; raw model IDs can raise ValidationException.
# - ingest: Nova Pro (Bedrock) for document → Venture DNA
# - market / vc_scout / tank_logic: Nova 2 Lite (Bedrock)
# - vc_scout_act: Nova Act (your runtime; not on Bedrock)
# - tank_voice: Nova 2 Sonic (Bedrock) TTS — use raw ID if inference profile not available
# - embeddings: Nova 2 Multimodal Embeddings (Bedrock, 1024 dim)
MODEL_MAPPING = {
    "ingest": "us.amazon.nova-pro-v1:0",
    "market": "us.amazon.nova-2-lite-v1:0",
    "vc_scout": "us.amazon.nova-2-lite-v1:0",
    "vc_scout_act": "amazon.nova-act-v1:0",  # Draft emails to VCs (Nova Act; use your runtime)
    "tank_voice": "amazon.nova-2-sonic-v1:0",
    "tank_logic": "us.amazon.nova-2-lite-v1:0",
    "embeddings": "amazon.nova-2-multimodal-embeddings-v1:0",
    "pitch_reel": "amazon.nova-reel-v1:1",
}

# Backward-compatible names (point into MODEL_MAPPING)
NOVA_PRO_ID = MODEL_MAPPING["ingest"]
NOVA_LITE_ID = MODEL_MAPPING["market"]  # same as tank_logic, vc_scout
NOVA_SONIC_ID = MODEL_MAPPING["tank_voice"]
NOVA_EMBEDDINGS_ID = MODEL_MAPPING["embeddings"]


def get_model(feature: str) -> str:
    """Return Bedrock model id for a feature (e.g. 'ingest', 'market', 'vc_scout', 'tank_voice')."""
    return MODEL_MAPPING.get(feature, NOVA_LITE_ID)


def get_bedrock_client():
    """Return boto3 bedrock-runtime client. Lazy init; uses AWS_PROFILE if set (e.g. SSO)."""
    global _client
    if _client is None:
        try:
            import boto3
            session = boto3.Session(profile_name=AWS_PROFILE) if AWS_PROFILE else boto3.Session()
            _client = session.client("bedrock-runtime", region_name=AWS_REGION)
            LOG.info("Bedrock runtime client initialized (region=%s, profile=%s)", AWS_REGION, AWS_PROFILE or "default")
        except Exception as e:
            LOG.warning("Bedrock client init failed: %s", e)
            raise
    return _client


def is_any_real_path_enabled() -> bool:
    """True if any feature uses real AWS (so client may be needed)."""
    return bool(
        DEMO_GLOBAL
        or DEMO_INGEST
        or DEMO_MARKET
        or DEMO_VC_SCOUT
        or DEMO_ASSET_FORGE
        or DEMO_CODE_LAB
        or DEMO_FINANCE
    )


def verify_bedrock_models() -> dict[str, bool]:
    """
    Verify access to Nova Pro, Lite, Sonic. Returns dict of model_id -> True if
    accessible. Does not raise; logs and returns False for each failure.
    """
    result = {NOVA_PRO_ID: False, NOVA_LITE_ID: False, NOVA_SONIC_ID: False}
    try:
        client = get_bedrock_client()
    except Exception:
        LOG.warning("Cannot verify Bedrock models: client not available")
        return result

    for model_id in [NOVA_PRO_ID, NOVA_LITE_ID, NOVA_SONIC_ID]:
        try:
            # Minimal Converse API request to check model access
            client.converse(
                modelId=model_id,
                messages=[{"role": "user", "content": [{"text": "Hi"}]}],
                maxTokens=1,
            )
            result[model_id] = True
            LOG.info("Bedrock model OK: %s", model_id)
        except Exception as e:
            LOG.warning("Bedrock model %s not available: %s", model_id, e)
    return result
