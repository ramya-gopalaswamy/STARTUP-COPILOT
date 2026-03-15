"""
Load/save SharedWorkspace. When DATABASE_URL is set uses PostgreSQL (workspace_state);
otherwise falls back to state.json. If DB is configured but unreachable, falls back to file.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Final

from .config import DATABASE_URL
from .db import acquire, is_configured
from .schemas import SharedWorkspace

LOG = logging.getLogger(__name__)


BASE_DIR: Final[Path] = Path(__file__).resolve().parent.parent
STATE_FILE: Final[Path] = BASE_DIR / "state.json"

WORKSPACE_ID_DEFAULT: Final[str] = "default"


def _default_state() -> SharedWorkspace:
    return SharedWorkspace()


def _load_state_file() -> SharedWorkspace:
    """Sync file load (used when DB not configured)."""
    if not STATE_FILE.exists():
        state = _default_state()
        STATE_FILE.write_text(state.model_dump_json(indent=2), encoding="utf-8")
        return state
    raw = STATE_FILE.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        state = _default_state()
        STATE_FILE.write_text(state.model_dump_json(indent=2), encoding="utf-8")
        return state
    return SharedWorkspace.model_validate(data)


def _save_state_file(state: SharedWorkspace) -> None:
    """Sync file save (used when DB not configured)."""
    STATE_FILE.write_text(state.model_dump_json(indent=2), encoding="utf-8")


async def load_state(workspace_id: str = WORKSPACE_ID_DEFAULT) -> SharedWorkspace:
    """Load SharedWorkspace from PostgreSQL (if configured) or state.json. Falls back to file if DB unreachable."""
    if is_configured():
        try:
            async with acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT data FROM workspace_state WHERE id = $1",
                    workspace_id,
                )
                if row and row["data"] is not None:
                    return SharedWorkspace.model_validate(row["data"])
                state = _default_state()
                await conn.execute(
                    """
                    INSERT INTO workspace_state (id, data, updated_at)
                    VALUES ($1, $2::jsonb, NOW())
                    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    workspace_id,
                    state.model_dump_json(),
                )
                return state
        except Exception as e:
            LOG.info("DB load_state failed (%s), falling back to state.json", e)
    return await asyncio.to_thread(_load_state_file)


async def save_state(
    state: SharedWorkspace,
    workspace_id: str = WORKSPACE_ID_DEFAULT,
) -> None:
    """Save SharedWorkspace to PostgreSQL (if configured) or state.json. Falls back to file if DB unreachable."""
    if is_configured():
        try:
            async with acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO workspace_state (id, data, updated_at)
                    VALUES ($1, $2::jsonb, NOW())
                    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    workspace_id,
                    state.model_dump_json(),
                )
            return
        except Exception as e:
            LOG.info("DB save_state failed (%s), falling back to state.json", e)
    await asyncio.to_thread(_save_state_file, state)
