# Startup Copilot (Founder's Flight Deck)

**The AI workforce that turns any startup idea into a venture-ready pitch.**

Startup Copilot is an agentic AI platform that gives first-time and solo founders the full team they can't afford — a market analyst, pitch designer, investor matchmaker, technical architect, finance critic, and pitch coach — built entirely on the **Amazon Nova** family of foundation models.

Upload one document. Five coordinated AI agents go to work. Walk away investor-ready.

---

## Features

| Agent | What It Does | Nova Model |
|-------|-------------|------------|
| **Market Intelligence** | Full market report — TAM/SAM, competitors, opportunity gaps, interactive charts, follow-up Q&A | Nova 2 Lite + web search |
| **Asset Forge** | Professional pitch deck with AI-generated slide images and a cinematic pitch reel video with narrated voiceover | Nova Pro, Canvas, Reel, Polly |
| **VC Scout** | Curated investor shortlist matched by thesis, stage, and sector | Nova 2 Lite + web search |
| **Code Lab** | Technical blueprint, starter code scaffold, architecture diagrams | Nova Pro, Canvas |
| **Virtual Tank** | Real-time voice pitch practice with 3 AI sharks — bidirectional speech-to-speech | Nova 2 Sonic, Polly |

### Document Ingestion

Upload a PDF, DOCX, or plain text file. **Nova Pro** extracts structured Venture DNA (problem, solution, target market, financials) and **Nova Multimodal Embeddings** creates a vector representation. This shared context powers every agent downstream.

### Virtual Tank (Flagship)

Three AI sharks with distinct personalities challenge the founder in real time using **Nova 2 Sonic** bidirectional streaming. Each shark has a unique voice via **Amazon Polly**. Founders can speak naturally; sharks interrupt and push back — just like a real investor panel.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                            │
│   Login → Onboarding → Mission Control → Virtual Tank           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                    FastAPI Backend                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shared Venture DNA Workspace                 │   │
│  └────┬────────┬────────┬────────┬────────┬────────┬────────┘   │
│       │        │        │        │        │        │             │
│  ┌────▼──┐ ┌───▼───┐ ┌──▼──┐ ┌──▼──┐ ┌───▼───┐ ┌──▼───┐       │
│  │Market │ │Asset  │ │VC   │ │Code │ │Finance│ │Virtual│       │
│  │Intel  │ │Forge  │ │Scout│ │Lab  │ │Auditor│ │Tank   │       │
│  └───┬───┘ └─┬─┬─┬─┘ └──┬──┘ └─┬─┬─┘ └───┬───┘ └──┬────┘       │
│      │       │ │ │      │      │ │       │        │             │
└──────┼───────┼─┼─┼──────┼──────┼─┼───────┼────────┼─────────────┘
       │       │ │ │      │      │ │       │        │
  ┌────▼───┐ ┌─▼─┼─▼──┐ ┌▼──────▼─▼┐  ┌───▼───┐ ┌──▼─────┐
  │Nova 2  │ │Nova    │ │Nova 2    │  │Nova 2 │ │Nova 2  │
  │Lite    │ │Pro     │ │Lite      │  │Lite   │ │Sonic   │
  └────────┘ │Canvas  │ └──────────┘  └───────┘ └────────┘
             │Reel    │
             │Polly   │
             └────────┘
```

All agents share a unified **Venture DNA workspace** — extract once with Nova Pro, use everywhere.

---

## Amazon Nova Models Used

| Model | ID | Purpose |
|-------|----|---------|
| **Nova Pro** | `us.amazon.nova-pro-v1:0` | Document ingestion, pitch deck narrative, code blueprints |
| **Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` | Market analysis, VC matching, finance critique, tank logic |
| **Nova 2 Sonic** | `amazon.nova-2-sonic-v1:0` | Bidirectional speech-to-speech (Virtual Tank) |
| **Nova Canvas** | `amazon.nova-canvas-v1:0` | Slide images, architecture diagrams |
| **Nova Reel** | `amazon.nova-reel-v1:1` | Cinematic pitch reel video |
| **Nova Multimodal Embeddings** | `amazon.nova-2-multimodal-embeddings-v1:0` | Venture vector embeddings |

**Supporting AWS services:** Amazon Bedrock, Amazon Polly (neural TTS), Amazon S3.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Recharts, Lucide React |
| **Backend** | FastAPI, Python 3.12, Uvicorn, Pydantic, asyncpg |
| **AI/ML** | Amazon Bedrock, boto3, aws-sdk-bedrock-runtime (Sonic streaming) |
| **Database** | PostgreSQL + pgvector (optional), Redis (optional) |
| **Document Processing** | pypdf, python-docx, python-pptx |
| **Media Pipeline** | FFmpeg, Amazon Polly, ffmpeg-python |
| **Search** | DuckDuckGo (ddgs) — custom web search tool for agents |
| **Deployment** | Docker, Render (backend), Vercel (frontend) |

---

## Project Structure

```
STARTUP COPILOT/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, lifespan
│   │   ├── config.py            # Environment config, feature toggles
│   │   ├── routers/             # API routes (ingest, agents, state, virtual-tank)
│   │   ├── services/            # Agent logic, Nova integrations
│   │   │   ├── bedrock_client.py    # Bedrock client, model mapping
│   │   │   ├── nova_converse.py     # Nova Pro/Lite Converse wrapper
│   │   │   ├── nova_sonic.py        # Nova Sonic bidirectional streaming
│   │   │   ├── nova_canvas.py       # Nova Canvas image generation
│   │   │   ├── nova_reel.py         # Nova Reel video + Polly + FFmpeg pipeline
│   │   │   ├── nova_ingest.py       # Document → Venture DNA extraction
│   │   │   ├── orb_services.py      # All 5 agent orchestration logic
│   │   │   └── sonic_gateway.py     # Sonic WebSocket session manager
│   │   ├── schemas.py           # Pydantic models (SharedWorkspace, VentureDNA)
│   │   ├── db.py                # PostgreSQL + pgvector (optional)
│   │   └── storage.py           # File-based state fallback
│   ├── data/mocks/              # Saved mock responses for each agent
│   ├── Dockerfile
│   ├── requirements.txt
│   └── docker-compose.yml       # Local PostgreSQL
├── frontend/
│   ├── app/
│   │   ├── page.tsx                 # Login
│   │   ├── onboarding/              # Document upload
│   │   ├── mission-control/         # Agent hub (5 orb agents)
│   │   │   ├── market-intelligence/
│   │   │   ├── asset-forge/
│   │   │   ├── vc-scout/
│   │   │   ├── code-lab/
│   │   │   └── finance-auditor/
│   │   ├── virtual-tank/            # Voice pitch practice (Nova Sonic)
│   │   └── virtual-tank-test/       # Text-based tank fallback
│   ├── src/
│   │   ├── hooks/               # useNovaSonicStream, useSpeechInput, etc.
│   │   ├── context/             # SharedWorkspaceContext
│   │   ├── components/          # EnterTankButton, shared UI
│   │   └── lib/types/           # TypeScript types
│   ├── vercel.json
│   └── package.json
├── docs/                        # Phase overview and technical docs
├── render.yaml                  # Render Blueprint for backend deploy
├── DEPLOYMENT.md                # Full deployment guide
├── DEPLOY_NOW.md                # Quick-start deploy (Render + Vercel)
└── JUDGE_TEST_CREDENTIALS.md    # Instructions for judges to test the app
```

---

## Running Locally

### Prerequisites

- Python 3.12+
- Node.js 18+
- AWS credentials configured for Bedrock (SSO or IAM user keys)

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Configure environment (copy and edit):
```bash
cp .env.example .env
# Set AWS_PROFILE (for SSO) or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
# Set DEMO_GLOBAL=true to use real Nova (or individual DEMO_* flags)
```

Start the server:
```bash
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Optional: PostgreSQL

```bash
cd backend
docker compose up -d
```

Set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flightdeck` in `backend/.env`. Without this, the app uses file-based state (`state.json`).

---

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_PROFILE` | For local SSO | AWS SSO profile name (run `aws sso login` first) |
| `AWS_ACCESS_KEY_ID` | For deployment | IAM user access key (use on Render/production) |
| `AWS_SECRET_ACCESS_KEY` | For deployment | IAM user secret key |
| `AWS_REGION` | Yes | `us-east-1` (Bedrock region for Nova) |
| `DEMO_GLOBAL` | No | `true` = all agents use real Nova; `false` = all use mocks |
| `DEMO_INGEST` | No | Per-agent toggle for document ingestion |
| `DEMO_MARKET` | No | Per-agent toggle for Market Intelligence |
| `DEMO_VC_SCOUT` | No | Per-agent toggle for VC Scout |
| `DEMO_ASSET_FORGE` | No | Per-agent toggle for Asset Forge |
| `DEMO_CODE_LAB` | No | Per-agent toggle for Code Lab |
| `DEMO_FINANCE` | No | Per-agent toggle for Finance Auditor |
| `DEMO_TANK` | No | Per-agent toggle for Virtual Tank |
| `CORS_ORIGINS` | For deployment | Comma-separated frontend URLs (e.g. `https://app.vercel.app`) |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `S3_BUCKET` | No | S3 bucket for Nova Reel video output |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | For deployment | Backend API base URL (e.g. `https://backend.onrender.com/api`) |

---

## License

Built for the Amazon Nova Hackathon.
