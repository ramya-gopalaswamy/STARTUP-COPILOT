"""
Toggle-to-mock: save/load raw JSON (or audio) to backend/data/mocks/[function_name]_latest.json.
Real path saves after Bedrock call; mock path loads instead of calling AWS.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final, Union

MOCKS_DIR: Final[Path] = (
    Path(__file__).resolve().parent.parent.parent / "data" / "mocks"
)


def _file_path(function_name: str, kind: str = "json") -> Path:
    if kind == "audio":
        return MOCKS_DIR / f"{function_name}_latest.audio"
    return MOCKS_DIR / f"{function_name}_latest.json"


def save_mock_response(
    function_name: str,
    data: Union[dict[str, Any], bytes],
    kind: str = "json",
) -> None:
    """Persist raw response after a real Bedrock call. Used by the real path."""
    path = _file_path(function_name, kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    if kind == "audio" and isinstance(data, bytes):
        path.write_bytes(data)
    else:
        if not isinstance(data, dict):
            raise TypeError("save_mock_response expects dict for kind='json'")
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_mock_response(
    function_name: str,
    kind: str = "json",
) -> Union[dict[str, Any], bytes]:
    """
    Load persisted response when using mock (no AWS). Used by the mock path.
    For kind='json', returns a dict. For kind='audio', returns bytes.
    If file is missing, raises FileNotFoundError with a message to run with DEMO_*=true first.
    """
    path = _file_path(function_name, kind)
    if not path.exists():
        raise FileNotFoundError(
            f"Mock file not found: {path}. "
            f"Run once with the corresponding DEMO_* env var set to true (e.g. DEMO_INGEST=true) to generate it."
        )
    if kind == "audio":
        return path.read_bytes()
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)
