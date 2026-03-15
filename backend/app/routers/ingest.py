from fastapi import APIRouter, File, UploadFile

from ..schemas import SharedWorkspace
from ..services.ingest_service import analyze_document


router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("")
async def ingest(file: UploadFile = File(...)) -> SharedWorkspace:
    """
    Ingest the founder's project detail document. Nova 2 Pro parses the file
    (when DEMO_INGEST=true) and initializes the mission graph; otherwise
    uses mock data from backend/data/mocks/analyze_document_latest.json.
    """
    content = await file.read()
    await file.close()
    return await analyze_document(content, file.filename or "upload")
