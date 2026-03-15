# Phase 2: Foundation and Data Infrastructure — Technical README

**Audience:** Developers, DevOps  
**Scope:** PostgreSQL (pgvector), Redis, MissionGraph schema, workspace_state, Bedrock client verification.

---

## 1. Purpose

Phase 2 moves persistent state from `state.json` to **PostgreSQL** when `DATABASE_URL` is set, adds the **MissionGraph** table (for RAG/embeddings in Phase 3), and introduces optional **Redis** and **Bedrock client** verification.

---

## 2. What Was Implemented

| Component | Location | Description |
|-----------|----------|-------------|
| Config | `backend/app/config.py` | `DATABASE_URL`, `REDIS_URL` (optional). |
| DB module | `backend/app/db.py` | asyncpg pool, `mission_graph` and `workspace_state` tables, pgvector extension. |
| Storage | `backend/app/storage.py` | Async `load_state()` / `save_state()`; use PG when `DATABASE_URL` set, else file. |
| Redis client | `backend/app/redis_client.py` | Optional Redis; `get_redis()`, `close_redis()` when `REDIS_URL` set. |
| Bedrock client | `backend/app/services/bedrock_client.py` | `get_bedrock_client()`, `verify_bedrock_models()` for Nova Pro/Lite/Sonic. |
| App lifespan | `backend/app/main.py` | Close DB pool and Redis on shutdown when configured. |

---

## 3. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/dbname`). If unset, storage uses `state.json`. |
| `REDIS_URL` | Redis connection string (e.g. `redis://localhost:6379/0`). Optional; used for WebSocket/session state in later phases. |

---

## 4. Database Schema

**Extension:** `CREATE EXTENSION IF NOT EXISTS vector;`

**mission_graph** (for Phase 3 RAG/embeddings):

- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `founder_name` TEXT
- `venture_dna` JSONB NOT NULL DEFAULT '{}'
- `embedding` vector(1024)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

**workspace_state** (current SharedWorkspace snapshot):

- `id` TEXT PRIMARY KEY DEFAULT 'default'
- `data` JSONB NOT NULL DEFAULT '{}'
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

Schema is applied automatically on first pool creation (`db.get_pool()`).

---

## 5. Storage Behavior

- **When `DATABASE_URL` is set:** `load_state()` / `save_state()` read/write the `data` column for `id = 'default'` in `workspace_state`. Connection is via asyncpg pool; first use creates the pool and runs `INIT_SQL`.
- **When `DATABASE_URL` is unset:** Same API, but backend uses `state.json` (async file I/O via `asyncio.to_thread`). No PostgreSQL required for local dev.

All routers and the ingest service use `await load_state()` and `await save_state()`.

---

## 6. Redis

- When `REDIS_URL` is set, `redis_client.get_redis()` returns an async Redis client (`redis.asyncio`). Connection is closed on app shutdown.
- Phase 2 does not yet use Redis in business logic; it is wired for Phase 5 (Virtual Tank session state).

---

## 7. Bedrock Verification

- `get_bedrock_client()`: Returns boto3 `bedrock-runtime` client (lazy init).
- `verify_bedrock_models()`: Calls Converse API for `amazon.nova-2-pro-v1:0`, `amazon.nova-2-lite-v1:0`, `amazon.nova-2-sonic-v1:0` and returns a dict of model_id -> True/False. Logs warnings on failure.

Embeddings model for Phase 3: `amazon.nova-2-multimodal-embeddings-v1:0` (dimension 1024).

---

## 8. Dependencies Added

- `asyncpg`
- `pgvector`
- `redis`
- `boto3`

Install: `pip install -r requirements.txt`

---

## 9. Setting Up PostgreSQL (Optional)

To use Postgres instead of `state.json`:

1. **Start Postgres with pgvector** (Docker):
   ```bash
   cd backend && docker compose up -d
   ```
   This runs `pgvector/pgvector:pg16` with database `flightdeck`, user `postgres`, password `postgres`, port `5432`.

2. **Configure the app**  
   The repo includes `backend/.env` with:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flightdeck
   ```
   The app loads `backend/.env` via `python-dotenv` in `config.py`. Do not commit `.env` (it is in `backend/.gitignore`).

3. **Run the backend**
   ```bash
   cd backend && uvicorn app.main:app --reload
   ```
   On first request that uses the DB, the pool is created and `INIT_SQL` runs (extension + tables). Workspace state is then read/written from `workspace_state`.

**Files added for this setup:**

- `backend/docker-compose.yml` — Postgres + pgvector service.
- `backend/.env` — `DATABASE_URL` (and optional `REDIS_URL`); not committed.
- `backend/.gitignore` — ignores `.env`, `state.json`, `.venv`, `__pycache__`.
- `python-dotenv` in `requirements.txt`; `config.py` calls `load_dotenv(backend/.env)`.

---

## 10. Running Without PostgreSQL

Leave `DATABASE_URL` unset (or omit `backend/.env`). The app uses `state.json` and does not open a DB connection. Redis is optional; leave `REDIS_URL` unset to skip it.
