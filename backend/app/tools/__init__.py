"""
Tools for Code Lab and other agents. Design skill is loaded by the Code Lab build flow
so Nova follows design guidelines when generating webpages.
"""
from __future__ import annotations

from pathlib import Path

DESIGN_SKILL_PATH = Path(__file__).resolve().parent / "design_skill.md"


def get_design_skill_content() -> str:
    """
    Load design_skill.md content for webpage/landing page generation.
    Used by the Code Lab agent when building webpages. Returns empty string if file missing.
    """
    try:
        if DESIGN_SKILL_PATH.is_file():
            return DESIGN_SKILL_PATH.read_text(encoding="utf-8", errors="replace").strip()
    except Exception:
        pass
    return ""
