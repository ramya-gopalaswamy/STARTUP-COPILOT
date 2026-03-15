# Phase 1: Toggle-to-Mock — Technical README

**Audience:** Developers, DevOps  
**Scope:** Founder's Flight Deck backend — config, mock storage, ingest service refactor.

---

## 1. Purpose

Phase 1 introduces a **toggle-to-mock** pattern so the app can run **without calling AWS** (Bedrock/Nova) by default. When a DEMO flag is `true`, the real path runs (and persists responses to local mock files); when `false`, the mock path loads from those files. The **same Pydantic response shapes** are returned so the frontend contract never changes.

---

## 2. What Was Implemented

| Component | Location | Description |
|-----------|----------|-------------|
| Central config | `backend/app/config.py` | Environment-driven DEMO flags (default: all false). |
| Mock storage | `backend/app/services/mock_storage.py` | `save_mock_response()` / `load_mock_response()` for JSON (and optional audio). |
| Venture DNA schema | `backend/app/schemas.py` | Pydantic model `VentureDNA` (problem, solution, target_market, financials). |
| Ingest service | `backend/app/services/ingest_service.py` | `analyze_document(file, filename)` with real/mock branches and shared workspace builder. |
| Ingest router | `backend/app/routers/ingest.py` | Calls `analyze_document()`; response type remains `SharedWorkspace`. |
| Seed mock | `backend/data/mocks/analyze_document_latest.json` | Default mock so ingest works with no AWS. |

---

## 3. Environment Variables

All optional; unset or `false` means use mocks (no AWS).

| Variable | Type | Effect when `true` |
|----------|------|--------------------|
| `DEMO_GLOBAL` | bool | Overrides all per-feature flags to true (use real AWS everywhere). |
| `DEMO_INGEST` | bool | Ingest uses real path (placeholder until Nova 2 Pro in Phase 3) and saves to mocks. |
| `DEMO_FINANCE` | bool | Finance Auditor uses real path (Phase 4). |
| `DEMO_TANK` | bool | Virtual Tank uses real path (Phase 5). |
| `DEMO_CODE_LAB` | bool | Code Lab uses real path (Phase 4). |

Accepted truthy values: `true`, `1`, `yes` (case-insensitive).

**Example (mock ingest, default):**
```bash
# No env set — uses backend/data/mocks/analyze_document_latest.json
```

**Example (real ingest path, saves to mocks):**
```bash
export DEMO_INGEST=true
# Or: DEMO_GLOBAL=true to enable all real paths
```

---

## 4. Mock Storage Contract

- **Directory:** `backend/data/mocks/`
- **Naming:** `{function_name}_latest.json` (or `{function_name}_latest.audio` for binary).
- **Ingest:** `analyze_document_latest.json` — must be valid for `VentureDNA.model_validate(...)`.

**API:**

- `save_mock_response(function_name, data, kind="json")` — write JSON dict (or bytes for `kind="audio"`).
- `load_mock_response(function_name, kind="json")` — read; raises `FileNotFoundError` with a hint to run with the right `DEMO_*` set if the file is missing.

---

## 5. Ingest Flow

1. **Router** (`POST /api/ingest`): Reads file, calls `analyze_document(content, filename)`.
2. **Service** checks `DEMO_INGEST` (or `DEMO_GLOBAL`):
   - **True (real path):** Builds placeholder `VentureDNA`, calls `save_mock_response("analyze_document", venture_dna.model_dump())`, builds `SharedWorkspace` via `_venture_dna_to_shared_workspace()`, saves state, returns.
   - **False (mock path):** `load_mock_response("analyze_document")` → `VentureDNA.model_validate(data)` → same `_venture_dna_to_shared_workspace()` → save state, return.
3. **Response:** Always `SharedWorkspace` (unchanged frontend contract).

---

## 6. Extending to Other Features

Use the same pattern for Finance, Code Lab, Virtual Tank:

1. Add a service function (e.g. `finance_audit()`, `code_gen()`, `shark_response()`).
2. If `DEMO_*` or `DEMO_GLOBAL`: call real Bedrock, then `save_mock_response("<name>", ...)`.
3. Else: `load_mock_response("<name>")`, parse into the same Pydantic model, then return the same response shape.

---

## 7. Files Touched (Phase 1)

```
backend/app/config.py                    # New
backend/app/schemas.py                   # + VentureDNA
backend/app/services/__init__.py         # New
backend/app/services/mock_storage.py     # New
backend/app/services/ingest_service.py   # New
backend/app/routers/ingest.py            # Refactored to use service
backend/data/mocks/.gitkeep              # New
backend/data/mocks/analyze_document_latest.json  # New (seed)
```

---

## 8. Dependencies

No new runtime dependencies. Uses stdlib `os`, `json`, `pathlib` and existing FastAPI/Pydantic stack.
