# Phase 1: Toggle-to-Mock — Overview (Non-Technical)

**Audience:** Product, stakeholders, non-engineers  
**Project:** Founder's Flight Deck (backend)

---

## What Is Phase 1?

Phase 1 adds a **“demo mode”** to the backend so the product can be developed and demonstrated **without using paid cloud AI services** by default. The app can still switch to real AI when needed, and the experience for users (and the frontend) stays the same either way.

---

## Why It Matters

- **Cost control:** Development and demos can run on saved “snapshots” of AI responses instead of calling Amazon’s AI on every request, so AWS credits are conserved.
- **Reliability:** Demos and tests don’t depend on network or cloud availability when using saved data.
- **Same product experience:** Whether the backend uses real AI or saved data, the rest of the app and the user-facing behavior are designed to stay the same.

---

## What Changed (In Plain Terms)

1. **Configuration**  
   The backend now reads simple on/off switches (environment variables). By default, all are “off,” so the app uses saved data instead of calling the cloud.

2. **Saved responses**  
   When the team does use real AI, the backend can save that response into a local file. Next time, it can reuse that file instead of calling the cloud again.

3. **Document ingestion**  
   The “upload your document” flow (ingest) was refactored to support two paths:
   - **Saved-data path (default):** Uses a pre-prepared snapshot so uploads work without any cloud AI.
   - **Live path (when explicitly enabled):** Uses the real pipeline (today: placeholder; later: Amazon Nova) and can save the result for future use.

4. **Data shape**  
   A clear structure for “Venture DNA” (problem, solution, market, financials) was introduced so that both the saved-data path and the future live-AI path produce the same kind of output. That keeps the rest of the app and the frontend stable.

---

## How It’s Used

- **Normal development and demos:** No setup needed. The app uses saved data; no cloud AI is called.
- **When the team wants to refresh or capture new AI responses:** An administrator turns on the appropriate “demo” switch (e.g. for ingest). The backend then uses the real pipeline, saves the new response, and that file is used for future requests until the next refresh.

---

## Status

Phase 1 is **complete** for the ingest flow: configuration, mock storage, and document-ingest behavior are in place. The same pattern can be applied to other features (e.g. finance, code lab, virtual tank) in later phases.

---

## Next Phases (Context)

- **Phase 2:** Database and infrastructure (PostgreSQL, Redis, data models).
- **Phase 3:** Real document analysis with Amazon Nova and embeddings.
- **Phase 4–6:** Specialist orbs, Virtual Tank (voice), and security/deployment.

Phase 1 gives the foundation so all of these can optionally run against saved data to save cost and simplify demos.
