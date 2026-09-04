#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi>=0.115", "uvicorn>=0.30"]
# ///
"""Local-only Video Catalog server."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from queue import Empty, Queue
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, FiniteFloat, model_validator

from catalog_db import _effective, connect, delete_montage_export, delete_montage_export_by_job, delete_montage_preset, import_directory, initialize, list_content_flags, list_keywords, list_montage_exports, list_montage_presets, list_video_ids, list_videos, montage_export, record_montage_export, restore_montage_export, save_montage_preset, update, use_montage_preset


@dataclass(frozen=True)
class CatalogPaths:
    library_root: Path
    database_path: Path
    json_directory: Path
    poster_directory: Path
    montage_directory: Path


def resolve_path(value: str | Path) -> Path:
    return Path(value).expanduser().resolve()


def load_local_environment(path: Path) -> None:
    """Load simple KEY=VALUE entries without overriding the calling shell."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#") or "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            os.environ.setdefault(key, value)


def catalog_paths(library_root: str | Path, database_path: str | Path | None = None, json_directory: str | Path | None = None, poster_directory: str | Path | None = None, montage_directory: str | Path | None = None) -> CatalogPaths:
    root = resolve_path(library_root)
    if not root.is_dir():
        raise ValueError(f"Video library does not exist or is not a directory: {root}")
    montage_root = resolve_path(montage_directory) if montage_directory else root / ".catalog_montages"
    if root.is_relative_to(montage_root):
        raise ValueError("Montage directory must not be the library root or one of its ancestors")
    return CatalogPaths(
        library_root=root,
        database_path=resolve_path(database_path) if database_path else root / "catalog.sqlite",
        json_directory=resolve_path(json_directory) if json_directory else root / "video_catalog_json",
        poster_directory=resolve_path(poster_directory) if poster_directory else root / ".catalog_posters",
        montage_directory=montage_root,
    )


paths: CatalogPaths | None = None


def configure(value: CatalogPaths) -> None:
    global paths, server_stopping
    value.database_path.parent.mkdir(parents=True, exist_ok=True)
    paths = value
    server_stopping = False


def active_paths() -> CatalogPaths:
    if paths is None:
        raise RuntimeError("Configure VIDEO_CATALOG_LIBRARY_ROOT or run app.py with --library-root.")
    return paths


def db():
    connection = connect(active_paths().database_path)
    initialize(connection)
    return connection


def record(video_id: str):
    connection = db()
    try:
        return _effective(connection, video_id)
    except KeyError:
        raise HTTPException(404, "Video not found")
    finally:
        connection.close()


def file_for(video_id: str) -> Path:
    relative = Path(record(video_id)["current_path"])
    root = active_paths().library_root
    target = (root / relative).resolve()
    if root not in target.parents or not target.is_file():
        raise HTTPException(404, "Media file is unavailable")
    return target


class UpdatePayload(BaseModel):
    title: str | None = None
    summary: str | None = None
    keywords: list[str] | None = None
    language: str | None = None
    transcript: str | None = None
    visible_text: list[str] | None = None
    content_flags: list[str] | None = None
    likeness_references: list[dict] | None = None
    review_status: str | None = None
    rating: int | None = None
    favorite: bool | None = None
    publishable: bool | None = None
    notes: str | None = None


class BatchPayload(BaseModel):
    ids: list[str]


class MontageEndPage(BaseModel):
    enabled: bool
    title: str = Field(max_length=200)
    subtitle: str = Field(max_length=200)
    fontSize: FiniteFloat = Field(ge=32, le=180)
    subtitleFontSize: FiniteFloat = Field(ge=16, le=120)


class MontageSettingsPayload(BaseModel):
    format: Literal["landscape", "portrait"]
    fillMismatchedOrientation: bool
    title: str = Field(max_length=200)
    titleSubtitle: str = Field(max_length=200)
    titleFontSize: FiniteFloat = Field(ge=32, le=180)
    titleSubtitleFontSize: FiniteFloat = Field(ge=16, le=120)
    transition: Literal["cut", "film-cut", "crossfade", "slide", "wipe"]
    transitionDuration: FiniteFloat = Field(ge=0, le=2)
    cutColor: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    endPage: MontageEndPage

    @model_validator(mode="after")
    def validate_transition_duration(self):
        if self.transition not in {"cut", "film-cut"} and self.transitionDuration < 0.1:
            raise ValueError("Non-cut transitions must last at least 0.1 seconds")
        return self


class MontageClipPayload(BaseModel):
    id: str


class MontageSpecPayload(MontageSettingsPayload):
    clips: list[MontageClipPayload] = Field(min_length=2)


class MontageRequest(BaseModel):
    spec: MontageSpecPayload
    software_fallback: bool = False


class MontagePresetPayload(BaseModel):
    name: str
    settings: MontageSettingsPayload


def media_type_for(source: Path) -> str:
    return {
        ".mp4": "video/mp4",
        ".m4v": "video/x-m4v",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
    }.get(source.suffix.lower(), "application/octet-stream")


def browser_media_error(source: Path, technical: dict[str, object]) -> str | None:
    video = technical.get("video")
    audio = technical.get("audio")
    video_codec = video.get("codec") if isinstance(video, dict) else None
    audio_codec = audio.get("codec") if isinstance(audio, dict) else None
    container_names = {
        name.strip()
        for name in str(technical.get("container") or "").split(",")
        if name.strip()
    }
    suffix = source.suffix.lower()
    if suffix in {".mp4", ".m4v"}:
        if container_names and not container_names & {"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}:
            return f"container {', '.join(sorted(container_names))}"
        if video_codec not in {"h264", "av1"}:
            return f"video codec {video_codec or 'unknown'}"
        if audio_codec not in {None, "aac"}:
            return f"audio codec {audio_codec}"
        return None
    if suffix == ".webm":
        if container_names and "webm" not in container_names:
            return f"container {', '.join(sorted(container_names))}"
        if video_codec not in {"vp8", "vp9", "av1"}:
            return f"video codec {video_codec or 'unknown'}"
        if audio_codec not in {None, "opus", "vorbis"}:
            return f"audio codec {audio_codec}"
        return None
    return f"container {suffix.lstrip('.') or 'unknown'}"


app = FastAPI(title="Video Catalog")
jobs: dict[str, dict[str, object]] = {}
job_lock = threading.Lock()
render_processes: dict[str, tuple[subprocess.Popen[str], Path, Path]] = {}
render_process_lock = threading.Lock()
montage_export_lock = threading.Lock()
server_stopping = False
capability_probe: dict[str, object] | None = None
capability_probe_lock = threading.Lock()
MONTAGE_PAGE_DURATION_SECONDS = 3
RENDER_TIMEOUT_SECONDS = 3600
JOB_RESPONSE_FIELDS = (
    "id",
    "title",
    "duration_seconds",
    "status",
    "progress",
    "stage",
    "error_code",
    "error",
)


def job_response(job: dict[str, object]) -> dict[str, object]:
    return {field: job[field] for field in JOB_RESPONSE_FIELDS if field in job}


def read_job(job_id: str) -> dict[str, object] | None:
    with job_lock:
        job = jobs.get(job_id)
        return dict(job) if job else None


def update_job(job_id: str, **changes: object) -> dict[str, object] | None:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return None
        job.update(changes)
        return dict(job)


def rendered_output_path(job: dict[str, object]) -> Path:
    return Path(str(job.get("render_output", job["output"])))


def remove_rendered_output(job: dict[str, object]) -> None:
    rendered_output_path(job).unlink(missing_ok=True)


def terminate_renderer(process: subprocess.Popen[str]) -> None:
    poll = getattr(process, "poll", None)
    if callable(poll) and poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


@app.get("/api/videos")
def videos(request: Request, q: str = "", language: str = "", orientation: str = "", speech: str = "", review: str = "", favorite: str = "", publishable: str = "", flag: str = "", sort: str = "newest", limit: int = 48, offset: int = 0):
    connection = db()
    try:
        items, total = list_videos(connection, q=q, language=language, orientation=orientation, speech=speech, review=review, favorite=favorite, publishable=publishable, flag=flag, sort=sort, limit=limit, offset=offset)
        return {"items": items, "total": total}
    finally:
        connection.close()


@app.get("/api/videos/selection")
def selection(q: str = "", language: str = "", orientation: str = "", speech: str = "", review: str = "", favorite: str = "", publishable: str = "", flag: str = "", sort: str = "newest"):
    connection = db()
    try:
        return {"items": list_video_ids(connection, q=q, language=language, orientation=orientation, speech=speech, review=review, favorite=favorite, publishable=publishable, flag=flag, sort=sort)}
    finally:
        connection.close()


@app.post("/api/videos/batch")
def batch_videos(payload: BatchPayload):
    if len(payload.ids) < 2 or len(payload.ids) != len(set(payload.ids)):
        raise HTTPException(400, "Provide at least two unique video IDs")
    items = []
    for video_id in payload.ids:
        item = record(video_id)
        source = file_for(video_id)
        duration = item.get("duration_seconds")
        if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            raise HTTPException(422, f"Video duration is unavailable: {video_id}. Reanalyze the clip before creating a montage.")
        try:
            technical = json.loads(str(item["raw_json"])).get("technical", {})
        except (KeyError, TypeError, json.JSONDecodeError):
            technical = {}
        browser_error = browser_media_error(source, technical)
        if browser_error:
            raise HTTPException(
                422,
                f"Video {item['title'] or video_id} uses an unsupported browser media format ({browser_error}). "
                "Reencode it to H.264/AAC MP4 before creating a montage.",
            )
        items.append({"id": item["id"], "title": item["title"], "duration_seconds": duration, "width": item.get("width"), "height": item.get("height"), "orientation": item.get("orientation") or "landscape", "media_url": f"/api/videos/{video_id}/media", "poster_url": f"/api/videos/{video_id}/poster"})
    return {"items": items}


@app.get("/api/keywords")
def keywords():
    connection = db()
    try:
        return {"items": list_keywords(connection)}
    finally:
        connection.close()


@app.get("/api/content-flags")
def content_flags():
    connection = db()
    try:
        return {"items": list_content_flags(connection)}
    finally:
        connection.close()


@app.get("/api/videos/{video_id}")
def get_video(video_id: str):
    return record(video_id)


@app.patch("/api/videos/{video_id}")
def patch_video(video_id: str, payload: UpdatePayload):
    connection = db()
    try:
        return update(connection, video_id, payload.model_dump(exclude_unset=True))
    except (KeyError, ValueError) as error:
        raise HTTPException(400, str(error))
    finally:
        connection.close()


@app.post("/api/import")
def reimport():
    connection = db()
    try:
        return import_directory(connection, active_paths().json_directory)
    finally:
        connection.close()


@app.get("/api/videos/{video_id}/media")
def media(video_id: str):
    source = file_for(video_id)
    return FileResponse(source, media_type=media_type_for(source))


@app.get("/api/videos/{video_id}/integrity")
def video_integrity(video_id: str):
    try:
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type:format=duration",
                "-of",
                "json",
                str(file_for(video_id)),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"valid": False, "reason": "FFmpeg could not inspect this video file."}
    if probe.returncode != 0:
        return {"valid": False, "reason": "FFmpeg could not read this video file."}
    try:
        details = json.loads(probe.stdout)
    except json.JSONDecodeError:
        return {"valid": False, "reason": "FFmpeg returned invalid video metadata."}
    if not any(stream.get("codec_type") == "video" for stream in details.get("streams", [])):
        return {"valid": False, "reason": "This file does not contain a video stream."}
    duration = details.get("format", {}).get("duration")
    try:
        if not math.isfinite(float(duration)) or float(duration) <= 0:
            return {"valid": False, "reason": "This video has no readable duration."}
    except (TypeError, ValueError):
        return {"valid": False, "reason": "This video has no readable duration."}
    return {"valid": True, "reason": "Video file is readable."}


@app.get("/api/videos/{video_id}/poster")
def poster(video_id: str):
    output_directory = active_paths().poster_directory
    output_directory.mkdir(parents=True, exist_ok=True)
    output = output_directory / f"{video_id}.jpg"
    if not output.exists():
        try:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", str(file_for(video_id)), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", "-y", str(output)], check=True)
        except subprocess.CalledProcessError:
            raise HTTPException(422, "Could not generate poster")
    return FileResponse(output, media_type="image/jpeg")


def _render_job(job_id: str, request_path: Path) -> None:
    update_job(job_id, status="rendering")
    process: subprocess.Popen[str] | None = None
    try:
        try:
            process = subprocess.Popen(
                ["node", "render.mjs", str(request_path)],
                cwd=Path(__file__).parent / "frontend",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except OSError as error:
            update_job(
                job_id,
                status="failed",
                error_code="render_failed",
                error=f"Could not start Remotion renderer: {error}",
            )
            job = read_job(job_id)
            if job:
                remove_rendered_output(job)
            return
        job = read_job(job_id)
        if not job:
            terminate_renderer(process)
            return
        with render_process_lock:
            render_processes[job_id] = (process, request_path, rendered_output_path(job))
        assert process.stdout is not None
        renderer_output: list[str] = []
        output_queue: Queue[str | None] = Queue()

        def drain_renderer_output() -> None:
            for line in process.stdout:
                output_queue.put(line)
            output_queue.put(None)

        try:
            threading.Thread(target=drain_renderer_output, daemon=True).start()
        except RuntimeError as error:
            terminate_renderer(process)
            update_job(
                job_id,
                status="failed",
                error_code="render_failed",
                error=f"Could not read Remotion renderer output: {error}",
            )
            job = read_job(job_id)
            if job:
                remove_rendered_output(job)
            return
        deadline = time.monotonic() + RENDER_TIMEOUT_SECONDS
        timed_out = False
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                terminate_renderer(process)
                break
            try:
                line = output_queue.get(timeout=min(1, remaining))
            except Empty:
                continue
            if line is None:
                break
            try:
                event = json.loads(line)
                update_job(job_id, **{key: value for key, value in event.items() if key in {"progress", "stage"}})
            except json.JSONDecodeError:
                renderer_output.append(line.rstrip())
                renderer_output = renderer_output[-20:]
        if timed_out:
            update_job(
                job_id,
                status="failed",
                error_code="render_timeout",
                error=f"Remotion renderer exceeded the {RENDER_TIMEOUT_SECONDS}-second time limit.",
            )
            job = read_job(job_id)
            if job:
                remove_rendered_output(job)
            return
        if process.wait() != 0:
            error = "\n".join(renderer_output)[-800:] or "Remotion renderer failed"
            update_job(
                job_id,
                status="failed",
                error_code="hardware_acceleration_unavailable" if "hardware" in error.lower() or "videotoolbox" in error.lower() else "render_failed",
                error=error,
            )
            job = read_job(job_id)
            if job:
                remove_rendered_output(job)
        else:
            job = read_job(job_id)
            if not job or job["status"] != "rendering":
                return
            try:
                persist_montage_export(job_id, job)
            except Exception as error:
                update_job(
                    job_id,
                    status="failed",
                    error_code="export_persistence_failed",
                    error=f"Rendered video could not be recorded: {error}",
                )
                try:
                    remove_rendered_output(job)
                except OSError:
                    pass
            else:
                try:
                    with render_process_lock:
                        if server_stopping:
                            raise OSError("Server is stopping")
                        rendered_output_path(job).replace(Path(str(job["output"])))
                except OSError as error:
                    connection = None
                    try:
                        connection = db()
                        delete_montage_export_by_job(connection, job_id)
                    except sqlite3.Error:
                        pass
                    finally:
                        if connection is not None:
                            connection.close()
                    update_job(
                        job_id,
                        status="failed",
                        error_code="render_failed",
                        error=f"Rendered video could not be published: {error}",
                    )
                    try:
                        remove_rendered_output(job)
                    except OSError:
                        pass
                else:
                    update_job(job_id, status="completed", progress=1, stage="completed")
    except Exception as error:
        if process is not None:
            terminate_renderer(process)
        update_job(
            job_id,
            status="failed",
            error_code="render_failed",
            error=f"Montage renderer stopped unexpectedly: {error}",
        )
        job = read_job(job_id)
        if job:
            try:
                remove_rendered_output(job)
            except OSError:
                pass
    finally:
        with render_process_lock:
            render_processes.pop(job_id, None)
        request_path.unlink(missing_ok=True)


@app.on_event("shutdown")
def stop_renderers() -> None:
    global server_stopping
    with render_process_lock:
        server_stopping = True
        active_renderers = list(render_processes.items())
        render_processes.clear()
    for job_id, (process, request_path, rendered_output) in active_renderers:
        terminate_renderer(process)
        update_job(
            job_id,
            status="failed",
            error_code="render_interrupted",
            error="Montage rendering was interrupted while the server was stopping.",
        )
        try:
            rendered_output.unlink(missing_ok=True)
        except OSError:
            pass
        request_path.unlink(missing_ok=True)


def persist_montage_export(job_id: str, job: dict[str, object]) -> None:
    for attempt in range(3):
        connection = None
        try:
            connection = db()
            record_montage_export(
                connection,
                job_id,
                str(job["title"]),
                Path(str(job["output"])).name,
                float(job["duration_seconds"]),
            )
            return
        except sqlite3.OperationalError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
        finally:
            if connection is not None:
                connection.close()


def montage_filename(title: str, job_id: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", title).strip(".-")[:80] or "montage"
    return f"{stem}-{job_id}.mp4"


def montage_duration_seconds(spec: dict) -> float:
    clips = spec["clips"]
    fps = 30
    frame_count = lambda seconds: max(1, math.floor(float(seconds) * fps + 0.5))
    optional_frame_count = lambda seconds: max(0, math.floor(float(seconds) * fps + 0.5))
    clip_duration = sum(frame_count(clip.get("duration_seconds") or 0) for clip in clips)
    gaps = max(0, len(clips) - 1)
    transition = optional_frame_count(spec["transitionDuration"])
    clip_duration += gaps * transition if spec["transition"] in {"cut", "film-cut"} else -gaps * max(1, transition)
    total = clip_duration
    if spec["title"]:
        total += frame_count(MONTAGE_PAGE_DURATION_SECONDS) - frame_count(0.5)
    if spec["endPage"]["enabled"]:
        total += frame_count(MONTAGE_PAGE_DURATION_SECONDS) - frame_count(0.5)
    return max(0, total) / fps


def validate_montage_transition(spec: dict) -> None:
    if spec["transition"] in {"cut", "film-cut"}:
        return
    duration_frames = max(1, math.floor(float(spec["transitionDuration"]) * 30 + 0.5))
    if any(
        max(1, math.floor(float(clip["duration_seconds"]) * 30 + 0.5)) <= duration_frames
        for clip in spec["clips"]
    ):
        raise HTTPException(400, "Transition duration must be shorter than every selected clip.")


def is_hardware_acceleration_failure(error: str) -> bool:
    normalized = error.lower()
    return "hardware" in normalized or "videotoolbox" in normalized


@app.get("/api/montages/capabilities")
def montage_capabilities():
    global capability_probe
    with capability_probe_lock:
        if capability_probe is not None:
            return capability_probe
        root = active_paths().montage_directory
        root.mkdir(parents=True, exist_ok=True)
        probe_descriptor, probe_path = tempfile.mkstemp(
            dir=root,
            prefix=".acceleration-probe-",
            suffix=".mp4",
        )
        os.close(probe_descriptor)
        probe_output = Path(probe_path)
        probe_output.unlink()
        try:
            result = subprocess.run(
                ["node", "render.mjs", "--probe", str(probe_output)],
                cwd=Path(__file__).parent / "frontend",
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                capability_probe = {"accelerated": True}
            else:
                reason = result.stderr[-800:] or "The required GPU encoder is unavailable."
                response = {
                    "accelerated": False,
                    "error_code": "hardware_acceleration_unavailable",
                    "reason": reason,
                }
                if is_hardware_acceleration_failure(reason):
                    capability_probe = response
                else:
                    return response
        except (OSError, subprocess.TimeoutExpired) as error:
            return {
                "accelerated": False,
                "error_code": "hardware_acceleration_unavailable",
                "reason": str(error),
            }
        finally:
            probe_output.unlink(missing_ok=True)
        return capability_probe


@app.get("/api/montage-presets")
def montage_presets():
    connection = db()
    try:
        return {"items": list_montage_presets(connection)}
    finally:
        connection.close()


@app.post("/api/montage-presets")
def create_montage_preset(payload: MontagePresetPayload):
    connection = db()
    try:
        return save_montage_preset(connection, payload.name, payload.settings.model_dump())
    except ValueError as error:
        raise HTTPException(400, str(error))
    finally:
        connection.close()


@app.put("/api/montage-presets/{preset_id}")
def update_montage_preset(preset_id: int, payload: MontagePresetPayload):
    connection = db()
    try:
        return save_montage_preset(connection, payload.name, payload.settings.model_dump(), preset_id)
    except KeyError:
        raise HTTPException(404, "Montage preset not found")
    except ValueError as error:
        raise HTTPException(400, str(error))
    finally:
        connection.close()


@app.post("/api/montage-presets/{preset_id}/use")
def mark_montage_preset_used(preset_id: int):
    connection = db()
    try:
        use_montage_preset(connection, preset_id)
    except KeyError:
        raise HTTPException(404, "Montage preset not found")
    finally:
        connection.close()


@app.delete("/api/montage-presets/{preset_id}")
def remove_montage_preset(preset_id: int):
    connection = db()
    try:
        delete_montage_preset(connection, preset_id)
    except KeyError:
        raise HTTPException(404, "Montage preset not found")
    finally:
        connection.close()
    return {"deleted": True}


@app.post("/api/montages")
def create_montage(payload: MontageRequest, request: Request):
    with job_lock:
        if any(job["status"] in {"queued", "rendering"} for job in jobs.values()):
            raise HTTPException(409, "Another montage export is already running")
        spec = payload.spec.model_dump()
        ids = [clip.id for clip in payload.spec.clips]
        if len(set(ids)) != len(ids):
            raise HTTPException(400, "Montage clips must be unique catalog IDs")
        # Resolve authoritative catalog URLs; never trust browser paths or metadata.
        authoritative = batch_videos(BatchPayload(ids=ids))["items"]
        base_url = str(request.base_url).rstrip("/")
        for clip in authoritative:
            clip["media_url"] = base_url + clip["media_url"]
        spec["clips"] = authoritative
        validate_montage_transition(spec)
        montage_root = active_paths().montage_directory
        montage_root.mkdir(parents=True, exist_ok=True)
        job_id = uuid.uuid4().hex
        output = montage_root / montage_filename(spec["title"], job_id)
        render_output = montage_root / f".{job_id}.rendering.mp4"
        request_path = montage_root / f".{job_id}.json"
        request_path.write_text(json.dumps({"spec": spec, "output": str(render_output), "software_fallback": payload.software_fallback}), encoding="utf-8")
        jobs[job_id] = {"id": job_id, "title": spec["title"], "duration_seconds": montage_duration_seconds(spec), "status": "queued", "progress": 0, "stage": "queued", "output": str(output), "render_output": str(render_output)}
        response = job_response(jobs[job_id])
        try:
            threading.Thread(target=_render_job, args=(job_id, request_path), daemon=True).start()
        except RuntimeError as error:
            jobs.pop(job_id, None)
            request_path.unlink(missing_ok=True)
            raise HTTPException(500, "Could not start montage export") from error
        return response


@app.get("/api/montages/{job_id}")
def montage_status(job_id: str):
    job = read_job(job_id)
    if not job:
        raise HTTPException(404, "Montage export not found")
    return job_response(job)


@app.get("/api/montages/{job_id}/artifact")
def montage_artifact_path(job_id: str):
    job = read_job(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Montage export is not ready")
    output = contained_montage_path(Path(str(job["output"])))
    if not output.is_file():
        raise HTTPException(404, "Montage file is unavailable")
    return {"path": str(output)}


@app.get("/api/montages/{job_id}/download")
def download_montage(job_id: str):
    job = read_job(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Montage export is not ready")
    output = contained_montage_path(Path(str(job["output"])))
    if not output.is_file():
        raise HTTPException(404, "Montage file is unavailable")
    return FileResponse(output, media_type="video/mp4", filename=output.name)


@app.get("/api/montage-exports")
def montage_exports():
    connection = db()
    try:
        return {"items": list_montage_exports(connection)}
    finally:
        connection.close()


@app.get("/api/montage-exports/{export_id}/download")
def download_montage_export(export_id: int):
    output = montage_export_path(export_id)
    return FileResponse(output, media_type="video/mp4", filename=output.name)


def montage_export_path(export_id: int) -> Path:
    entry = montage_export_entry(export_id)
    output = montage_export_file_path(entry)
    if not output.is_file():
        raise HTTPException(404, "Montage file is unavailable")
    return output


def montage_export_entry(export_id: int) -> dict[str, object]:
    connection = db()
    try:
        return montage_export(connection, export_id)
    except KeyError:
        raise HTTPException(404, "Montage export not found")
    finally:
        connection.close()


def montage_export_file_path(entry: dict[str, object]) -> Path:
    output = active_paths().montage_directory / Path(str(entry["filename"])).name
    contained_montage_path(output)
    return output


def contained_montage_path(output: Path) -> Path:
    root = active_paths().montage_directory.resolve()
    resolved_output = output.resolve()
    try:
        resolved_output.relative_to(root)
    except ValueError:
        raise HTTPException(404, "Montage file is unavailable")
    return resolved_output


@app.get("/api/montage-exports/{export_id}/media")
def stream_montage_export(export_id: int):
    return FileResponse(montage_export_path(export_id), media_type="video/mp4")


@app.delete("/api/montage-exports/{export_id}")
def remove_montage_export(export_id: int):
    with montage_export_lock:
        return _remove_montage_export(export_id)


def _remove_montage_export(export_id: int):
    entry = montage_export_entry(export_id)
    output = montage_export_file_path(entry)
    staged = output.with_name(f".{uuid.uuid4().hex}-{output.name}")
    if output.exists():
        try:
            output.replace(staged)
        except OSError as error:
            raise HTTPException(500, "Could not prepare montage file for deletion") from error
    connection = None
    try:
        connection = db()
        delete_montage_export(connection, export_id)
    except (KeyError, sqlite3.Error) as error:
        if staged.exists():
            try:
                staged.replace(output)
            except OSError:
                pass
        if isinstance(error, KeyError):
            raise HTTPException(404, "Montage export not found") from error
        raise HTTPException(500, "Could not delete montage export") from error
    finally:
        if connection is not None:
            connection.close()
    if staged.exists():
        try:
            staged.unlink()
        except OSError as error:
            connection = db()
            try:
                restore_montage_export(connection, entry)
                staged.replace(output)
            finally:
                connection.close()
            raise HTTPException(500, "Could not remove montage file") from error
    return {"deleted": True}


@app.get("/")
@app.get("/montage")
@app.get("/montages")
def frontend():
    return FileResponse(Path(__file__).parent / "frontend" / "dist" / "index.html")


frontend_assets = Path(__file__).parent / "frontend" / "dist" / "assets"
if frontend_assets.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_assets), name="assets")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Video Catalog server.")
    parser.add_argument("--library-root", default=os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT"), help="Directory containing the video files and analysis JSON.")
    parser.add_argument("--database", default=os.environ.get("VIDEO_CATALOG_DATABASE_PATH"), help="SQLite database path (defaults to <library-root>/catalog.sqlite).")
    parser.add_argument("--json-directory", default=os.environ.get("VIDEO_CATALOG_JSON_DIRECTORY"), help="Analysis JSON directory (defaults to <library-root>/video_catalog_json).")
    parser.add_argument("--poster-directory", default=os.environ.get("VIDEO_CATALOG_POSTER_DIRECTORY"), help="Poster cache directory (defaults to <library-root>/.catalog_posters).")
    parser.add_argument("--montage-directory", default=os.environ.get("VIDEO_CATALOG_MONTAGE_DIRECTORY"), help="Montage export directory (defaults to <library-root>/.catalog_montages).")
    parser.add_argument("--port", type=int, default=int(os.environ.get("VIDEO_CATALOG_PORT", "8765")), help="Localhost port (default: 8765).")
    arguments = parser.parse_args()
    if not arguments.library_root:
        parser.error("--library-root or VIDEO_CATALOG_LIBRARY_ROOT is required")
    return arguments


load_local_environment(Path(__file__).with_name(".env"))
RENDER_TIMEOUT_SECONDS = int(os.environ.get("VIDEO_CATALOG_RENDER_TIMEOUT_SECONDS", "3600"))


if os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT"):
    configure(catalog_paths(
        os.environ["VIDEO_CATALOG_LIBRARY_ROOT"],
        os.environ.get("VIDEO_CATALOG_DATABASE_PATH"),
        os.environ.get("VIDEO_CATALOG_JSON_DIRECTORY"),
        os.environ.get("VIDEO_CATALOG_POSTER_DIRECTORY"),
        os.environ.get("VIDEO_CATALOG_MONTAGE_DIRECTORY"),
    ))


if __name__ == "__main__":
    arguments = parse_arguments()
    configure(catalog_paths(arguments.library_root, arguments.database, arguments.json_directory, arguments.poster_directory, arguments.montage_directory))
    connection = db()
    try:
        import_directory(connection, active_paths().json_directory)
    finally:
        connection.close()
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=arguments.port)
