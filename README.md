# Founder's Flight Deck (Startup Copilot)

Founder's Flight Deck is a bioluminescent deep-sea themed, agentic AI dashboard
for startup founders. It uses:

- A **Next.js 14** frontend with Tailwind CSS, Framer Motion, and Lucide React.
- A **FastAPI** backend with a JSON-backed SharedWorkspace (state) to simulate
  Amazon Nova 2 family agents via mock responses.

## Structure

- `backend/` – FastAPI service (`uvicorn app.main:app --reload`).
- `frontend/` – Next.js 14 app (`npm install && npm run dev`).

## Running locally

1. Backend:
   - `cd backend`
   - `pip install -r requirements.txt`
   - `uvicorn app.main:app --reload`

2. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

By default, the frontend runs at `http://localhost:3000` and talks to the
backend at `http://localhost:8000`.

