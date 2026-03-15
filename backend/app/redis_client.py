"""
Phase 2: Optional Redis for WebSocket/session state. Used when REDIS_URL is set.
"""
from __future__ import annotations

import logging
from typing import Optional

from redis.asyncio import Redis

from .config import REDIS_URL

LOG = logging.getLogger(__name__)

_redis: Optional[Redis] = None


def is_configured() -> bool:
    """True if Redis is configured (REDIS_URL set)."""
    return bool(REDIS_URL)


async def get_redis() -> Redis:
    """Return the global Redis client. Raises if REDIS_URL is not set."""
    global _redis
    if _redis is None:
        if not REDIS_URL:
            raise RuntimeError("REDIS_URL is not set")
        _redis = Redis.from_url(REDIS_URL, decode_responses=True)
        LOG.info("Redis client connected")
    return _redis


async def close_redis() -> None:
    """Close the Redis connection. Call on app shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        LOG.info("Redis client closed")
