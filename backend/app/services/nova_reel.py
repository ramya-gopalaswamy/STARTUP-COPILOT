"""
Nova Reel pitch-reel generator with narration and text overlays.

Pipeline:
  1. Build rich venture context from VentureDNA + narrative chapters
  2. Nova Pro generates structured output: visual script + narration + subtitles
  3. Nova Reel generates silent video (async, S3 output)
  4. Polly synthesizes voiceover narration to MP3
  5. FFmpeg composites video + audio + burned-in subtitles into final MP4
  6. Final MP4 uploaded to S3 with presigned URL
"""
from __future__ import annotations

import json
import logging
import os
import random
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import boto3

from ..config import AWS_PROFILE, AWS_REGION, S3_BUCKET
from .bedrock_client import get_bedrock_client, get_model

LOG = logging.getLogger(__name__)

NOVA_REEL_MODEL = get_model("pitch_reel")

# ── In-memory job registry ──────────────────────────────────────────
# Keyed by invocation ARN; stores narration audio, subtitle data, and
# compositing state so the status endpoint can composite when ready.
_reel_jobs: dict[str, dict[str, Any]] = {}

NARRATION_VOICE = "Matthew"
NARRATION_ENGINE = "neural"

# ── Rich context builder ────────────────────────────────────────────

def build_rich_venture_context(state: Any) -> str:
    """
    Assemble a detailed venture context string from all available sources:
    VentureDNA (from mock data or DB), narrative_chapters, golden_thread,
    market_gap, and market intel.
    """
    parts: list[str] = []

    # VentureDNA from mock file (always available after ingest)
    mock_path = Path(__file__).resolve().parent.parent.parent / "data" / "mocks" / "analyze_document_latest.json"
    if mock_path.exists():
        try:
            vd = json.loads(mock_path.read_text())
            if vd.get("startup_name"):
                parts.append(f"STARTUP NAME: {vd['startup_name']}")
            if vd.get("founder_name"):
                parts.append(f"FOUNDER: {vd['founder_name']}")
            if vd.get("problem"):
                parts.append(f"PROBLEM: {vd['problem']}")
            if vd.get("solution"):
                parts.append(f"SOLUTION: {vd['solution']}")
            tm = vd.get("target_market", {})
            if isinstance(tm, dict):
                if tm.get("summary"):
                    parts.append(f"TARGET MARKET: {tm['summary']}")
                if tm.get("segment"):
                    parts.append(f"MARKET SEGMENT: {tm['segment']}")
                if tm.get("size"):
                    parts.append(f"MARKET SIZE: {tm['size']}")
            elif tm:
                parts.append(f"TARGET MARKET: {tm}")
            fin = vd.get("financials", {})
            if isinstance(fin, dict):
                fin_parts = []
                if fin.get("stage"):
                    fin_parts.append(f"stage={fin['stage']}")
                if fin.get("revenue"):
                    fin_parts.append(f"revenue model={fin['revenue']}")
                if fin.get("burn"):
                    fin_parts.append(f"burn={fin['burn']}")
                if fin_parts:
                    parts.append(f"FINANCIALS: {', '.join(fin_parts)}")
        except Exception as e:
            LOG.warning("Failed to read VentureDNA mock: %s", e)

    # Asset Forge narrative chapters (the pitch deck content)
    af = getattr(state, "asset_forge", None)
    if af:
        gt = getattr(af, "golden_thread", None)
        if gt:
            parts.append(f"GOLDEN THREAD: {gt}")
        chapters = getattr(af, "narrative_chapters", None) or {}
        if chapters:
            parts.append("PITCH DECK CONTENT:")
            for key, content in chapters.items():
                parts.append(f"  [{key.upper()}]: {content}")

    # Market gap
    mg = getattr(state, "market_gap", None)
    if mg:
        parts.append(f"MARKET GAP: {mg}")

    # Market intel
    mi = getattr(state, "market_intel", None)
    if mi:
        if getattr(mi, "summary", None):
            parts.append(f"MARKET INTEL SUMMARY: {mi.summary}")
        if getattr(mi, "report_text", None):
            parts.append(f"MARKET REPORT:\n{mi.report_text[:4000]}")

    return "\n".join(parts) if parts else ""


# ── Dual-script prompt ──────────────────────────────────────────────

DUAL_SCRIPT_SYSTEM_PROMPT = """You are creating a pitch reel video for a SPECIFIC startup. You must deeply understand the venture context provided and generate content that is 100% relevant to THIS startup — its domain, its problem, its solution, its market.

STEP 1: Before writing anything, analyze the venture context and identify:
- What EXACT problem does this startup solve? (e.g. career accountability, not generic fitness)
- What is the startup's name and what does it actually DO?
- Who are the SPECIFIC target users? (e.g. job seekers, engineers — not generic "users")
- What technology/approach does it use? (e.g. multi-agent AI, not generic "platform")
- What domain does it belong to? (career, health, finance, etc.)

STEP 2: Generate TWO outputs as a JSON object:

1. "visual_script" — A cinematic description for an AI video generator (under 3800 chars).
   This MUST show visuals that match the startup's ACTUAL domain:
   - If the startup is about career goals → show offices, job interviews, resume screens, coding, professionals
   - If about health → show hospitals, patients, medical devices
   - If about finance → show trading floors, charts, banks
   - If about education → show classrooms, students, learning environments
   NEVER show generic stock footage that doesn't match the domain.
   The visual script describes 8 sequential scenes (6 seconds each).

2. "narration" — An array of 8 objects, one per scene. Each has:
   - "text": what the narrator SAYS. Must use REAL facts from the venture context.
     NEVER invent stats, metrics, or claims. If the context says "92% of resolutions fail", use THAT number.
     If there are no traction metrics, describe the vision — do not fabricate "rapid growth" or "positive feedback".
   - "subtitle": a SHORT text overlay (max 8 words) that SUMMARIZES what is being said in "text".
     The subtitle must directly relate to the narration. If the narrator talks about the problem, the subtitle should name the problem. If talking about the solution, subtitle names the solution.

THE 8 SCENES — follow this narrative arc:

1. THE PROBLEM — Open with the specific pain point. What is failing? Who is suffering? Use the exact problem statement from the venture context.
   Visual: Show people experiencing THIS specific problem in a realistic setting.

2. THE SCALE — How big is this problem? Use real numbers from the context (market size, failure rates, affected population).
   Visual: Show the scale — many people, large environments, data visualizations.

3. INTRODUCING [STARTUP NAME] — Reveal what this startup is. Name it. What does it do in one line?
   Visual: Show the concept coming to life — technology, interfaces, the product idea.

4. HOW IT WORKS — Explain the specific technology or approach. What makes it different?
   Visual: Show the technology in action — AI agents, dashboards, workflows, the user experience.

5. THE USER EXPERIENCE — Show how a real user benefits. Walk through a use case from the context.
   Visual: Show the target user (from the context) using the product and succeeding.

6. THE MARKET — Who is this for? How large is the opportunity? Use real market data from context.
   Visual: Show the target audience in their natural environment (offices, campuses, etc.)

7. THE VISION — Where is this going? What's the bigger picture? Growth plans, expansion.
   Visual: Show growth, expansion, the future — cities, global reach, scaling up.

8. THE ASK — Close strong. What's the call to action? Investment, partnership, early access.
   Visual: Inspirational closing shot — the team, a sunrise, forward momentum.

CRITICAL RULES FOR visual_script:
- Write as one continuous cinematic description, NOT numbered/labeled sections
- Describe ONLY what the camera sees — lighting, angles, motion, settings, people
- Use cinematic language: "dolly shot", "aerial view", "close-up", "tracking shot", "slow motion"
- Include "4k, cinematic, photorealistic" style markers
- NEVER use negation words (no, not, without, don't) — the AI video model will do the OPPOSITE
- NEVER describe text, titles, written words, or logos in the visual script
- Every visual must be appropriate for THIS startup's domain. Re-read the problem/solution before choosing each scene's setting

CRITICAL RULES FOR narration:
- Use the startup's EXACT name from the context
- Every sentence must be traceable to a fact in the venture context
- NEVER fabricate metrics, user counts, or feedback that isn't in the context
- If the startup is pre-revenue or early stage, talk about vision and potential — not made-up traction
- Each subtitle must be a condensed version of what the narrator is saying in that same scene
- Subtitles should NOT be generic phrases like "Join the revolution" — they should be specific

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "visual_script": "...",
  "narration": [
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."},
    {"text": "...", "subtitle": "..."}
  ]
}"""


def generate_reel_scripts(venture_context: str) -> dict[str, Any]:
    """
    Call Nova Pro to generate structured JSON with visual_script + narration.
    Returns parsed dict with 'visual_script' and 'narration' keys.
    """
    client = get_bedrock_client()
    user_msg = (
        "Read the following venture context CAREFULLY. Every scene, narration line, "
        "and visual must be directly relevant to THIS specific startup — its actual "
        "domain, problem, solution, and target users. Do not generalize or use generic "
        "startup imagery.\n\n"
        "=== VENTURE CONTEXT ===\n"
        f"{venture_context[:8000]}\n"
        "=== END CONTEXT ===\n\n"
        "Now generate the pitch reel JSON. Make sure visuals match the startup's "
        "domain (e.g. career/tech scenes for a career accountability platform, "
        "NOT fitness/gym scenes). Make sure narration uses ONLY facts from the context above."
    )
    resp = client.converse(
        modelId=get_model("ingest"),
        system=[{"text": DUAL_SCRIPT_SYSTEM_PROMPT}],
        messages=[{
            "role": "user",
            "content": [{"text": user_msg}],
        }],
        inferenceConfig={"maxTokens": 4096, "temperature": 0.5},
    )
    raw = resp["output"]["message"]["content"][0]["text"].strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3].rstrip()
    if raw.startswith("json"):
        raw = raw[4:].lstrip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        LOG.error("Nova Pro returned invalid JSON for reel scripts, raw: %s", raw[:500])
        raise ValueError("Failed to parse structured reel script from Nova Pro")

    if "visual_script" not in result or "narration" not in result:
        raise ValueError("Nova Pro response missing required fields (visual_script, narration)")

    vs = result["visual_script"]
    if len(vs) > 3900:
        result["visual_script"] = vs[:3900]

    LOG.info("Generated dual reel scripts (visual=%d chars, narration=%d scenes)",
             len(result["visual_script"]), len(result["narration"]))
    return result


# ── Legacy single-script function (kept for compatibility) ──────────

SCRIPT_SYSTEM_PROMPT = """You are a cinematic video director creating a startup pitch reel.

Given venture context about a startup, write a SINGLE cinematic video description (under 3800 characters) 
that will be used by an AI video generator. The description should cover these scenes in order:

1. HOOK — A dramatic visual that captures the problem (6 seconds)
2. PROBLEM — Show the scale/impact of the problem on people (6 seconds)
3. SOLUTION — Reveal the product concept with futuristic/tech visuals (6 seconds)
4. HOW IT WORKS — Technology in action, interfaces, data flowing (6 seconds)
5. MARKET — The target audience in their environment (6 seconds)
6. TRACTION/GROWTH — Upward momentum, progress, expansion imagery (6 seconds)
7. TEAM — Confident founders/entrepreneurs energy (6 seconds)
8. CALL TO ACTION — Inspirational closing shot (6 seconds)

CRITICAL RULES:
- Write it as one continuous cinematic description, NOT as numbered scenes
- Describe VISUALS ONLY — what the camera sees, lighting, motion, style
- Use cinematic language: "dolly shot", "aerial view", "close-up", "tracking shot", "slow motion", "timelapse"
- Always include: "4k, cinematic, photorealistic" style markers
- NEVER use negation words (no, not, without) — the model will do the opposite
- NEVER include text overlays, titles, or written words in the description
- NEVER mention the startup name directly — show concepts visually
- Focus on EMOTIONS and VISUALS that tell the startup's story
- The entire description must be under 3800 characters"""


def generate_reel_script(venture_context: str) -> str:
    """Legacy single visual-only script generator."""
    client = get_bedrock_client()
    resp = client.converse(
        modelId=get_model("ingest"),
        system=[{"text": SCRIPT_SYSTEM_PROMPT}],
        messages=[{
            "role": "user",
            "content": [{"text": f"Create a cinematic pitch reel description for this startup:\n\n{venture_context[:6000]}"}],
        }],
        inferenceConfig={"maxTokens": 2048, "temperature": 0.7},
    )
    script = resp["output"]["message"]["content"][0]["text"].strip()
    if len(script) > 3900:
        script = script[:3900]
    LOG.info("Generated reel script (%d chars)", len(script))
    return script


# ── Nova Reel generation ────────────────────────────────────────────

def start_reel_generation(script: str, s3_bucket: str | None = None, duration_seconds: int = 48) -> dict[str, Any]:
    """
    Start async Nova Reel video generation.
    Returns {"invocationArn": "...", "status": "InProgress"}.
    """
    bucket = s3_bucket or S3_BUCKET
    if not bucket:
        raise ValueError("S3_BUCKET not configured. Set S3_BUCKET env var to an S3 bucket name.")

    s3_uri = f"s3://{bucket}"

    if duration_seconds < 12:
        duration_seconds = 12
    if duration_seconds > 120:
        duration_seconds = 120
    duration_seconds = (duration_seconds // 6) * 6

    model_input = {
        "taskType": "MULTI_SHOT_AUTOMATED",
        "multiShotAutomatedParams": {
            "text": script,
        },
        "videoGenerationConfig": {
            "seed": random.randint(0, 2147483646),
            "durationSeconds": duration_seconds,
            "fps": 24,
            "dimension": "1280x720",
        },
    }

    client = get_bedrock_client()
    LOG.info("Starting Nova Reel generation (%ds, model=%s, s3=%s)", duration_seconds, NOVA_REEL_MODEL, s3_uri)

    response = client.start_async_invoke(
        modelId=NOVA_REEL_MODEL,
        modelInput=model_input,
        outputDataConfig={"s3OutputDataConfig": {"s3Uri": s3_uri}},
    )

    invocation_arn = response["invocationArn"]
    LOG.info("Nova Reel job started: %s", invocation_arn)

    return {
        "invocationArn": invocation_arn,
        "status": "InProgress",
    }


# ── Polly narration synthesis ───────────────────────────────────────

def synthesize_narration(narration_scenes: list[dict[str, str]], voice_id: str = NARRATION_VOICE) -> str:
    """
    Synthesize the full narration as a single MP3 using Amazon Polly SSML.
    Inserts pauses between scenes for pacing.
    Returns the path to the temporary MP3 file.
    """
    ssml_parts = ["<speak>"]
    for i, scene in enumerate(narration_scenes):
        text = scene.get("text", "").strip()
        if not text:
            continue
        # Polly SSML: escape ampersands and angle brackets
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        ssml_parts.append(f'<prosody rate="95%">{text}</prosody>')
        if i < len(narration_scenes) - 1:
            ssml_parts.append('<break time="1500ms"/>')
    ssml_parts.append("</speak>")
    ssml_text = "\n".join(ssml_parts)

    session = boto3.Session(profile_name=AWS_PROFILE) if AWS_PROFILE else boto3.Session()
    polly = session.client("polly", region_name=AWS_REGION)

    LOG.info("Synthesizing narration with Polly (voice=%s, %d scenes)", voice_id, len(narration_scenes))

    resp = polly.synthesize_speech(
        Text=ssml_text,
        TextType="ssml",
        OutputFormat="mp3",
        VoiceId=voice_id,
        Engine=NARRATION_ENGINE,
    )

    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, prefix="reel_narration_")
    tmp.write(resp["AudioStream"].read())
    tmp.close()
    LOG.info("Narration MP3 saved: %s", tmp.name)
    return tmp.name


# ── Subtitle data for frontend overlays ─────────────────────────────

def build_subtitle_track(narration_scenes: list[dict[str, str]], scene_duration: int = 6) -> list[dict[str, Any]]:
    """
    Build timed subtitle data for frontend rendering.
    Returns list of {start, end, text} dicts.
    """
    track: list[dict[str, Any]] = []
    for i, scene in enumerate(narration_scenes):
        subtitle_text = scene.get("subtitle", "").strip()
        if not subtitle_text:
            continue
        track.append({
            "start": i * scene_duration,
            "end": (i + 1) * scene_duration,
            "text": subtitle_text,
        })
    return track


# ── FFmpeg compositing (video + audio only) ─────────────────────────

def _get_s3_client():
    session = boto3.Session(profile_name=AWS_PROFILE) if AWS_PROFILE else boto3.Session()
    return session.client("s3", region_name=AWS_REGION)


def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
    """Parse s3://bucket/key into (bucket, key)."""
    stripped = s3_uri.replace("s3://", "")
    parts = stripped.split("/", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def composite_video(
    silent_video_s3_uri: str,
    narration_mp3_path: str,
) -> str:
    """
    Download silent video from S3, merge with narration audio using FFmpeg,
    upload final MP4 back to S3. Text overlays are rendered on the frontend.
    Returns the S3 URI of the final composited video.
    """
    s3 = _get_s3_client()
    bucket, key = _parse_s3_uri(silent_video_s3_uri)

    if not key.endswith(".mp4"):
        key = key.rstrip("/") + "/output.mp4"

    tmp_video = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False, prefix="reel_silent_")
    tmp_video.close()
    LOG.info("Downloading silent video from s3://%s/%s", bucket, key)
    s3.download_file(bucket, key, tmp_video.name)

    tmp_final = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False, prefix="reel_final_")
    tmp_final.close()

    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", tmp_video.name,
            "-i", narration_mp3_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "128k",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            "-movflags", "+faststart",
            tmp_final.name,
        ]
        LOG.info("Running FFmpeg compositing: %s", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if proc.returncode != 0:
            LOG.error("FFmpeg failed: %s", proc.stderr[-1000:] if proc.stderr else "no stderr")
            raise RuntimeError(f"FFmpeg compositing failed: {proc.stderr[-500:]}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("FFmpeg compositing timed out (120s)")

    final_key = key.replace("output.mp4", "pitch_reel_final.mp4")
    LOG.info("Uploading composited video to s3://%s/%s", bucket, final_key)
    s3.upload_file(
        tmp_final.name, bucket, final_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )

    for p in [tmp_video.name, tmp_final.name, narration_mp3_path]:
        try:
            os.unlink(p)
        except OSError:
            pass

    return f"s3://{bucket}/{final_key}"


# ── Job registry helpers ────────────────────────────────────────────

def register_reel_job(
    invocation_arn: str,
    narration_mp3_path: str,
    subtitle_track: list[dict[str, Any]],
) -> None:
    """Store narration audio and subtitle data for compositing when Nova Reel finishes."""
    _reel_jobs[invocation_arn] = {
        "narration_mp3_path": narration_mp3_path,
        "subtitle_track": subtitle_track,
        "compositing_started": False,
        "compositing_done": False,
        "final_s3_uri": None,
        "composite_error": None,
    }
    LOG.info("Registered reel job: %s", invocation_arn)


def get_reel_job(invocation_arn: str) -> dict[str, Any] | None:
    return _reel_jobs.get(invocation_arn)


# ── Status + compositing trigger ────────────────────────────────────

def get_reel_status(invocation_arn: str) -> dict[str, Any]:
    """Check the status of a Nova Reel generation job."""
    client = get_bedrock_client()
    job = client.get_async_invoke(invocationArn=invocation_arn)

    status = job.get("status", "Unknown")
    result: dict[str, Any] = {
        "invocationArn": invocation_arn,
        "status": status,
    }

    if status == "Completed":
        output_config = job.get("outputDataConfig", {})
        s3_config = output_config.get("s3OutputDataConfig", {})
        result["s3Uri"] = s3_config.get("s3Uri", "")
        LOG.info("Nova Reel job completed: %s -> %s", invocation_arn, result.get("s3Uri"))
    elif status == "Failed":
        result["failureMessage"] = job.get("failureMessage", "Unknown error")
        LOG.error("Nova Reel job failed: %s — %s", invocation_arn, result["failureMessage"])

    return result


def get_reel_presigned_url(s3_uri: str, expiry: int = 3600) -> str:
    """Generate a presigned URL for a video in S3."""
    bucket, key = _parse_s3_uri(s3_uri)

    if not key.endswith(".mp4"):
        key = key.rstrip("/") + "/output.mp4"

    s3 = _get_s3_client()
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expiry,
    )
    return url
