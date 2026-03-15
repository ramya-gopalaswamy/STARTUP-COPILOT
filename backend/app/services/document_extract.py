"""
Extract plain text from uploaded PDF, DOCX, or TXT for Nova 2 Pro and embeddings.
"""
from __future__ import annotations

import io
from typing import Optional


def extract_text(file_bytes: bytes, filename: str) -> str:
    """
    Extract text from PDF, DOCX, or plain text. Returns empty string on failure or unsupported type.
    """
    suffix = (filename or "").lower().split(".")[-1] if "." in (filename or "") else ""
    if suffix == "pdf":
        return _extract_pdf(file_bytes)
    if suffix in ("docx", "doc"):
        return _extract_docx(file_bytes)
    if suffix in ("txt", "md", "text", ""):
        return _extract_plain(file_bytes)
    return _extract_plain(file_bytes)


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
        return "\n\n".join(parts) or ""
    except Exception:
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip()) or ""
    except Exception:
        return ""


def _extract_plain(data: bytes) -> str:
    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        return ""
