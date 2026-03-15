import asyncio
import base64
import json
import re
from typing import Any, AsyncIterator, List

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from ..schemas import SharkPersonaMessage, SharedWorkspace, VirtualTankState
from ..storage import load_state, save_state
from ..services.context import get_venture_context
from ..services.nova_converse import converse, converse_multi_turn
from ..config import DEMO_TANK, AWS_REGION

# Polly voice per shark (distinct voices for all three)
SHARK_VOICE_IDS: dict[str, str] = {
    "hawk": "Matthew",
    "visionary": "Joanna",
    "tech-giant": "Stephen",
}


router = APIRouter(prefix="/virtual-tank-test", tags=["virtual-tank-test"])


TANK_SYSTEM_PROMPT = """You are orchestrating a Shark Tank-style pitch with three AI investors.

IMPORTANT CONTEXT: This is a PRE-SEED funding round. The founder has NOT built the product yet — they are pitching an idea and vision. Do NOT ask about existing revenue, CAC, LTV, active users, or live metrics they wouldn't have yet. Instead focus on: the problem & pain point, the proposed solution, target market size, competitive landscape, founding team strength, go-to-market plan, how they plan to use the funding, and why NOW is the right time.

The three investors:
- The Hawk — CFO, focused on business model viability, projected unit economics, funding use, and path to first revenue. Tone: direct but fair. Asks practical questions a pre-seed founder can realistically answer.
- The Visionary — Story Architect, cares about the size of the outcome, moat, and category-defining potential. Tone: curious and encouraging, but wants bold answers.
- The Tech Giant — Scale Strategist, cares about technical feasibility, defensibility, and how the architecture will scale. Tone: calm, constructive.

You are given:
1. A venture context (which may include the founder's name, startup name, a market intelligence report with competitors, market gaps, and trends — USE this to ask informed, specific questions rather than generic ones).
2. The recent conversation transcript.

Rules:
- If the venture context includes "Founder name:", address the founder by their FIRST NAME occasionally (not every turn — roughly every 2nd or 3rd reply). This makes the conversation feel personal and natural. Example: "Interesting point, Ramya. Now tell me…"
- CRITICAL: Before generating your question, mentally review EVERY question already asked in the transcript. Your new question MUST be about a DIFFERENT topic or angle. If a shark already asked about go-to-market, do NOT ask about go-to-market again. If someone asked about competitors, do NOT ask about competitors again. Cover NEW ground each turn: problem validation, solution details, team, funding use, timeline, technical approach, distribution strategy, pricing, defensibility, etc.
- Pick the SINGLE most relevant shark for THIS moment and generate exactly ONE short follow-up question or reaction.
- Rotate: look at who spoke last in the transcript and prefer a DIFFERENT shark this time.
- Be constructive: acknowledge what the founder said before asking. Reference SPECIFIC things they just said, not generic platitudes.
- Questions should be answerable by a pre-seed founder who has done research but hasn't built yet.
- Output a JSON array with exactly one element: [{"shark_id": "hawk"|"visionary"|"tech-giant", "text": "..."}]
- Keep the message to 1–2 sentences max.
- No markdown, no extra commentary."""


async def _virtual_tank_stream(state: SharedWorkspace) -> AsyncIterator[SharkPersonaMessage]:
    """
    Emit a single welcome message from The Hawk to kick off the pitch session.
    Subsequent shark replies come through the /turn endpoint.
    """
    name = state.virtual_tank.founder_name
    if name:
        welcome = f"Welcome to the Tank, {name}. Tell us what you're building, who it's for, and what's your ask. You may begin."
    else:
        welcome = "Welcome to the Tank. Tell us what you're building, who it's for, and what's your ask. You may begin."
    yield SharkPersonaMessage(
        shark_id="hawk",
        display_name="The Hawk",
        role="CFO",
        color="#FF8100",
        text=welcome,
    )


@router.websocket("/ws")
async def virtual_tank_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    founder_name = websocket.query_params.get("founder_name") or None

    state: SharedWorkspace = await load_state()
    state.virtual_tank = VirtualTankState(active=True, last_messages=[], founder_name=founder_name)
    await save_state(state)

    try:
        async for msg in _virtual_tank_stream(state):
            # Append to state so Mission Control / replay can read latest shark messages
            state = await load_state()
            state.virtual_tank.last_messages.append(msg)
            await save_state(state)
            await websocket.send_text(msg.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        state = await load_state()
        state.virtual_tank.active = False
        await save_state(state)
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/sonic-ws")
async def virtual_tank_sonic_ws(websocket: WebSocket) -> None:
    """
    Full speech-to-speech: client sends mic audio (JSON { "audio": "<base64>" } or binary);
    server streams Sonic (Nova 2) audio + transcript back. Requires DEMO_TANK=true and
    aws_sdk_bedrock_runtime (Python 3.12+).
    """
    await websocket.accept()

    if not DEMO_TANK:
        await websocket.send_text(
            json.dumps({"type": "error", "text": "Speech-to-speech requires DEMO_TANK=true."})
               )
        await websocket.close()
        return

    state: SharedWorkspace = await load_state()
    venture = await get_venture_context(state)

    output_queue: asyncio.Queue = asyncio.Queue()

    def on_output(kind: str, audio_b64: str | None, text: str | None) -> None:
        output_queue.put_nowait((kind, audio_b64, text))

    try:
        from ..services.sonic_gateway import SonicSession, _resample_linear
    except ImportError:
        await websocket.send_text(
            json.dumps({
                "type": "error",
                "text": "Sonic gateway not available. Install aws_sdk_bedrock_runtime (Python 3.12+).",
            })
        )
        await websocket.close()
        return

    session = SonicSession(venture_context=venture, on_output=on_output)
    err = await session.start()
    if err:
        await websocket.send_text(json.dumps({"type": "error", "text": err}))
        await websocket.close()
        return

    async def send_outputs() -> None:
        while True:
            kind, audio_b64, text = await output_queue.get()
            if kind == "_done":
                break
            msg = json.dumps({"type": kind, "audio": audio_b64, "text": text})
            await websocket.send_text(msg)

    send_task = asyncio.create_task(send_outputs())

    try:
        while True:
            try:
                raw = await websocket.receive()
            except Exception:
                break
            if "text" in raw:
                try:
                    data = json.loads(raw["text"])
                except Exception:
                    continue
                audio_b64 = data.get("audio")
                if audio_b64:
                    sr = data.get("sampleRate", 16000)
                    if sr != 16000:
                        try:
                            pcm = base64.b64decode(audio_b64)
                            pcm_16k = _resample_linear(pcm, sr, 16000)
                            audio_b64 = base64.b64encode(pcm_16k).decode("ascii")
                        except Exception:
                            pass
                    await session.send_audio(audio_b64, input_sample_rate=16000)
                if data.get("endTurn"):
                    await session.end_audio_turn()
            elif "bytes" in raw:
                try:
                    audio_b64 = base64.b64encode(raw["bytes"]).decode("ascii")
                    await session.send_audio(audio_b64)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        await session.close()
        send_task.cancel()
        try:
            await send_task
        except asyncio.CancelledError:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


@router.post("/tts")
async def virtual_tank_tts(body: dict) -> Response:
    """
    Synthesize speech for a shark line (Polly). Body: { "text": "...", "voice_id": "Matthew" }
    or voice_id can be shark_id (hawk -> Matthew, visionary -> Joanna, tech-giant -> Justin).
    Returns audio/mpeg.
    """
    text = (body.get("text") or "").strip()[:3000]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    voice_id = str(body.get("voice_id") or "Matthew").strip()
    voice_id = SHARK_VOICE_IDS.get(voice_id.lower(), voice_id)
    try:
        import boto3
        client = boto3.Session().client("polly", region_name=AWS_REGION)
        resp = client.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice_id,
            Engine="neural",
        )
        audio_bytes = resp["AudioStream"].read()
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")


FILLER_RE = re.compile(r"\b(um+|uh+|like)\b", re.IGNORECASE)


@router.post("/turn")
async def virtual_tank_turn(body: dict) -> Any:
    """
    One text turn from the founder. Updates filler metrics and appends shark
    replies to the virtual tank transcript using Nova multi-turn.
    Returns state plus new_shark_messages (for TTS playback when voice is on).
    """
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    state: SharedWorkspace = await load_state()
    vt = state.virtual_tank

    incoming_name = str(body.get("founder_name") or "").strip()
    if incoming_name and not vt.founder_name:
        vt.founder_name = incoming_name

    vt.metrics.user_utterances.append(text)
    vt.metrics.filler_count += len(FILLER_RE.findall(text))

    DECISION_AFTER_TURNS = 6
    turn_count = len(vt.metrics.user_utterances)
    ready_for_decision = turn_count >= DECISION_AFTER_TURNS

    new_shark_messages: List[SharkPersonaMessage] = []

    founder_label = vt.founder_name or "Founder"

    if ready_for_decision:
        closing_text = (
            f"Thank you for your pitch, {vt.founder_name}. We've heard enough. Give us a moment to deliberate and we'll share our verdicts."
            if vt.founder_name
            else "Thank you for your pitch. We've heard enough. Give us a moment to deliberate and we'll share our verdicts."
        )
        closing = SharkPersonaMessage(
            shark_id="hawk",
            display_name="The Hawk",
            role="CFO",
            color="#FF8100",
            text=closing_text,
        )
        vt.last_messages.append(closing)
        new_shark_messages.append(closing)
    else:
        recent_msgs = vt.last_messages[-8:]
        transcript_lines: List[str] = []
        for m in recent_msgs:
            transcript_lines.append(f"{m.display_name}: {m.text}")
        transcript_lines.append(f"{founder_label}: {text}")
        transcript = "\n".join(transcript_lines[-12:])

        already_asked = []
        for m in vt.last_messages:
            if m.shark_id in ("hawk", "visionary", "tech-giant"):
                already_asked.append(f"- {m.display_name}: \"{m.text}\"")
        already_asked_str = "\n".join(already_asked) if already_asked else "(none yet)"

        venture = await get_venture_context(state)
        user = (
            f"Venture context:\n{venture}\n\n"
            "Recent tank transcript:\n"
            f"{transcript}\n\n"
            f"ALL questions asked so far (DO NOT repeat ANY of these):\n{already_asked_str}\n\n"
            f"The founder ({founder_label}) just said the last line above. Pick the SINGLE most relevant shark "
            "for this moment (rotate — avoid repeating whoever spoke last). Generate exactly "
            "ONE short follow-up about a COMPLETELY DIFFERENT topic than any question listed above. "
            f"Acknowledge what {founder_label} said, then ask something new. "
            "Output a JSON array with one element: "
            '[{"shark_id": "hawk"|"visionary"|"tech-giant", "text": "..."}].'
        )

        replies_text = converse_multi_turn(
            TANK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": [{"text": user[:32000]}]}],
            model_key="tank_logic",
            max_tokens=512,
            temperature=0.5,
            enable_web_grounding=False,
        )

        replies: List[dict] = []
        if replies_text:
            cleaned = replies_text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            try:
                replies = json.loads(cleaned)
                if not isinstance(replies, list):
                    replies = []
            except Exception as e:
                print(f"[TANK /turn] JSON parse failed: {e}\nRaw text: {replies_text[:500]}")
                replies = []
        else:
            print(f"[TANK /turn] converse_multi_turn returned empty/None")

        for rep in replies:
            sid = rep.get("shark_id") or ""
            if sid == "hawk":
                display_name = "The Hawk"
                role = "CFO"
                color = "#FF8100"
            elif sid == "visionary":
                display_name = "The Visionary"
                role = "Story Architect"
                color = "#7523FF"
            else:
                display_name = "The Tech Giant"
                role = "Scale Strategist"
                color = "#00FFE5"
                sid = "tech-giant"
            msg = SharkPersonaMessage(
                shark_id=sid,
                display_name=display_name,
                role=role,
                color=color,
                text=str(rep.get("text") or "").strip()
                or "Give me one concrete number.",
            )
            vt.last_messages.append(msg)
            new_shark_messages.append(msg)

    await save_state(state)
    return {
        **state.model_dump(),
        "new_shark_messages": [m.model_dump() for m in new_shark_messages],
        "ready_for_decision": ready_for_decision,
        "turn_count": turn_count,
    }


@router.post("/scorecard")
async def virtual_tank_scorecard() -> SharedWorkspace:
    """
    Compute clarity/confidence scores and per-shark IN/OUT verdicts for the
    current session using Nova. Intended to be called near the end of a pitch.
    """
    state: SharedWorkspace = await load_state()
    vt = state.virtual_tank

    # Build full conversation transcript interleaving shark messages and founder utterances.
    # Shark messages include the intro + all follow-up questions.
    # Founder utterances are stored in order in metrics.user_utterances.
    # The pattern is: intro shark msg, then alternating (founder reply, shark question).
    transcript_lines: List[str] = []
    founder_idx = 0
    for m in vt.last_messages:
        transcript_lines.append(f"{m.display_name}: {m.text}")
        if founder_idx < len(vt.metrics.user_utterances):
            transcript_lines.append(f"Founder: {vt.metrics.user_utterances[founder_idx]}")
            founder_idx += 1
    while founder_idx < len(vt.metrics.user_utterances):
        transcript_lines.append(f"Founder: {vt.metrics.user_utterances[founder_idx]}")
        founder_idx += 1
    transcript = "\n".join(transcript_lines)

    venture = await get_venture_context(state)

    founder_label = vt.founder_name or "the founder"

    clarity_prompt = f"""You are an expert pitch coach evaluating a pre-seed startup founder's performance in a mock Shark Tank session.

You are given the full conversation transcript between {founder_label} and three investors, plus venture context.

Evaluate {founder_label} based on:
1. CLARITY (0-100): How well did they explain the problem, solution, target market, and business model? Were their answers specific or vague? Quote or reference specific moments from the transcript.
2. CONFIDENCE (0-100): Did they sound decisive and knowledgeable? Did they handle tough questions well or stumble? Reference specific exchanges.

Consider:
- This is a PRE-SEED round — the product is NOT built yet. Do NOT penalize for lacking live metrics, revenue, or users. Judge them on preparation, vision, market understanding, and how well they articulated their plan.
- A founder who gives specific, structured answers with concrete details should score higher.
- Even brief but clear answers deserve credit.
- Base your evaluation ONLY on what was actually said in the transcript, not hypotheticals.

Output ONLY this JSON object (no markdown, no extra text):
{{
  "clarity_score": <number 0-100>,
  "clarity_notes": "<2-3 sentences referencing SPECIFIC things {founder_label} said — what went well and one specific thing to improve>",
  "confidence_score": <number 0-100>
}}
"""
    user_clarity = (
        f"Venture context:\n{venture}\n\n"
        "Full conversation transcript:\n"
        f"{transcript}\n\n"
        f"Evaluate {founder_label}'s performance based on their actual answers to the investors' questions in the transcript above."
    )
    clarity_text = converse(
        clarity_prompt,
        user_clarity,
        model_key="tank_logic",
        max_tokens=512,
        temperature=0.3,
    )
    if clarity_text:
        try:
            cleaned = clarity_text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
            vt.metrics.clarity_score = float(data.get("clarity_score"))
            vt.metrics.clarity_notes = str(
                data.get("clarity_notes") or ""
            ).strip() or None
            vt.metrics.confidence_score = float(data.get("confidence_score"))
        except Exception as e:
            print(f"[SCORECARD] clarity JSON parse failed: {e}\nRaw: {clarity_text[:500]}")
            pass

    # Per-shark IN/OUT verdicts based on the actual Q&A
    verdicts: List[dict] = []
    verdict_prompt = f"""You are an investor in a Shark Tank-style panel evaluating a PRE-SEED startup pitched by {founder_label}.

You are given your investor persona, the venture context (including market intelligence if available), and the full conversation transcript showing the questions you asked and how {founder_label} answered.

IMPORTANT: This is PRE-SEED — the product is NOT built yet. Judge the vision, plan, market understanding, and founder quality — NOT live metrics.

Base your decision on:
1. How well {founder_label} answered YOUR specific questions during the session. Quote or reference their actual answers.
2. The strength of the idea, market opportunity, and {founder_label}'s preparation.
3. Whether this is a viable pre-seed investment.

Rules:
- If IN: Reference something specific {founder_label} said that convinced you (1-2 sentences). End with: "I'd like to set up a follow-up conversation to discuss terms."
- If OUT: Point to a specific question where {founder_label}'s answer was weak or a concern that went unaddressed (1-2 sentences). Be respectful — they're early stage.
- Be logical: if {founder_label} gave strong, specific answers to your questions, lean IN. If answers were vague or key concerns went unaddressed, lean OUT.
- FEEDBACK: Give 2-3 sentences of actionable advice from YOUR area of expertise, grounded in what was discussed:
  * Reference specific moments from the conversation — what {founder_label} did well or where they stumbled
  * Give a concrete, practical suggestion to strengthen the startup that is relevant to their specific idea (not generic advice)
  * If their pitch delivery needs work (fumbling, silence, vague answers), say so kindly with a specific tip

Output ONLY this JSON object (no markdown, no extra text):
{{
  "verdict": "IN" or "OUT",
  "detail": "<your reasoning referencing specific things {founder_label} said, 1-2 sentences>",
  "feedback": "<2-3 sentences of actionable advice grounded in THIS conversation>"
}}
"""

    for sid, display_name in [
        ("hawk", "The Hawk"),
        ("visionary", "The Visionary"),
        ("tech-giant", "The Tech Giant"),
    ]:
        persona_desc = {
            "hawk": "CFO — you care about business model viability, projected unit economics, how the pre-seed funding will be used, and path to first revenue.",
            "visionary": "Story Architect — you care about the size of the outcome, defensible moat, and whether this could become a category-defining company.",
            "tech-giant": "Scale Strategist — you care about technical feasibility, architecture choices, defensibility, and whether the system can scale.",
        }[sid]
        user_verdict = (
            f"You are: {display_name} — {persona_desc}\n\n"
            f"Venture context:\n{venture}\n\n"
            f"Full conversation transcript (your questions and {founder_label}'s answers):\n"
            f"{transcript}\n\n"
            f"Based on how {founder_label} performed in THIS conversation — referencing their actual answers — make your investment decision."
        )
        vtext = converse(
            verdict_prompt,
            user_verdict,
            model_key="tank_logic",
            max_tokens=512,
            temperature=0.3,
        )
        if not vtext:
            continue
        try:
            cleaned = vtext.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
            verdicts.append(
                {
                    "shark_id": sid,
                    "display_name": display_name,
                    "verdict": str(data.get("verdict") or "").strip().upper()
                    or "OUT",
                    "detail": str(data.get("detail") or "").strip()
                    or "No detail provided.",
                    "feedback": str(data.get("feedback") or "").strip(),
                }
            )
        except Exception as e:
            print(f"[SCORECARD] verdict JSON parse failed for {sid}: {e}\nRaw: {vtext[:500]}")
            continue

    if verdicts:
        from ..schemas import SharkVerdict

        vt.verdicts = [
            SharkVerdict(
                shark_id=v["shark_id"],
                display_name=v["display_name"],
                verdict=v["verdict"],
                detail=v["detail"],
                feedback=v.get("feedback", ""),
            )
            for v in verdicts
        ]

    await save_state(state)
    return state

