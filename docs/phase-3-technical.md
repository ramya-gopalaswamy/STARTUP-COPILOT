# Phase 3: Intelligent Ingestion — Technical README

**Audience:** Developers, DevOps  
**Scope:** Nova 2 Pro document analysis, Venture DNA extraction, embeddings (pgvector), Health Score, workspace_id.

---

## 1. Purpose

Phase 3 replaces placeholder ingest with **real document analysis**: extract text from PDF/DOCX/TXT, call **Nova 2 Pro** for **Venture DNA** (problem, solution, target market, financials), compute **1024-dim embeddings** via Nova Multimodal Embeddings, store in **pgvector** when `DATABASE_URL` is set, and return **workspace_id** and **fundability_score** (Health Score). All of this runs only when **DEMO_INGEST** (or **DEMO_GLOBAL**) is True; otherwise the mock path loads from `analyze_document_latest.json`.

---

## 2. What Was Implemented

| Component | Location | Description |
|-----------|----------|-------------|
| Document extraction | `backend/app/services/document_extract.py` | `extract_text(file_bytes, filename)` for PDF (pypdf), DOCX (python-docx), TXT. |
| Nova ingest | `backend/app/services/nova_ingest.py` | `extract_venture_dna_from_text()` (Nova 2 Pro Converse), `get_embedding()` (Nova Multimodal Embeddings, 1024 dim). |
| Ingest service | `backend/app/services/ingest_service.py` | Real path: extract → Venture DNA → embedding → `insert_mission_graph()` when DB set → health score; sets `workspace_id`, `fundability_score`. |
| DB | `backend/app/db.py` | `insert_mission_graph(founder_name, venture_dna, embedding)` with pgvector; returns UUID. |
| Schemas | `backend/app/schemas.py` | `SharedWorkspace.workspace_id`, `SharedWorkspace.fundability_score`. |
| Model mapping | `backend/app/services/bedrock_client.py` | `MODEL_MAPPING`, `get_model(feature)`; ingest uses `ingest` / `embeddings` keys. |

---

## 3. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DEMO_INGEST` | If True (or `DEMO_GLOBAL` True), use real Nova 2 Pro + embeddings and save to mocks; if False, load from mocks. |
| `DEMO_GLOBAL` | If True, overrides all per-feature flags (including ingest). |
| `DATABASE_URL` | When set, ingest inserts into `mission_graph` and returns `workspace_id`; when unset, no insert, `workspace_id` remains None. |
| AWS credentials | Required for real path: Bedrock runtime (Nova Pro, Nova Multimodal Embeddings). Configure via env or `~/.aws/credentials`. |

---

## 4. Ingest Flow (Real Path, DEMO_INGEST=True)

1. **Extract text** — `document_extract.extract_text(file, filename)` (PDF/DOCX/TXT).
2. **Venture DNA** — `nova_ingest.extract_venture_dna_from_text(document_text)` via Nova 2 Pro Converse (JSON prompt for problem, solution, target_market, financials).
3. **Save mock** — `save_mock_response("analyze_document", venture_dna.model_dump())` so mock path can reuse the same shape.
4. **Embedding** — `nova_ingest.get_embedding(embedding_text, dimension=1024)` where `embedding_text` is derived from Venture DNA fields (same as stored concept).
5. **Mission Graph** — If `db.is_configured()` and embedding is 1024-dim: `db.insert_mission_graph(founder_name, venture_dna dict, embedding)`; returned UUID is `workspace_id`.
6. **Health score** — `_health_score_from_venture_dna(venture_dna)` → 0–100; set `state.fundability_score`.
7. **Response** — `SharedWorkspace` with `workspace_id` (when DB insert succeeded) and `fundability_score`; state persisted via `save_state(state)`.

---

## 5. Document Extraction

- **PDF:** `pypdf.PdfReader`, concatenate page text.
- **DOCX:** `python-docx.Document`, concatenate paragraph text.
- **TXT/MD:** UTF-8 decode with replace.
- Unsupported or empty → empty string; Venture DNA path then uses placeholder or Nova on truncated content.

---

## 6. Nova Models Used (Phase 3)

| Feature | Model ID | Use |
|---------|----------|-----|
| ingest | `amazon.nova-2-pro-v1:0` | Converse API: document text → Venture DNA JSON. |
| embeddings | `amazon.nova-2-multimodal-embeddings-v1:0` | InvokeModel: text → 1024-dim vector (SINGLE_EMBEDDING, GENERIC_INDEX). |

Both are in `MODEL_MAPPING` in `bedrock_client.py`; ingest code uses `NOVA_PRO_ID` and `NOVA_EMBEDDINGS_ID` (backed by that mapping).

---

## 7. mission_graph Insert (pgvector)

- `insert_mission_graph(founder_name, venture_dna: dict, embedding: list[float])`:
  - Returns `None` if `DATABASE_URL` unset or embedding length ≠ 1024.
  - Uses `pgvector.asyncpg.register_vector(conn)` then inserts into `mission_graph` (founder_name, venture_dna JSONB, embedding vector(1024)), returns `id` (UUID).
- Enables future RAG/similarity search in Phase 4+.

---

## 8. Health Score (fundability_score)

- Simple heuristic in `ingest_service._health_score_from_venture_dna()`: base 50, +10 for problem, +10 for solution, +15 for target_market (summary/segment), +15 for financials (stage/burn/runway/revenue); capped at 100.
- Stored on `SharedWorkspace.fundability_score` and returned in ingest and GET `/api/state`.

---

## 9. Dependencies Added (Phase 3)

- `pypdf` — PDF text extraction.
- `python-docx` — DOCX text extraction.

Already present from Phase 2: `boto3`, `asyncpg`, `pgvector`.

---

## 10. What You Need to Run Real Ingest

1. **AWS credentials** — For Bedrock (Nova 2 Pro, Nova 2 Multimodal Embeddings). Set `DEMO_INGEST=true` (or `DEMO_GLOBAL=true`) in `backend/.env` or environment.
2. **Optional: PostgreSQL** — For `workspace_id` and storing embeddings. If `DATABASE_URL` is set, each ingest inserts a row and returns its UUID as `workspace_id`. If unset, ingest still returns Venture DNA and fundability_score; `workspace_id` stays None.

---

## 11. Running Without Real Ingest (Mock)

Leave `DEMO_INGEST` and `DEMO_GLOBAL` unset or false. Ingest loads from `backend/data/mocks/analyze_document_latest.json`. Run once with `DEMO_INGEST=true` (and a real file upload) to generate that mock file if needed.
