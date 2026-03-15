import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel

from ..schemas import SharedWorkspace
from ..services.orb_services import (
    clear_market_intel_follow_ups,
    generate_asset_forge_image,
    generate_code_lab_image,
    get_asset_forge_assets_dir,
    get_code_lab_artifact_path,
    get_code_lab_assets_dir,
    get_code_lab_file_from_zip,
    get_code_lab_preview_html,
    get_code_lab_zip_paths,
    get_pitch_deck_path,
    run_asset_forge,
    run_asset_forge_chat_edit,
    run_asset_forge_resync_market,
    run_asset_forge_update_content,
    run_asset_forge_start_over,
    run_code_lab,
    run_code_lab_build,
    run_code_lab_edit,
    run_code_lab_create_page,
    run_finance_auditor,
    run_market_intel,
    run_market_intel_follow_up,
    run_market_intel_stream_bytes,
    run_vc_scout,
    run_vc_scout_discovery,
)


class CodeLabBuildBody(BaseModel):
    items: list[str] = []
    mode: str | None = None  # "html" for static HTML builds, otherwise default app mode


class CodeLabCreatePageBody(BaseModel):
    path: str
    description: str = ""


class CodeLabGenerateImageBody(BaseModel):
    prompt: str = ""
    color_hex: str | None = None


class MarketIntelFollowUpBody(BaseModel):
    question: str = ""


class AssetForgeAttachmentItem(BaseModel):
    filename: str = ""
    path: str = ""


class AssetForgeChatEditBody(BaseModel):
    message: str = ""
    target: str = "auto"
    attachments: list[AssetForgeAttachmentItem] = []


class CodeLabEditBody(BaseModel):
    message: str = ""
    attachments: list[AssetForgeAttachmentItem] = []


class AssetForgeUpdateContentBody(BaseModel):
    narrative_chapters: dict[str, str] = {}


class AssetForgeGenerateImageBody(BaseModel):
    prompt: str = ""
    color_hex: str | None = None


class VCScoutDiscoveryBody(BaseModel):
    index: int


router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/market-intel/run", response_model=SharedWorkspace)
async def run_market_intel_endpoint() -> SharedWorkspace:
    """Market Intelligence orb: RAG context + Nova Lite (DEMO_MARKET)."""
    return await run_market_intel()


@router.post("/market-intel/follow-up", response_model=SharedWorkspace)
async def run_market_intel_follow_up_endpoint(body: MarketIntelFollowUpBody) -> SharedWorkspace:
    """Answer a follow-up question over the current market report (multi-turn Nova)."""
    return await run_market_intel_follow_up(body.question)


@router.post("/market-intel/clear-follow-ups", response_model=SharedWorkspace)
async def clear_market_intel_follow_ups_endpoint() -> SharedWorkspace:
    """Clear follow-up Q&As so they are not shown when the user returns to the Market Intelligence page."""
    return await clear_market_intel_follow_ups()


@router.post("/market-intel/run-stream")
async def run_market_intel_stream_endpoint():
    """Market Intelligence streaming: SSE events (phase, token, done)."""
    return StreamingResponse(
        run_market_intel_stream_bytes(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/asset-forge/run", response_model=SharedWorkspace)
async def run_asset_forge_endpoint() -> SharedWorkspace:
    """Asset Forge orb: Nova Pro → structured slides → pitch deck PPT (DEMO_ASSET_FORGE)."""
    # #region agent log
    try:
        import json as _json
        _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
        _log.write(_json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "agents.py:run_asset_forge_endpoint", "message": "POST /asset-forge/run received", "data": {"path": "asset-forge/run"}, "hypothesisId": "H1"}) + "\n")
        _log.close()
    except Exception:
        pass
    # #endregion
    print("[API] POST /api/agents/asset-forge/run received", flush=True)
    try:
        result = await run_asset_forge()
        return result
    except Exception as e:
        # #region agent log
        try:
            import json as _json
            _log = open("/Users/ramyag/Desktop/STARTUP COPILOT/.cursor/debug-02f6f0.log", "a")
            _log.write(_json.dumps({"sessionId": "02f6f0", "timestamp": __import__("time").time() * 1000, "location": "agents.py:run_asset_forge_endpoint", "message": "run_asset_forge exception", "data": {"error": str(e), "type": type(e).__name__}, "hypothesisId": "H2"}) + "\n")
            _log.close()
        except Exception:
            pass
        # #endregion
        raise


@router.get("/asset-forge/pitch-deck")
async def get_pitch_deck():
    """Download the generated pitch deck .pptx (after running Asset Forge with DEMO_ASSET_FORGE=true)."""
    path = Path(get_pitch_deck_path())
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Pitch deck not generated yet. Run Asset Forge first.")
    return FileResponse(path, filename="pitch_deck.pptx", media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")


@router.post("/asset-forge/resync-market", response_model=SharedWorkspace)
async def resync_asset_forge_market_endpoint() -> SharedWorkspace:
    """Rewrite the Market slide using latest Market Intelligence data."""
    return await run_asset_forge_resync_market()


@router.post("/asset-forge/upload")
async def asset_forge_upload_endpoint(files: list[UploadFile] = File(...)):
    """Upload one or more files for Asset Forge chat-edit attachments. Returns list of {filename, path}."""
    if not files:
        return {"uploads": []}
    assets_dir = get_asset_forge_assets_dir()
    uploads = []
    for uf in files:
        if not uf.filename:
            continue
        ext = Path(uf.filename).suffix or ""
        safe_name = f"{uuid.uuid4().hex}{ext}"
        path = assets_dir / safe_name
        try:
            content = await uf.read()
            path.write_bytes(content)
            uploads.append({"filename": uf.filename, "path": safe_name})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    return {"uploads": uploads}


@router.post("/asset-forge/chat-edit", response_model=SharedWorkspace)
async def asset_forge_chat_edit_endpoint(body: AssetForgeChatEditBody) -> SharedWorkspace:
    """Apply user edit request to the pitch deck (Nova Pro); optional attachments by filename."""
    return await run_asset_forge_chat_edit(
        message=body.message,
        target=body.target,
        attachments=[{"filename": a.filename, "path": a.path} for a in body.attachments],
    )


@router.post("/asset-forge/update-content", response_model=SharedWorkspace)
async def asset_forge_update_content_endpoint(body: AssetForgeUpdateContentBody) -> SharedWorkspace:
    """Update pitch deck from inline-edited slide content (narrative_chapters); rebuilds PPT."""
    return await run_asset_forge_update_content(body.narrative_chapters)


@router.post("/asset-forge/start-over", response_model=SharedWorkspace)
async def asset_forge_start_over_endpoint() -> SharedWorkspace:
    """Reset Asset Forge to initial state so the user sees the Create pitch deck screen again."""
    return await run_asset_forge_start_over()


@router.post("/asset-forge/generate-image")
async def asset_forge_generate_image_endpoint(body: AssetForgeGenerateImageBody):
    """Generate an image with Nova Canvas from a text prompt; optional color (hex). Returns {filename, path} like upload; image can be fetched via GET /asset-forge/asset/{path}."""
    if not (body.prompt or "").strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    result = generate_asset_forge_image(body.prompt.strip(), body.color_hex)
    if not result:
        raise HTTPException(status_code=502, detail="Image generation failed (Nova Canvas unavailable or error)")
    return result


@router.get("/asset-forge/asset/{filename}")
async def get_asset_forge_asset(filename: str):
    """Serve an asset file by name (e.g. generated image or upload). Filename must be a single path segment (no slashes)."""
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    assets_dir = get_asset_forge_assets_dir()
    path = (assets_dir / filename).resolve()
    if not path.is_file() or not str(path).startswith(str(assets_dir.resolve())):
        raise HTTPException(status_code=404, detail="Asset not found")
    suffix = path.suffix.lower()
    media = "image/png" if suffix == ".png" else "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/webp" if suffix == ".webp" else "image/gif" if suffix == ".gif" else "application/octet-stream"
    return FileResponse(path, media_type=media)


@router.get("/asset-forge/slide-image/{slide_id}")
async def get_asset_forge_slide_image(slide_id: str):
    """Return the image embedded on the given slide (for UI preview). slide_id: hook, problem, solution, business, market."""
    from ..storage import load_state
    state = await load_state()
    emb = getattr(state.asset_forge, "embedded_slide_images", None) or {}
    filename = emb.get(slide_id)
    if not filename:
        raise HTTPException(status_code=404, detail="No image on this slide")
    assets_dir = get_asset_forge_assets_dir()
    path = (assets_dir / filename).resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found")
    suffix = path.suffix.lower()
    media = "image/png" if suffix == ".png" else "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/webp" if suffix == ".webp" else "image/gif" if suffix == ".gif" else "application/octet-stream"
    return FileResponse(path, media_type=media)


@router.post("/vc-scout/run", response_model=SharedWorkspace)
async def run_vc_scout_endpoint() -> SharedWorkspace:
    """VC Scout orb: RAG context + Nova Lite (DEMO_VC_SCOUT)."""
    return await run_vc_scout()


@router.post("/vc-scout/discover", response_model=SharedWorkspace)
async def run_vc_scout_discover_endpoint(body: VCScoutDiscoveryBody) -> SharedWorkspace:
    """VC Scout: for a single VC pin, run Nova-powered discovery to identify partners and their focus."""
    try:
        return await run_vc_scout_discovery(body.index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/code-lab/run", response_model=SharedWorkspace)
async def run_code_lab_endpoint() -> SharedWorkspace:
    """Code Lab orb: Nova 2 Pro blueprint (DEMO_CODE_LAB)."""
    return await run_code_lab()


@router.post("/code-lab/build", response_model=SharedWorkspace)
async def code_lab_build_endpoint(body: CodeLabBuildBody) -> SharedWorkspace:
    """Code Lab: generate code with Nova from plan/request, save zip artifact (DEMO_CODE_LAB)."""
    return await run_code_lab_build(body.items or [], body.mode)


@router.post("/code-lab/create-page", response_model=SharedWorkspace)
async def code_lab_create_page_endpoint(body: CodeLabCreatePageBody) -> SharedWorkspace:
    """Code Lab: generate a single page/component file at the given path using Nova and add it to the scaffold zip."""
    return await run_code_lab_create_page(body.path, body.description or "")


@router.post("/code-lab/generate-image")
async def code_lab_generate_image_endpoint(body: CodeLabGenerateImageBody):
    """Generate a mock image for Code Lab (Nova Canvas), saved under code-lab-assets. Returns {filename, path}."""
    if not (body.prompt or "").strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    result = generate_code_lab_image(body.prompt.strip(), body.color_hex)
    if not result:
        raise HTTPException(status_code=502, detail="Image generation failed (Nova Canvas unavailable or error)")
    return result


@router.get("/code-lab/artifact")
async def get_code_lab_artifact():
    """Download the generated code zip (after Code Lab build with DEMO_CODE_LAB=true)."""
    path = Path(get_code_lab_artifact_path())
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Code artifact not generated yet. Run Code Lab build first.")
    return FileResponse(path, filename="code-lab-scaffold.zip", media_type="application/zip")


@router.get("/code-lab/image/{filename}")
async def get_code_lab_image(filename: str):
    """Serve a mock image generated for Code Lab (from code-lab-assets). Filename is a single segment."""
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    assets_dir = get_code_lab_assets_dir()
    path = (assets_dir / filename).resolve()
    if not path.is_file() or not str(path).startswith(str(assets_dir.resolve())):
        raise HTTPException(status_code=404, detail="Asset not found")
    suffix = path.suffix.lower()
    media = (
        "image/png"
        if suffix == ".png"
        else "image/jpeg"
        if suffix in (".jpg", ".jpeg")
        else "image/webp"
        if suffix == ".webp"
        else "image/gif"
        if suffix == ".gif"
        else "application/octet-stream"
    )
    return FileResponse(path, media_type=media)


@router.post("/code-lab/upload")
async def code_lab_upload_endpoint(files: list[UploadFile] = File(...)):
    """Upload one or more files for Code Lab edits (e.g. images). Returns list of {filename, path}."""
    if not files:
        return {"uploads": []}
    assets_dir = get_code_lab_assets_dir()
    uploads = []
    for uf in files:
        if not uf.filename:
            continue
        ext = Path(uf.filename).suffix or ""
        safe_name = f"{uuid.uuid4().hex}{ext}"
        path = assets_dir / safe_name
        try:
            content = await uf.read()
            path.write_bytes(content)
            uploads.append({"filename": uf.filename, "path": safe_name})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    return {"uploads": uploads}


@router.get("/code-lab/files")
async def get_code_lab_files():
    """Return the list of file paths in the current generated zip (for Live code terminal)."""
    paths = get_code_lab_zip_paths()
    return {"paths": paths}


@router.get("/code-lab/preview")
async def get_code_lab_preview():
    """Return the first HTML file from the generated zip for iframe preview."""
    html = get_code_lab_preview_html()
    if not html:
        raise HTTPException(
            status_code=404,
            detail="No preview available. Build a project that includes an HTML file (e.g. index.html) first.",
        )
    return Response(content=html, media_type="text/html")


@router.get("/code-lab/{file_path:path}")
async def get_code_lab_asset(file_path: str):
    """Serve a file from the generated zip (e.g. styles.css, script.js) so preview HTML can load assets."""
    if not file_path or file_path.strip() in ("preview", "artifact", "run", "build", "edit"):
        raise HTTPException(status_code=404, detail="Not found")
    result = get_code_lab_file_from_zip(file_path)
    if not result:
        raise HTTPException(status_code=404, detail="File not found in generated project.")
    content, media_type = result
    return Response(content=content, media_type=media_type)


@router.post("/code-lab/edit", response_model=SharedWorkspace)
async def code_lab_edit_endpoint(body: CodeLabEditBody) -> SharedWorkspace:
    """Code Lab: apply user edit request to current codebase via Nova (DEMO_CODE_LAB). Build first, then send edits."""
    path = Path(get_code_lab_artifact_path())
    if not path.is_file():
        raise HTTPException(
            status_code=400,
            detail="No codebase to edit. Run a build first (Commence construction or Build it).",
        )
    try:
        # Reuse AssetForgeAttachmentItem schema: {"filename": str, "path": str}
        atts = [{"filename": a.filename, "path": a.path} for a in body.attachments]
        return await run_code_lab_edit(body.message or "", attachments=atts)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/finance-auditor/run", response_model=SharedWorkspace)
async def run_finance_auditor_endpoint() -> SharedWorkspace:
    """Finance Auditor orb: deterministic series + Nova Lite critique (DEMO_FINANCE)."""
    return await run_finance_auditor()


# ── Pitch Reel (Nova Reel + Polly + FFmpeg) ─────────────────────────

import asyncio
import logging as _logging

_pitch_reel_log = _logging.getLogger("pitch_reel")


class PitchReelGenerateBody(BaseModel):
    duration_seconds: int = 48


@router.post("/asset-forge/pitch-reel/generate")
async def generate_pitch_reel_endpoint(body: PitchReelGenerateBody):
    """
    Enhanced pitch reel pipeline:
      1. Build rich venture context from VentureDNA + narrative chapters
      2. Nova Pro generates visual script + narration + subtitles (structured JSON)
      3. Start Nova Reel async job with visual script
      4. Synthesize narration audio via Polly
      5. Register job for compositing when Nova Reel finishes
    Returns {"invocationArn", "status", "script", "narration"}.
    """
    from ..storage import load_state
    from ..services.nova_reel import (
        build_rich_venture_context,
        generate_reel_scripts,
        start_reel_generation,
        synthesize_narration,
        build_subtitle_track,
        register_reel_job,
    )

    state = await load_state()
    venture_ctx = build_rich_venture_context(state)
    if not venture_ctx or len(venture_ctx.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="No venture context available. Run Ingest first to upload your startup documents.",
        )

    # Step 1: Generate structured scripts (visual + narration + subtitles)
    try:
        scripts = await asyncio.to_thread(generate_reel_scripts, venture_ctx)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate video scripts: {e}")

    visual_script = scripts["visual_script"]
    narration_scenes = scripts["narration"]

    # Step 2: Start Nova Reel async job
    try:
        result = await asyncio.to_thread(
            start_reel_generation, visual_script, None, body.duration_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to start video generation: {e}")

    invocation_arn = result["invocationArn"]

    # Step 3: Synthesize Polly narration + build subtitle track
    subtitle_track: list = []
    try:
        narration_mp3 = await asyncio.to_thread(synthesize_narration, narration_scenes)
        subtitle_track = build_subtitle_track(narration_scenes)
    except Exception as e:
        _pitch_reel_log.error("Polly narration synthesis failed: %s", e)
        narration_mp3 = ""

    # Step 4: Register job for compositing when Nova Reel completes
    if narration_mp3:
        register_reel_job(invocation_arn, narration_mp3, subtitle_track)

    result["script"] = visual_script
    result["narration"] = narration_scenes
    result["hasNarration"] = bool(narration_mp3)
    return result


@router.get("/asset-forge/pitch-reel/status/{invocation_arn:path}")
async def pitch_reel_status_endpoint(invocation_arn: str):
    """
    Poll the status of a Nova Reel generation job.
    When Nova Reel completes, triggers FFmpeg compositing (audio + subtitles).
    States: InProgress -> Compositing -> Completed (or Failed).
    """
    from ..services.nova_reel import (
        get_reel_status,
        get_reel_presigned_url,
        get_reel_job,
        composite_video,
    )

    # Check if compositing is already done for this job
    job_meta = get_reel_job(invocation_arn)
    if job_meta and job_meta.get("compositing_done") and job_meta.get("final_s3_uri"):
        try:
            video_url = get_reel_presigned_url(job_meta["final_s3_uri"])
        except Exception as e:
            return {"invocationArn": invocation_arn, "status": "Completed", "videoUrlError": str(e)}
        return {
            "invocationArn": invocation_arn,
            "status": "Completed",
            "videoUrl": video_url,
            "subtitleTrack": job_meta.get("subtitle_track", []),
        }

    if job_meta and job_meta.get("compositing_started") and not job_meta.get("compositing_done"):
        return {"invocationArn": invocation_arn, "status": "Compositing"}

    if job_meta and job_meta.get("composite_error"):
        return {
            "invocationArn": invocation_arn,
            "status": "Failed",
            "failureMessage": f"Compositing failed: {job_meta['composite_error']}",
        }

    # Poll Nova Reel status
    try:
        result = get_reel_status(invocation_arn)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to check job status: {e}")

    if result.get("status") == "Completed" and result.get("s3Uri"):
        if job_meta and job_meta.get("narration_mp3_path") and not job_meta.get("compositing_started"):
            # Trigger compositing
            job_meta["compositing_started"] = True
            result["status"] = "Compositing"

            async def _do_composite():
                try:
                    final_uri = await asyncio.to_thread(
                        composite_video,
                        result["s3Uri"],
                        job_meta["narration_mp3_path"],
                    )
                    job_meta["final_s3_uri"] = final_uri
                    job_meta["compositing_done"] = True
                    _pitch_reel_log.info("Compositing complete: %s", final_uri)
                except Exception as e:
                    _pitch_reel_log.error("Compositing failed: %s", e)
                    job_meta["composite_error"] = str(e)
                    job_meta["compositing_started"] = False

            asyncio.create_task(_do_composite())
            return result

        # No narration data — serve the raw silent video
        try:
            result["videoUrl"] = get_reel_presigned_url(result["s3Uri"])
        except Exception as e:
            result["videoUrlError"] = str(e)

    return result
