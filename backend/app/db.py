"""
Phase 2: PostgreSQL (pgvector) connection and schema. MissionGraph + workspace_state.
Phase 3: insert_mission_graph for embeddings.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, List, Optional
from uuid import UUID

import asyncpg
from pgvector.asyncpg import register_vector
from pgvector import Vector

from .config import DATABASE_URL

LOG = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

INIT_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS mission_graph (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founder_name TEXT,
    venture_dna JSONB NOT NULL DEFAULT '{}',
    embedding vector(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspace_state (id, data, updated_at)
VALUES ('default', '{}', NOW())
ON CONFLICT (id) DO NOTHING;
"""


async def get_pool() -> asyncpg.Pool:
    """Return the global connection pool. Raises if DATABASE_URL is not set."""
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set")
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        await _init_schema(_pool)
    return _pool


async def _init_schema(pool: asyncpg.Pool) -> None:
    """Create extension and tables if they do not exist."""
    async with pool.acquire() as conn:
        await conn.execute(INIT_SQL)
    LOG.info("Database schema initialized (mission_graph, workspace_state)")


async def close_pool() -> None:
    """Close the global pool. Call on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        LOG.info("Database pool closed")


@asynccontextmanager
async def acquire() -> AsyncGenerator[asyncpg.Connection, None]:
    """Acquire a connection from the pool. Use only when DATABASE_URL is set."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


def is_configured() -> bool:
    """True if PostgreSQL is configured (DATABASE_URL set)."""
    return bool(DATABASE_URL)


async def insert_mission_graph(
    founder_name: Optional[str],
    venture_dna: Dict[str, Any],
    embedding: List[float],
) -> Optional[UUID]:
    """
    Insert a row into mission_graph with venture_dna (JSONB) and embedding (vector).
    Returns the new row id, or None if DB not configured or insert fails.
    """
    if not is_configured() or not embedding or len(embedding) != 1024:
        return None
    try:
        async with acquire() as conn:
            await register_vector(conn)
            row = await conn.fetchrow(
                """
                INSERT INTO mission_graph (founder_name, venture_dna, embedding)
                VALUES ($1, $2, $3)
                RETURNING id
                """,
                founder_name,
                asyncpg.types.JSONB(venture_dna),
                Vector(embedding),
            )
            return row["id"] if row else None
    except Exception as e:
        LOG.warning("insert_mission_graph failed: %s", e)
        return None


async def get_mission_graph(workspace_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch mission_graph row by id. Returns venture_dna dict and founder_name, or None.
    Used by Phase 4 RAG/context for orbs. workspace_id is the UUID string from state.
    """
    if not is_configured() or not workspace_id:
        return None
    try:
        uid = UUID(workspace_id)
    except (ValueError, TypeError):
        return None
    try:
        async with acquire() as conn:
            row = await conn.fetchrow(
                "SELECT venture_dna, founder_name FROM mission_graph WHERE id = $1",
                uid,
            )
            if not row:
                return None
            vd = row["venture_dna"]
            return {
                "venture_dna": vd if isinstance(vd, dict) else (dict(vd) if vd else {}),
                "founder_name": row["founder_name"],
            }
    except Exception as e:
        LOG.warning("get_mission_graph failed: %s", e)
        return None
