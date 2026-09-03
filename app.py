#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi>=0.115", "uvicorn>=0.30"]
# ///
"""Local-only Video Catalog server."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from catalog_db import _effective, connect, delete_montage_export, delete_montage_preset, import_directory, initialize, list_keywords, list_montage_exports, list_montage_presets, list_video_ids, list_videos, montage_export, record_montage_export, save_montage_preset, update, use_montage_preset


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
    return CatalogPaths(
        library_root=root,
        database_path=resolve_path(database_path) if database_path else root / "catalog.sqlite",
        json_directory=resolve_path(json_directory) if json_directory else root / "video_catalog_json",
        poster_directory=resolve_path(poster_directory) if poster_directory else root / ".catalog_posters",
        montage_directory=resolve_path(montage_directory) if montage_directory else root / ".catalog_montages",
    )


paths: CatalogPaths | None = None


def configure(value: CatalogPaths) -> None:
    global paths
    value.database_path.parent.mkdir(parents=True, exist_ok=True)
    paths = value


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
    fontSize: float = Field(ge=32, le=180)
    subtitleFontSize: float = Field(ge=16, le=120)


class MontageSettingsPayload(BaseModel):
    format: Literal["landscape", "portrait"]
    fillMismatchedOrientation: bool
    title: str = Field(max_length=200)
    titleSubtitle: str = Field(max_length=200)
    titleFontSize: float = Field(ge=32, le=180)
    titleSubtitleFontSize: float = Field(ge=16, le=120)
    transition: Literal["cut", "crossfade", "slide", "wipe"]
    transitionDuration: float = Field(ge=0, le=2)
    cutColor: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    endPage: MontageEndPage

    @model_validator(mode="after")
    def validate_transition_duration(self):
        if self.transition != "cut" and self.transitionDuration < 0.1:
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


app = FastAPI(title="Video Catalog")
jobs: dict[str, dict[str, object]] = {}
job_lock = threading.Lock()
capability_probe: dict[str, object] | None = None
capability_probe_lock = threading.Lock()
MONTAGE_PAGE_DURATION_SECONDS = 3
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
        file_for(video_id)
        duration = item.get("duration_seconds")
        if not isinstance(duration, (int, float)) or duration <= 0:
            raise HTTPException(422, f"Video duration is unavailable: {video_id}. Reanalyze the clip before creating a montage.")
        items.append({"id": item["id"], "title": item["title"], "duration_seconds": duration, "width": item.get("width"), "height": item.get("height"), "orientation": item.get("orientation") or "landscape", "media_url": f"/api/videos/{video_id}/media", "poster_url": f"/api/videos/{video_id}/poster"})
    return {"items": items}


@app.get("/api/keywords")
def keywords():
    connection = db()
    try:
        return {"items": list_keywords(connection)}
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
    return FileResponse(file_for(video_id), media_type="video/mp4")


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
                Path(str(job["output"])).unlink(missing_ok=True)
            return
        assert process.stdout is not None
        renderer_output: list[str] = []
        for line in process.stdout:
            try:
                event = json.loads(line)
                update_job(job_id, **{key: value for key, value in event.items() if key in {"progress", "stage"}})
            except json.JSONDecodeError:
                renderer_output.append(line.rstrip())
                renderer_output = renderer_output[-20:]
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
                Path(str(job["output"])).unlink(missing_ok=True)
        else:
            job = read_job(job_id)
            if not job:
                return
            connection = db()
            try:
                record_montage_export(
                    connection,
                    job_id,
                    str(job["title"]),
                    Path(str(job["output"])).name,
                    float(job["duration_seconds"]),
                )
            except Exception as error:
                Path(str(job["output"])).unlink(missing_ok=True)
                update_job(
                    job_id,
                    status="failed",
                    error_code="export_persistence_failed",
                    error=f"Rendered video could not be recorded: {error}",
                )
            else:
                update_job(job_id, status="completed", progress=1, stage="completed")
            finally:
                connection.close()
    finally:
        request_path.unlink(missing_ok=True)


def montage_filename(title: str, job_id: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", title).strip(".-")[:80] or "montage"
    return f"{stem}-{job_id}.mp4"


def montage_duration_seconds(spec: dict) -> float:
    clips = spec["clips"]
    clip_duration = sum(float(clip.get("duration_seconds") or 0) for clip in clips)
    gaps = max(0, len(clips) - 1)
    transition = float(spec["transitionDuration"])
    clip_duration += gaps * transition if spec["transition"] == "cut" else -gaps * transition
    total = clip_duration
    if spec["title"]:
        total += MONTAGE_PAGE_DURATION_SECONDS - 0.5
    if spec["endPage"]["enabled"]:
        total += MONTAGE_PAGE_DURATION_SECONDS - 0.5
    return max(0, total)


def validate_montage_transition(spec: dict) -> None:
    if spec["transition"] == "cut":
        return
    duration = float(spec["transitionDuration"])
    if any(float(clip["duration_seconds"]) <= duration for clip in spec["clips"]):
        raise HTTPException(400, "Transition duration must be shorter than every selected clip.")


@app.get("/api/montages/capabilities")
def montage_capabilities():
    global capability_probe
    with capability_probe_lock:
        if capability_probe is not None:
            return capability_probe
        root = active_paths().montage_directory
        root.mkdir(parents=True, exist_ok=True)
        probe_output = root / ".acceleration-probe.mp4"
        try:
            result = subprocess.run(
                ["node", "render.mjs", "--probe", str(probe_output)],
                cwd=Path(__file__).parent / "frontend",
                capture_output=True,
                text=True,
                timeout=120,
            )
            capability_probe = (
                {"accelerated": True}
                if result.returncode == 0
                else {
                    "accelerated": False,
                    "error_code": "hardware_acceleration_unavailable",
                    "reason": result.stderr[-800:] or "The required GPU encoder is unavailable.",
                }
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            capability_probe = {
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
        request_path = montage_root / f".{job_id}.json"
        request_path.write_text(json.dumps({"spec": spec, "output": str(output), "software_fallback": payload.software_fallback}), encoding="utf-8")
        jobs[job_id] = {"id": job_id, "title": spec["title"], "duration_seconds": montage_duration_seconds(spec), "status": "queued", "progress": 0, "stage": "queued", "output": str(output)}
        response = job_response(jobs[job_id])
        threading.Thread(target=_render_job, args=(job_id, request_path), daemon=True).start()
        return response


@app.get("/api/montages/{job_id}")
def montage_status(job_id: str):
    job = read_job(job_id)
    if not job:
        raise HTTPException(404, "Montage export not found")
    return job_response(job)


@app.get("/api/montages/{job_id}/download")
def download_montage(job_id: str):
    job = read_job(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Montage export is not ready")
    output = Path(str(job["output"]))
    if not output.is_file() or active_paths().montage_directory not in output.parents:
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
    if active_paths().montage_directory not in output.parents:
        raise HTTPException(404, "Montage file is unavailable")
    return output


@app.get("/api/montage-exports/{export_id}/media")
def stream_montage_export(export_id: int):
    return FileResponse(montage_export_path(export_id), media_type="video/mp4")


@app.delete("/api/montage-exports/{export_id}")
def remove_montage_export(export_id: int):
    entry = montage_export_entry(export_id)
    output = montage_export_file_path(entry)
    if output.is_file():
        output.unlink()
    connection = db()
    try:
        delete_montage_export(connection, export_id)
    except KeyError:
        raise HTTPException(404, "Montage export not found")
    finally:
        connection.close()
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
