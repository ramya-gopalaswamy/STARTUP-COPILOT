# Phase 3: Intelligent Ingestion — Overview (Non-Technical)

**Audience:** Product, stakeholders, non-engineers  
**Project:** Founder's Flight Deck (backend)

---

## What Is Phase 3?

Phase 3 adds **intelligent document ingestion**: when founders upload a pitch deck or one-pager (PDF, Word, or text), the app uses **Amazon Nova 2 Pro** to read the document and extract structured “Venture DNA” (problem, solution, target market, financials). It also creates a **vector representation** of that content and, when a database is configured, stores it and returns a **workspace id**. A simple **Health Score** (0–100) is computed from how complete the Venture DNA is and is shown as the **fundability score** in the app.

---

## Why It Matters

- **Smarter parsing:** Real AI extraction instead of placeholder data, so the rest of the product (orbs, Virtual Tank) can build on accurate venture context.
- **Search and RAG later:** The stored vectors (embeddings) allow future phases to do semantic search and retrieval over ingested content.
- **Clear signal:** The Health Score gives founders and the product a single, understandable metric tied to document completeness.
- **Same toggle as before:** Real AI runs only when you turn it on (`DEMO_INGEST` or `DEMO_GLOBAL`); otherwise the app uses saved mock data and spends no extra AWS credits.

---

## What Changed (In Plain Terms)

1. **Document handling**  
   The backend can extract text from PDFs, Word documents, and plain text so Nova can analyze the content.

2. **Venture DNA**  
   Nova 2 Pro reads the document and fills in structured fields: problem, solution, target market, and financials. This is the same “Venture DNA” shape the app already used; now it comes from the real document when the real path is on.

3. **Embeddings and workspace id**  
   When a database is configured, the app also turns the Venture DNA into a vector (embedding) and stores it. Each ingest gets a unique **workspace id** that can be used later for search and context.

4. **Health Score**  
   A 0–100 score is computed from how much of the Venture DNA was filled (problem, solution, market, financials). This is exposed as the **fundability score** in the workspace state and in the ingest response.

5. **Toggle behavior**  
   With the real path turned on, every ingest calls Nova and (if the database is set) writes to the Mission Graph. With it off, the app loads from the last saved mock so behavior stays consistent and costs are controlled.

---

## How It’s Used

- **Mock mode (default):** No AWS or database required. Ingest uses the last saved mock response; good for local dev and demos without credits.
- **Real ingest:** Set `DEMO_INGEST=true` (or `DEMO_GLOBAL=true`) and configure AWS credentials. Upload a document; the backend uses Nova 2 Pro and embeddings, saves the result to mocks, and optionally stores the embedding in the database and returns a workspace id and fundability score.
- **With database:** Set `DATABASE_URL` (e.g. via Docker and `backend/.env` as in Phase 2). Real ingest will then store embeddings and return a `workspace_id` in the response.

---

## Turning On Real Ingest

1. Ensure AWS credentials are configured for Bedrock (e.g. env or `~/.aws/credentials`).
2. In `backend/.env` (or your environment), set `DEMO_INGEST=true` (or `DEMO_GLOBAL=true`).
3. Optional: set `DATABASE_URL` and run Postgres (e.g. `docker compose up -d` in `backend`) if you want `workspace_id` and stored embeddings.
4. Start the backend and upload a document via the ingest endpoint; the response will include the full workspace state with `fundability_score` and, when the DB is set, `workspace_id`.

---

## Status

Phase 3 is **complete**: document extraction, Nova 2 Pro Venture DNA extraction, Nova Multimodal Embeddings (1024-dim), optional storage in `mission_graph`, Health Score as `fundability_score`, and `workspace_id` in the response are implemented and documented. All behavior remains behind the Phase 1 toggle (`DEMO_INGEST` / `DEMO_GLOBAL`). The next phase (Phase 4) will add specialist orb agency with RAG and Nova Pro/Lite.
