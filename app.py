#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi>=0.115", "uvicorn>=0.30"]
# ///
"""Local-only Video Catalog server."""
from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from catalog_db import _effective, connect, import_directory, initialize, list_keywords, list_videos, update


@dataclass(frozen=True)
class CatalogPaths:
    library_root: Path
    database_path: Path
    json_directory: Path
    poster_directory: Path


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


def catalog_paths(library_root: str | Path, database_path: str | Path | None = None, json_directory: str | Path | None = None, poster_directory: str | Path | None = None) -> CatalogPaths:
    root = resolve_path(library_root)
    if not root.is_dir():
        raise ValueError(f"Video library does not exist or is not a directory: {root}")
    return CatalogPaths(
        library_root=root,
        database_path=resolve_path(database_path) if database_path else root / "catalog.sqlite",
        json_directory=resolve_path(json_directory) if json_directory else root / "video_catalog_json",
        poster_directory=resolve_path(poster_directory) if poster_directory else root / ".catalog_posters",
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


app = FastAPI(title="Video Catalog")


@app.get("/api/videos")
def videos(request: Request, q: str = "", language: str = "", orientation: str = "", speech: str = "", review: str = "", favorite: str = "", publishable: str = "", flag: str = "", sort: str = "newest", limit: int = 48, offset: int = 0):
    connection = db()
    try:
        items, total = list_videos(connection, q=q, language=language, orientation=orientation, speech=speech, review=review, favorite=favorite, publishable=publishable, flag=flag, sort=sort, limit=limit, offset=offset)
        return {"items": items, "total": total}
    finally:
        connection.close()


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


app.mount("/", StaticFiles(directory=Path(__file__).parent / "frontend" / "dist", html=True), name="frontend")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Video Catalog server.")
    parser.add_argument("--library-root", default=os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT"), help="Directory containing the video files and analysis JSON.")
    parser.add_argument("--database", default=os.environ.get("VIDEO_CATALOG_DATABASE_PATH"), help="SQLite database path (defaults to <library-root>/catalog.sqlite).")
    parser.add_argument("--json-directory", default=os.environ.get("VIDEO_CATALOG_JSON_DIRECTORY"), help="Analysis JSON directory (defaults to <library-root>/video_catalog_json).")
    parser.add_argument("--poster-directory", default=os.environ.get("VIDEO_CATALOG_POSTER_DIRECTORY"), help="Poster cache directory (defaults to <library-root>/.catalog_posters).")
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
    ))


if __name__ == "__main__":
    arguments = parse_arguments()
    configure(catalog_paths(arguments.library_root, arguments.database, arguments.json_directory, arguments.poster_directory))
    connection = db()
    try:
        import_directory(connection, active_paths().json_directory)
    finally:
        connection.close()
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=arguments.port)
