# Phase 4: Specialist Orb Agency — Technical README

**Audience:** Developers, DevOps  
**Scope:** All 5 Mission Control orbs powered by Nova + RAG context; DEMO_* flags per orb.

---

## 1. Purpose

Phase 4 wires each specialist orb to **real Nova calls** when the corresponding **DEMO_*** flag is True: **Market Intelligence** and **VC Scout** use RAG context (from mission_graph) plus **Nova 2 Lite**; **Asset Forge** and **Code Lab** use **Nova 2 Pro** for narrative and code blueprint; **Finance Auditor** uses deterministic burn/runway series plus **Nova 2 Lite** for Shark-style critique. When a flag is False, the orb loads from its mock file (same response shape so the frontend never breaks).

---

## 2. What Was Implemented

| Component | Location | Description |
|-----------|----------|-------------|
| Config | `backend/app/config.py` | `DEMO_MARKET`, `DEMO_VC_SCOUT`, `DEMO_ASSET_FORGE`, `DEMO_CODE_LAB`, `DEMO_FINANCE` (plus existing `DEMO_INGEST`, `DEMO_TANK`). |
| DB | `backend/app/db.py` | `get_mission_graph(workspace_id)` → venture_dna + founder_name for RAG context. |
| Context | `backend/app/services/context.py` | `get_venture_context(state)` → text summary from mission_graph (when workspace_id + DB) or from state. |
| Converse helper | `backend/app/services/nova_converse.py` | `converse(system_prompt, user_text, model_key=...)` → one Converse call, returns assistant text. |
| Orb services | `backend/app/services/orb_services.py` | `run_market_intel()`, `run_vc_scout()`, `run_asset_forge()`, `run_code_lab()`, `run_finance_auditor()`; each real path uses context + Nova, saves mock; mock path loads mock or applies default. |
| Agents router | `backend/app/routers/agents.py` | POST `/agents/{market-intel,asset-forge,vc-scout,code-lab,finance-auditor}/run` → calls corresponding orb service, returns `SharedWorkspace`. |
| Bedrock client | `backend/app/services/bedrock_client.py` | `is_any_real_path_enabled()` includes all DEMO_* orb flags. |

---

## 3. Environment Variables (Orb Flags)

| Variable | Orb | When True |
|----------|-----|-----------|
| `DEMO_MARKET` | Market Intelligence | Nova Lite + venture context → analysis; save to `run_market_intel_latest.json`. |
| `DEMO_VC_SCOUT` | VC Scout | Nova Lite + venture context → 3 VCs (JSON); save to `run_vc_scout_latest.json`. |
| `DEMO_ASSET_FORGE` | Asset Forge | Nova Pro + venture context → narrative flow; save to `run_asset_forge_latest.json`. |
| `DEMO_CODE_LAB` | Code Lab | Nova Pro + venture context → scaffold blueprint; save to `run_code_lab_latest.json`. |
| `DEMO_FINANCE` | Finance Auditor | Deterministic series + Nova Lite critique; save to `run_finance_auditor_latest.json`. |
| `DEMO_GLOBAL` | All | Overrides all per-feature flags to True. |

---

## 4. RAG Context Flow

1. **get_venture_context(state)**  
   If `state.workspace_id` is set and `db.is_configured()`: fetch `get_mission_graph(workspace_id)` and format `venture_dna` (problem, solution, target_market, financials) as text. Otherwise format from `state.market_gap` and `state.fundability_score`.

2. **Orb real path**  
   Call `get_venture_context(state)`, build user message with that context, call `converse(system_prompt, user_text, model_key)` (or Pro for Asset Forge / Code Lab), parse response, update state, `save_mock_response(function_name, delta)`.

3. **Orb mock path**  
   `load_mock_response(function_name)` and apply delta to state; on `FileNotFoundError` apply built-in defaults so the app works without any mock files.

---

## 5. Models Used Per Orb

| Orb | Model key | Model ID |
|-----|-----------|----------|
| Market Intelligence | `market` | Nova 2 Lite |
| VC Scout | `vc_scout` | Nova 2 Lite |
| Asset Forge | `ingest` | Nova 2 Pro |
| Code Lab | `ingest` | Nova 2 Pro |
| Finance Auditor | `market` | Nova 2 Lite |

See `MODEL_MAPPING` in `bedrock_client.py`.

---

## 6. Mock Files

- `backend/data/mocks/run_market_intel_latest.json`
- `backend/data/mocks/run_vc_scout_latest.json`
- `backend/data/mocks/run_asset_forge_latest.json`
- `backend/data/mocks/run_code_lab_latest.json`
- `backend/data/mocks/run_finance_auditor_latest.json`

Generated on first run with the corresponding `DEMO_*=true`. If missing and flag is false, orb services apply in-code defaults (no crash).

---

## 7. Dependencies

No new dependencies. Uses existing `boto3`, `asyncpg`, and app config/storage/schemas.

---

## 8. Status

Phase 4 is **complete**: all five orbs use Nova (Lite or Pro) with venture context where applicable, deterministic finance series plus Nova critique for Finance Auditor, and toggle-to-mock per orb via DEMO_* flags. Phase 5 (Virtual Tank) will add WebSocket binary + JSON, Nova Lite + Sonic, and barge-in.
