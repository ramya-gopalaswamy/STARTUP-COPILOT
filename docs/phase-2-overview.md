# Phase 2: Foundation and Data Infrastructure — Overview (Non-Technical)

**Audience:** Product, stakeholders, non-engineers  
**Project:** Founder's Flight Deck (backend)

---

## What Is Phase 2?

Phase 2 adds the **database and infrastructure** that the rest of the product will build on: a real database for app state and future AI data, optional Redis for real-time features, and a check that the team can reach Amazon’s AI models when needed.

---

## Why It Matters

- **Scalability:** Moving from a single file to a database allows multiple users and sessions and supports future growth.
- **Reliability:** A proper database and connection handling improve reliability and make it easier to run in production.
- **Readiness for AI:** The new “Mission Graph” table is set up so that in the next phase we can store and search over document-derived data (embeddings) for smarter, context-aware answers.
- **No breaking change:** If the database is not configured, the app still runs using the previous file-based state, so existing workflows keep working.

---

## What Changed (In Plain Terms)

1. **Configuration**  
   The backend can now be pointed at a PostgreSQL database and, optionally, a Redis instance via environment variables. If those are not set, it keeps using the existing file-based state.

2. **Database storage**  
   When a database is configured, the app stores the current “workspace” state there instead of in a file. The way the product behaves and the data it exposes to the frontend stay the same.

3. **New data structure (Mission Graph)**  
   A new table was added to hold “Mission Graph” data (e.g. founder and venture info, and space for future AI-generated summaries and embeddings). It will be used in the next phase for smarter document analysis and search.

4. **Redis**  
   Support for Redis was added so that later we can store real-time and session data (e.g. for the Virtual Tank) in a fast, dedicated store.

5. **Amazon AI access check**  
   The backend can now verify that it can reach the intended Amazon Nova AI models. This helps the team confirm setup and credentials before relying on AI in demos or production.

---

## How It’s Used

- **Local development (no database):** Run the app with no setup; it uses the file-based state. No database or Redis required.
- **Local development (with database):** When you’re ready to use Postgres, start the database with Docker (`cd backend && docker compose up -d`). The app reads the database URL from a local `backend/.env` file and then uses PostgreSQL for workspace state. No change is required in the frontend or in how users use the product.
- **Staging/production:** Set the database (and optionally Redis) via environment variables or the same `.env` pattern. The app switches to PostgreSQL and Redis when those are configured.

---

## Turning On the Database (When You’re Ready)

You can switch to Postgres anytime:

1. Start the database: from the `backend` folder, run `docker compose up -d` (requires Docker).
2. The app is already configured to read the database URL from `backend/.env`. Just start the backend as usual (`uvicorn app.main:app --reload`). On first use it will create the tables and use Postgres for state.

If you skip this, the app keeps using the file-based state with no extra setup.

---

## Status

Phase 2 is **complete**: database and optional Redis support are in place, the Mission Graph table exists, workspace state can live in PostgreSQL, and Bedrock model verification is available. Optional setup (Docker + `.env`) is documented so you can turn on Postgres when needed. The next phase (Phase 3) will use this foundation to add real document analysis and embeddings.
