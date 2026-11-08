"""Video storage, validation, and bounded public-Reel extraction."""

from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit
from uuid import uuid4

import imageio_ffmpeg

DATA_DIR = Path(__file__).resolve().parent / "data"
MAX_BYTES = 50 * 1024 * 1024
MAX_SECONDS = 180


class MediaError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def new_video_path() -> Path:
    DATA_DIR.mkdir(exist_ok=True)
    return DATA_DIR / f"{uuid4()}.mp4"


def remove_video(path: Path) -> None:
    # Also remove yt-dlp's partial file after failures or timeouts.
    for candidate in DATA_DIR.glob(f"{path.stem}.*"):
        candidate.unlink(missing_ok=True)


def normalize_reel_url(value: str) -> str:
    try:
        parsed = urlsplit(value.strip())
        valid_host = (parsed.scheme == "https" and parsed.hostname in
                      {"www.instagram.com", "instagram.com"} and
                      parsed.port is None and parsed.username is None and
                      parsed.password is None)
    except ValueError:
        valid_host = False
    if not valid_host:
        raise MediaError("Enter a public Instagram Reel URL starting with https://.")
    match = re.fullmatch(r"/(?:[A-Za-z0-9_.]+/)?reels?/([A-Za-z0-9_-]+)/?", parsed.path)
    if not match:
        raise MediaError("Use a Reel link, rather than an Instagram profile or post.")
    return f"https://www.instagram.com/reel/{match.group(1)}/"


def inspect_video(path: Path, source: str, filename: str) -> dict:
    if not path.is_file() or not path.stat().st_size:
        raise MediaError("No video was received. Try uploading an MP4.")
    if path.stat().st_size > MAX_BYTES:
        raise MediaError("The video is larger than 50 MB. Choose a smaller clip.", 413)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        metadata = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path)],
            capture_output=True, text=True, errors="replace", timeout=15,
        ).stderr
        duration_match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", metadata)
        if "Video:" not in metadata or duration_match is None:
            raise MediaError("This file does not contain a readable video.")
        duration = (int(duration_match[1]) * 3600 + int(duration_match[2]) * 60
                    + float(duration_match[3]))
        if duration <= 0 or duration > MAX_SECONDS:
            raise MediaError("Choose a video up to 3 minutes long.")
        # A readable header alone is insufficient: decode one actual video frame.
        decoded = subprocess.run(
            [ffmpeg, "-v", "error", "-i", str(path), "-map", "0:v:0",
             "-frames:v", "1", "-f", "null", "-"],
            capture_output=True, timeout=15,
        )
        if decoded.returncode:
            raise MediaError("The video appears damaged or uses an unreadable codec.")
    except subprocess.TimeoutExpired:
        raise MediaError("Video validation took too long. Try a different MP4.", 504)
    return {
        "id": path.stem, "url": f"/api/videos/{path.stem}/content",
        "source": source, "filename": filename, "bytes": path.stat().st_size,
        "duration_seconds": round(duration, 2), "has_audio": "Audio:" in metadata,
    }


def download_reel(value: str) -> dict:
    url = normalize_reel_url(value)
    path = new_video_path()
    command = [
        sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist",
        "--no-progress", "--no-colors", "--socket-timeout", "15",
        "--retries", "0", "--extractor-retries", "0", "--fragment-retries", "0",
        "--max-filesize", "50M",
        "--format", "best[ext=mp4][height<=720]/best[ext=mp4]",
        "--output", str(path), url,
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                errors="replace", timeout=75)
        if result.returncode:
            raise MediaError("Instagram could not provide this Reel. Try a public link or upload the MP4.", 502)
        return inspect_video(path, "instagram", "Instagram Reel")
    except subprocess.TimeoutExpired:
        remove_video(path)
        raise MediaError("Instagram took too long to respond. Try uploading the MP4.", 504)
    except Exception:
        remove_video(path)
        raise
