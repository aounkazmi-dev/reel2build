from base64 import b64encode
import os
from pathlib import Path
from secrets import compare_digest
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analysis import AnalysisResponse, BuildRoadmap, RoadmapRequest, analyze_video, generate_roadmap
from media import DATA_DIR, MAX_BYTES, MediaError, download_reel, inspect_video, new_video_path, remove_video

app = FastAPI(title="Reel2Build API")
app_password = os.getenv("APP_PASSWORD")
on_render = os.getenv("RENDER") == "true"


if app_password or on_render:
    expected_credentials = b64encode(f"demo:{app_password}".encode("utf-8"))

    @app.middleware("http")
    async def protect_demo(request: Request, call_next):
        if request.method == "GET" and request.url.path == "/health":
            return await call_next(request)
        if not app_password:
            return JSONResponse({"detail": "Set APP_PASSWORD on Render to enable Reel2Build."}, 503)

        scheme, _, credentials = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "basic" or not compare_digest(credentials.encode(), expected_credentials):
            return JSONResponse(
                {"detail": "Sign in to Reel2Build."}, 401,
                headers={"WWW-Authenticate": 'Basic realm="Reel2Build", charset="UTF-8"'},
            )
        if request.method == "POST" and request.headers.get("sec-fetch-site") in {"cross-site", "same-site"}:
            return JSONResponse({"detail": "Open Reel2Build directly to use this action."}, 403)
        return await call_next(request)


class ReelRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class VideoResponse(BaseModel):
    id: str
    url: str
    source: str
    filename: str
    bytes: int
    duration_seconds: float
    has_audio: bool


@app.get("/health")
def health():
    return {"status": "ok", "project": "Reel2Build"}


@app.post("/api/videos/reel", response_model=VideoResponse, status_code=201)
def import_reel(body: ReelRequest):
    # Synchronous routes run in FastAPI's thread pool, not its event loop.
    try:
        return download_reel(body.url)
    except MediaError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.post("/api/videos/upload", response_model=VideoResponse, status_code=201)
def upload_video(file: UploadFile):
    path = new_video_path()
    try:
        if not file.filename or not file.filename.lower().endswith(".mp4"):
            raise MediaError("Choose an MP4 video file.")
        size = 0
        with path.open("wb") as destination:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise MediaError("The video is larger than 50 MB. Choose a smaller clip.", 413)
                destination.write(chunk)
        return inspect_video(path, "upload", file.filename)
    except MediaError as exc:
        remove_video(path)
        raise HTTPException(exc.status, str(exc)) from exc
    except Exception:
        remove_video(path)
        raise
    finally:
        file.file.close()


@app.get("/api/videos/{video_id}/content")
def video_content(video_id: UUID):
    path = DATA_DIR / f"{video_id}.mp4"
    if not path.is_file():
        raise HTTPException(404, "Video not found. Import it again.")
    return FileResponse(path, media_type="video/mp4")


@app.post("/api/videos/{video_id}/analysis", response_model=AnalysisResponse)
def video_analysis(video_id: UUID):
    path = DATA_DIR / f"{video_id}.mp4"
    if not path.is_file():
        raise HTTPException(404, "Video not found. Import it again.")
    try:
        return analyze_video(path)
    except MediaError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.post("/api/videos/{video_id}/roadmap", response_model=BuildRoadmap)
def video_roadmap(video_id: UUID, evidence: RoadmapRequest):
    if not (DATA_DIR / f"{video_id}.mp4").is_file():
        raise HTTPException(404, "Video not found. Import it again.")
    try:
        return generate_roadmap(evidence)
    except MediaError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True))
