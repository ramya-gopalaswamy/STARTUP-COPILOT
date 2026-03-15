"""
Central config: DEMO_* flags (toggle-to-mock) and Phase 2 infrastructure (DB, Redis).
Loads .env from backend directory when present.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Final, Optional

from dotenv import load_dotenv

# Load .env from backend directory (parent of app/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "false").lower()
    return raw in ("true", "1", "yes")


# When True, override all per-feature flags to True (use real AWS everywhere).
DEMO_GLOBAL: Final[bool] = _bool_env("DEMO_GLOBAL", False)

# Per-feature flags. When True = call real Bedrock and save response to mocks.
# When False = do not call AWS, load from mocks. DEMO_GLOBAL overrides all to True.
DEMO_INGEST: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_INGEST", False)
DEMO_MARKET: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_MARKET", False)
DEMO_VC_SCOUT: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_VC_SCOUT", False)
DEMO_ASSET_FORGE: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_ASSET_FORGE", False)
DEMO_CODE_LAB: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_CODE_LAB", False)
DEMO_FINANCE: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_FINANCE", False)
DEMO_TANK: Final[bool] = DEMO_GLOBAL or _bool_env("DEMO_TANK", False)

# AWS: use either SSO profile (recommended) or access keys in .env.
# For SSO: run `aws configure sso`, then set AWS_PROFILE to your profile name and run `aws sso login` before starting the backend.
AWS_PROFILE: Final[Optional[str]] = os.getenv("AWS_PROFILE") or None
# AWS region for Bedrock (required for Nova). Default us-east-1. (SSO region can differ from Bedrock region.)
AWS_REGION: Final[str] = os.getenv("AWS_REGION", "us-east-1").strip() or "us-east-1"
# When False, never use Nova web grounding (avoids AccessDeniedException if org SCP denies bedrock:InvokeTool on nova_grounding).
ALLOW_WEB_GROUNDING: Final[bool] = _bool_env("ALLOW_WEB_GROUNDING", True)
# When True (and ALLOW_WEB_GROUNDING is False), use custom web_search tool so Nova can still do deep research via Converse tool use.
USE_CUSTOM_WEB_SEARCH: Final[bool] = _bool_env("USE_CUSTOM_WEB_SEARCH", True)

# S3 bucket for Nova Reel video output (required for pitch reel generation).
S3_BUCKET: Final[Optional[str]] = os.getenv("S3_BUCKET") or None

# Phase 2: PostgreSQL and Redis. If unset, storage falls back to state.json and Redis is skipped.
DATABASE_URL: Final[Optional[str]] = os.getenv("DATABASE_URL") or None
REDIS_URL: Final[Optional[str]] = os.getenv("REDIS_URL") or None

# CORS: comma-separated list of allowed frontend origins for production (e.g. https://your-app.vercel.app).
# Required so judges can use the deployed frontend; leave empty for localhost-only.
CORS_ORIGINS: Final[str] = (os.getenv("CORS_ORIGINS") or "").strip()
