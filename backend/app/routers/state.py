from fastapi import APIRouter

from ..schemas import SharedWorkspace
from ..services.orb_services import mask_mock_market_intel_for_api
from ..storage import load_state, save_state


router = APIRouter(prefix="/state", tags=["state"])


@router.get("", response_model=SharedWorkspace)
async def get_state() -> SharedWorkspace:
    """
    Return the current SharedWorkspace snapshot.
    When DEMO_MARKET is true, mock-sourced market intel is never returned (only Nova results).
    """
    state = await load_state()
    return mask_mock_market_intel_for_api(state)


@router.put("", response_model=SharedWorkspace)
async def update_state(payload: SharedWorkspace) -> SharedWorkspace:
    """
    Replace the SharedWorkspace snapshot.

    In practice most updates will go through agent-specific endpoints, but this
    gives the frontend a simple way to persist edits.
    """
    await save_state(payload)
    return payload

