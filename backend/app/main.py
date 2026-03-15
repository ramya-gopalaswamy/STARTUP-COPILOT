import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, redis_client
from .config import (
    CORS_ORIGINS,
    DEMO_ASSET_FORGE,
    DEMO_CODE_LAB,
    DEMO_FINANCE,
    DEMO_INGEST,
    DEMO_MARKET,
    DEMO_TANK,
    DEMO_VC_SCOUT,
)
from .routers import agents, ingest, state, virtual_tank, virtual_tank_test

LOG = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"DEMO_INGEST={DEMO_INGEST} DEMO_MARKET={DEMO_MARKET} (real Nova when True)", flush=True)
    LOG.info("DEMO_INGEST=%s DEMO_MARKET=%s (real Nova when True)", DEMO_INGEST, DEMO_MARKET)
    yield
    if db.is_configured():
        await db.close_pool()
    if redis_client.is_configured():
        await redis_client.close_redis()


app = FastAPI(title="Founder's Flight Deck Backend", lifespan=lifespan)

# Allow frontend from localhost or 127.0.0.1 on any port (dev), plus production origins from env
_origin_list = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3003",
    "http://localhost:3004",
    "http://127.0.0.1:3004",
    "http://localhost:3005",
    "http://127.0.0.1:3005",
]
if CORS_ORIGINS:
    _origin_list.extend(o.strip() for o in CORS_ORIGINS.split(",") if o.strip())
origins = _origin_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


@app.get("/api/debug/demo-flags")
async def debug_demo_flags() -> dict:
    """Verify which DEMO_* flags are on. Real Nova is used when True."""
    return {
        "DEMO_INGEST": DEMO_INGEST,
        "DEMO_MARKET": DEMO_MARKET,
        "DEMO_VC_SCOUT": DEMO_VC_SCOUT,
        "DEMO_ASSET_FORGE": DEMO_ASSET_FORGE,
        "DEMO_CODE_LAB": DEMO_CODE_LAB,
        "DEMO_FINANCE": DEMO_FINANCE,
        "DEMO_TANK": DEMO_TANK,
    }


@app.get("/api/debug/nova-check")
async def debug_nova_check() -> dict:
    """Call Nova once to verify Bedrock/SSO works. Check backend terminal for [Nova] logs."""
    try:
        from .services.nova_converse import converse
        reply = converse(
            system_prompt="You are a test. Reply with exactly: OK",
            user_text="Say OK",
            model_key="market",
            max_tokens=10,
        )
        if reply:
            return {"nova_called": True, "response_preview": (reply.strip() or "")[:200]}
        return {"nova_called": True, "response_preview": None, "message": "Nova was invoked but returned no text (check backend logs)."}
    except Exception as e:
        return {"nova_called": False, "error": str(e)}


@app.get("/api/debug/polly-check")
async def debug_polly_check() -> dict:
    """Verify Polly is available (for Virtual Tank TTS). Uses same AWS credentials as the app."""
    try:
        from .config import AWS_REGION
        import boto3
        client = boto3.Session().client("polly", region_name=AWS_REGION)
        # DescribeVoices is a read-only check; synthesize_speech would confirm full access
        client.describe_voices(LanguageCode="en-US")
        # Optional: try a minimal synthesize to confirm polly:SynthesizeSpeech
        resp = client.synthesize_speech(
            Text="Hi",
            OutputFormat="mp3",
            VoiceId="Matthew",
            Engine="neural",
        )
        resp["AudioStream"].read()
        return {"polly_enabled": True, "message": "Polly is available (describe_voices + synthesize_speech OK)."}
    except Exception as e:
        return {"polly_enabled": False, "error": str(e)}


app.include_router(ingest.router, prefix="/api")
app.include_router(state.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(virtual_tank.router, prefix="/api")
app.include_router(virtual_tank_test.router, prefix="/api")

