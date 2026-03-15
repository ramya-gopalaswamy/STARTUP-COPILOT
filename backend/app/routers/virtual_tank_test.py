"""
Virtual Tank TEST router -- Nova Sonic (STT + AI) + Polly (TTS) hybrid.

Single bidirectional WebSocket: browser streams mic PCM audio in,
Sonic handles speech recognition and AI response generation,
Polly synthesizes shark voices with distinct per-shark voices.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import boto3
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import AWS_PROFILE, AWS_REGION
from ..schemas import SharedWorkspace
from ..storage import load_state
from ..services.context import get_venture_context
from ..services.nova_sonic import SonicCallbacks, SonicSession
from ..services.bedrock_client import get_bedrock_client, get_model

LOG = logging.getLogger(__name__)

router = APIRouter(prefix="/virtual-tank", tags=["virtual-tank"])

POLLY_VOICES: dict[str, str] = {
    "hawk": "Matthew",
    "visionary": "Joanna",
    "tech-giant": "Stephen",
}

SONIC_SYSTEM_PROMPT_TEMPLATE = """You are simulating a Shark Tank-style investor pitch session. You play ALL three shark investors, taking turns. This should feel like a real conversation between {founder_name} and three distinct investors.

The founder's name is {founder_name}. ALWAYS call them {founder_name} — NEVER "founder" or "the founder".

The three sharks:
1. The Hawk (CFO) — Direct, practical. Cares about: business model, revenue plan, funding use, pricing.
2. The Visionary (Story Architect) — Curious, encouraging. Cares about: vision, market size, moat, founder story.
3. The Tech Giant (Scale Strategist) — Calm, constructive. Cares about: technical approach, defensibility, scalability.

TURN-BY-TURN SCRIPT — follow this EXACT order. WAIT for {founder_name} to respond after every question before the next shark speaks:

TURN 1 — [The Hawk]: Welcome {founder_name} and ask them to pitch. STOP and wait.
  ({founder_name} pitches)
TURN 2 — [The Visionary]: React to the pitch + ask ONE question about vision/market. STOP and wait.
  ({founder_name} answers)
TURN 3 — [The Tech Giant]: React + ask ONE question about tech/build approach. STOP and wait.
  ({founder_name} answers)
TURN 4 — [The Hawk]: React + ask ONE question about business model/money. STOP and wait.
  ({founder_name} answers)
TURN 5 — [The Visionary]: React + ask ONE follow-up question (moat, story, or differentiation). STOP and wait.
  ({founder_name} answers)
TURN 6 — [The Tech Giant]: React + ask ONE follow-up question (scalability, data, or defensibility). STOP and wait.
  ({founder_name} answers — THIS IS THE LAST ANSWER)
TURN 7 — [The Hawk]: ONLY say: "Thanks {founder_name}, we've heard enough. Time for our verdicts." Nothing else. No verdict yet.
TURN 8 — [The Visionary]: Verdict.
TURN 9 — [The Tech Giant]: Verdict.
TURN 10 — [The Hawk]: Verdict.

CRITICAL TIMING RULES:
- NEVER start verdicts while a shark is still asking a question. Verdicts come ONLY after {founder_name} has answered the LAST question (Turn 6).
- Turn 7 is ONLY the wrap-up announcement — no verdict, no question, just the signal.
- A shark must NEVER ask a question and give a verdict in the same response.
- NEVER combine the wrap-up with a verdict. They are separate turns.
- The Visionary speaks on turns 2, 5, 8. The Tech Giant speaks on turns 3, 6, 9. The Hawk speaks on turns 1, 4, 7, 10.

RULES:

1. PREFIX every response with the shark's name: [The Hawk], [The Visionary], or [The Tech Giant].

2. ONE SHARK per response. ONE QUESTION per turn. No compound questions.

3. REACT NATURALLY before asking: "That's interesting," "I like that," "That worries me a bit." One sentence reaction, then the question. This makes it conversational.

4. KEEP IT SHORT: 2 sentences max per question turn. 2-3 sentences max per verdict. This is spoken dialogue.

5. PRE-SEED: {founder_name} is pitching an IDEA — no product yet. Don't ask about revenue, users, CAC, LTV, or live metrics.

6. LISTEN: Reference something specific {founder_name} just said.

7. NO REPEATING: Every question must cover a new topic. Check the full conversation before speaking.

8. VERDICT RULES — THIS IS CRITICAL:
   - Each verdict is a SEPARATE response. You give ONE verdict per response, then STOP.
   - Each shark speaks ONLY for themselves. The Hawk NEVER announces The Visionary's or The Tech Giant's verdict. The Visionary NEVER announces another shark's verdict. Each shark says ONLY their own "I'm in" or "I'm out".
   - NEVER say "The Tech Giant is in" or "The Visionary says she's out" — that's narrating, not role-playing. Each shark speaks in FIRST PERSON only: "I'm in" or "I'm out".
   - NEVER deliver two or three verdicts in one response. ONE verdict, ONE shark, then STOP and let the next shark speak separately.
   - Once a shark has given their verdict, they are DONE. They NEVER speak again. No revisions, no follow-ups, no "on second thought". Their verdict is FINAL.
   - After all three verdicts have been given, the session is OVER. No more dialogue.
   - Each verdict must include:
     a. "I'm in" or "I'm out" with a specific reason from the conversation.
     b. What was strong, what needs work — reference {founder_name}'s own words.
     c. One actionable tip from their expertise (finance for Hawk, storytelling for Visionary, tech for Tech Giant).

YOUR VERY FIRST MESSAGE: [The Hawk] Welcome to the Tank, {founder_name}. Tell us what you're building, who it's for, and what's your ask.

{venture_context}"""


VERDICT_PROMPT_TEMPLATE = """You just finished a Shark Tank-style investor pitch session with {founder_name}. Now deliver the final verdicts based on EXACTLY what was discussed in the conversation below.

The three sharks:
1. The Hawk (CFO) — Focuses on business model, revenue, funding use.
2. The Visionary (Story Architect) — Focuses on vision, market size, moat.
3. The Tech Giant (Scale Strategist) — Focuses on technical feasibility, defensibility, scalability.

THE FULL CONVERSATION:
{conversation}

Generate exactly 3 verdicts, one per shark, in this EXACT order: The Hawk, The Visionary, The Tech Giant.
Each verdict MUST:
- Start with the shark's name in brackets: [The Hawk], [The Visionary], or [The Tech Giant]
- Say "I'm in" or "I'm out" with a specific reason tied to what {founder_name} actually said
- Call out what was strong and what needs work — quote or paraphrase {founder_name}'s own words
- End with one actionable tip from their expertise area
- Be 2-3 sentences, conversational tone (this will be spoken aloud)

Separate each verdict with exactly "---" on its own line."""


def _generate_verdicts_from_conversation(founder_name: str, conversation_log: list[dict]) -> list[str]:
    """Use Bedrock Converse API to generate verdicts based on the actual conversation."""
    convo_text = "\n".join(
        f"{'[' + m['shark'] + ']' if m['role'] == 'SHARK' else founder_name + ':'} {m['text']}"
        for m in conversation_log
    )
    prompt = VERDICT_PROMPT_TEMPLATE.format(
        founder_name=founder_name,
        conversation=convo_text,
    )
    client = get_bedrock_client()
    resp = client.converse(
        modelId=get_model("tank_logic"),
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 1024, "temperature": 0.7},
    )
    output_text = resp["output"]["message"]["content"][0]["text"]
    return [v.strip() for v in output_text.split("---") if v.strip()]


def _synthesize_polly(text: str, voice_id: str) -> bytes:
    """Synchronous Polly call — run in executor."""
    session = boto3.Session(profile_name=AWS_PROFILE) if AWS_PROFILE else boto3.Session()
    client = session.client("polly", region_name=AWS_REGION)
    resp = client.synthesize_speech(
        Text=text,
        OutputFormat="mp3",
        VoiceId=voice_id,
        Engine="neural",
    )
    return resp["AudioStream"].read()


@router.websocket("/ws-sonic")
async def sonic_ws(websocket: WebSocket) -> None:
    """
    Hybrid WebSocket:
    - Browser sends: binary PCM audio frames (16kHz, 16-bit, mono)
    - Browser receives:
        - text: {"type": "transcript", "role": "USER", "text": "...", "shark_id": "founder"}
        - text: {"type": "shark_speaking", "shark_id": "hawk"|"visionary"|"tech-giant", "text": "..."}
        - binary: MP3 audio from Polly
        - text: {"type": "shark_done"}
        - text: {"type": "session_end"}
    """
    await websocket.accept()
    LOG.info("Sonic WS connected (hybrid mode)")

    founder_name = websocket.query_params.get("founder_name") or "founder"

    state: SharedWorkspace = await load_state()
    venture_ctx = await get_venture_context(state, founder_name_override=founder_name)

    system_prompt = SONIC_SYSTEM_PROMPT_TEMPLATE.format(
        founder_name=founder_name,
        venture_context=f"Venture context:\n{venture_ctx}" if venture_ctx else "",
    )

    ws_lock = asyncio.Lock()
    conversation_log: list[dict] = []
    verdicts_delivered: set[str] = set()
    session_ref: list[Any] = [None]

    async def _ws_send_json(data: dict) -> None:
        try:
            async with ws_lock:
                await websocket.send_text(json.dumps(data))
        except Exception:
            pass

    async def _ws_send_bytes(data: bytes) -> None:
        try:
            async with ws_lock:
                await websocket.send_bytes(data)
        except Exception:
            pass

    async def _send_shark_with_polly(shark_id: str, clean_text: str) -> None:
        """Send shark transcript + Polly audio to the frontend."""
        await _ws_send_json({
            "type": "shark_speaking",
            "shark_id": shark_id,
            "text": clean_text,
        })
        polly_voice = POLLY_VOICES.get(shark_id, "Matthew")
        try:
            mp3_bytes = await asyncio.to_thread(_synthesize_polly, clean_text, polly_voice)
            await _ws_send_bytes(mp3_bytes)
        except Exception as e:
            LOG.warning("Polly TTS failed for %s: %s", shark_id, e)
        await _ws_send_json({"type": "shark_done"})

    async def on_text(role: str, text: str) -> None:
        """USER transcriptions from Sonic — forward immediately."""
        conversation_log.append({"role": "USER", "shark": "", "text": text})
        await _ws_send_json({
            "type": "transcript",
            "role": "USER",
            "text": text,
            "shark_id": "founder",
        })

    async def on_assistant_done(text: str) -> None:
        """Full ASSISTANT response — parse shark, send transcript, call Polly."""
        if len(verdicts_delivered) >= 3:
            return

        shark_id = _parse_shark_id(text)
        clean_text = _strip_shark_prefix(text)

        if not clean_text:
            return

        shark_display = {"hawk": "The Hawk", "visionary": "The Visionary", "tech-giant": "The Tech Giant"}.get(shark_id, "The Hawk")

        lower = clean_text.lower()
        is_verdict = ("i'm in" in lower or "im in" in lower or "i am in" in lower
                       or "i'm out" in lower or "im out" in lower or "i am out" in lower)

        if is_verdict and shark_id in verdicts_delivered:
            LOG.info("Duplicate verdict from %s — suppressing", shark_id)
            return

        conversation_log.append({"role": "SHARK", "shark": shark_display, "text": clean_text})

        if is_verdict:
            verdicts_delivered.add(shark_id)

        LOG.info("Shark %s says: %s", shark_id, clean_text[:80])
        await _send_shark_with_polly(shark_id, clean_text)

        if len(verdicts_delivered) >= 3:
            LOG.info("All 3 verdicts delivered — stopping Sonic and ending session")
            s = session_ref[0]
            if s and s.is_active:
                s.is_active = False
            await asyncio.sleep(1)
            await _ws_send_json({"type": "session_end"})
            return

        # Auto-trigger verdicts after the wrap-up announcement
        if not verdicts_delivered and ("verdict" in lower or "heard enough" in lower) and not is_verdict:
            LOG.info("Wrap-up detected — auto-triggering verdicts")
            s = session_ref[0]
            if s and s.is_active:
                await s.send_text("Go ahead with your verdicts.", role="USER")

    async def _deliver_remaining_verdicts() -> None:
        """Generate and deliver any missing verdicts based on the conversation."""
        if len(verdicts_delivered) >= 3:
            return
        if len(conversation_log) < 2:
            return

        LOG.info("Generating %d remaining verdict(s) from conversation", 3 - len(verdicts_delivered))
        try:
            raw_verdicts = await asyncio.to_thread(
                _generate_verdicts_from_conversation, founder_name, conversation_log
            )
            for verdict_text in raw_verdicts:
                shark_id = _parse_shark_id(verdict_text)
                if shark_id in verdicts_delivered:
                    continue
                clean = _strip_shark_prefix(verdict_text)
                if not clean:
                    continue
                verdicts_delivered.add(shark_id)
                LOG.info("Fallback verdict from %s: %s", shark_id, clean[:80])
                await _send_shark_with_polly(shark_id, clean)
        except Exception as e:
            LOG.error("Verdict generation failed: %s", e)

    async def on_end() -> None:
        await _deliver_remaining_verdicts()
        await _ws_send_json({"type": "session_end"})

    session = SonicSession(
        system_prompt=system_prompt,
        voice_id="matthew",
        suppress_sonic_audio=True,
        callbacks=SonicCallbacks(
            on_text=on_text,
            on_assistant_done=on_assistant_done,
            on_end=on_end,
        ),
    )

    session_ref[0] = session

    try:
        await session.start()
        LOG.info("Sonic session started — waiting before intro trigger")

        await asyncio.sleep(1.5)

        LOG.info("Sending intro trigger")
        await session.send_text(
            f"Hi, my name is {founder_name} and I'm ready to pitch.", role="USER"
        )
        LOG.info("Intro trigger sent")

        while session.is_active:
            try:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if "bytes" in msg and msg["bytes"]:
                    await session.send_audio(msg["bytes"])
                elif "text" in msg and msg["text"]:
                    try:
                        payload = json.loads(msg["text"])
                        if payload.get("type") == "text_input":
                            await session.send_text(payload.get("text", ""), role="USER")
                        elif payload.get("type") == "stop":
                            break
                    except json.JSONDecodeError:
                        pass
            except WebSocketDisconnect:
                break
            except Exception as e:
                LOG.warning("Sonic WS receive error: %s", e)
                break
    except Exception as e:
        LOG.error("Sonic session error: %s", e, exc_info=True)
    finally:
        await session.stop()
        try:
            await websocket.close()
        except Exception:
            pass
        LOG.info("Sonic WS disconnected")


def _parse_shark_id(text: str) -> str:
    t = text.strip().lower()
    if t.startswith("[the hawk]") or t.startswith("the hawk:"):
        return "hawk"
    if t.startswith("[the visionary]") or t.startswith("the visionary:"):
        return "visionary"
    if t.startswith("[the tech giant]") or t.startswith("the tech giant:"):
        return "tech-giant"
    if "hawk" in t[:40]:
        return "hawk"
    if "visionary" in t[:40]:
        return "visionary"
    if "tech giant" in t[:40]:
        return "tech-giant"
    return "hawk"


def _strip_shark_prefix(text: str) -> str:
    return re.sub(
        r"^\[?(The\s+)?(Hawk|Visionary|Tech\s+Giant)\]?[:\s]*",
        "", text, flags=re.IGNORECASE,
    ).strip()
