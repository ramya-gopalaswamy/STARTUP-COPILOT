# Phase 4: Specialist Orb Agency — Overview (Non-Technical)

**Audience:** Product, stakeholders, non-engineers  
**Project:** Founder's Flight Deck (backend)

---

## What Is Phase 4?

Phase 4 connects all **five Mission Control orbs** to **Amazon Nova**: when you run an orb, the backend can use the venture’s context (from the ingested document and Mission Graph) and call Nova to generate market analysis, VC suggestions, narrative and code blueprints, and a finance critique. Each orb can be switched between **real AI** and **saved mock responses** so you control cost and still get a consistent experience.

---

## Why It Matters

- **Smarter orbs:** Market Intelligence, VC Scout, Asset Forge, Code Lab, and Finance Auditor now use the actual venture context (problem, solution, market, financials) instead of fixed placeholder text.
- **One place to toggle:** Each orb has its own switch (e.g. turn on real Market Intel and VC Scout but keep others on mocks).
- **Same product experience:** Whether an orb uses real Nova or a mock, the data shape and UI stay the same.

---

## What Changed (In Plain Terms)

1. **Market Intelligence**  
   Uses venture context and Nova to produce a short analysis: market gap, competitor mention, and a pivot suggestion. You can turn this on with `DEMO_MARKET=true`.

2. **VC Scout**  
   Uses venture context and Nova to suggest three seed VCs (name, region, location). Results appear as pins and a short message. Turn on with `DEMO_VC_SCOUT=true`.

3. **Asset Forge**  
   Uses Nova Pro to generate a narrative flow and asset suggestions tailored to the venture. Turn on with `DEMO_ASSET_FORGE=true`.

4. **Code Lab**  
   Uses Nova Pro to suggest a technical blueprint (stack, features, Mission Control). Turn on with `DEMO_CODE_LAB=true`.

5. **Finance Auditor**  
   Keeps the same burn/runway projection and adds a Nova-generated, Shark Tank–style critique. Turn on with `DEMO_FINANCE=true`.

6. **Venture context**  
   When a document has been ingested and a workspace id exists, the backend pulls the venture’s “Mission Graph” data and passes it into each orb so responses are specific to that venture.

---

## How It’s Used

- **All mocks (default):** Leave all `DEMO_*` flags off. Each orb returns built-in or previously saved mock data. No AWS calls.
- **Real AI for some orbs:** Set only the flags you want (e.g. `DEMO_MARKET=true`, `DEMO_VC_SCOUT=true`). Those orbs call Nova and save their responses to mock files so you can switch back to mock later and still see the last real result.
- **All real:** Set `DEMO_GLOBAL=true` to turn on real Nova for every feature (ingest and all orbs).

---

## Turning On Real Orbs

1. Ensure AWS credentials are configured for Bedrock.
2. In `backend/.env` (or your environment), set the flags you want, for example:
   - `DEMO_MARKET=true`
   - `DEMO_VC_SCOUT=true`
   - `DEMO_ASSET_FORGE=true`
   - `DEMO_CODE_LAB=true`
   - `DEMO_FINANCE=true`
   Or set `DEMO_GLOBAL=true` to enable all.
3. Optional: run ingest first with a document and `DEMO_INGEST=true` (and `DATABASE_URL` if you want a workspace id). That fills the Mission Graph so orbs get venture-specific context.
4. Run the backend and trigger orbs from Mission Control; real orbs will call Nova and update state and mocks.

---

## Status

Phase 4 is **complete**: all five orbs are wired to Nova (Lite or Pro) with venture context, per-orb toggles are in place, and mock fallbacks keep the app working without AWS or mock files. Next is Phase 5 (Virtual Tank: real-time voice and barge-in).
