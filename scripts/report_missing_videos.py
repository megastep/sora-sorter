#!/usr/bin/env python3
"""Report catalog records whose last known media path is unavailable.

Example:
  uv run python scripts/report_missing_videos.py
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, NamedTuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from catalog_db import connect, initialize


VIDEO_EXTENSIONS = {'.m4v', '.mkv', '.mov', '.mp4', '.webm'}


class MissingVideo(NamedTuple):
    video_id: str
    filename: str
    checksum: str


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
        if key:
            os.environ.setdefault(key, value.strip().strip("\"'"))


def last_stored_sha(record: dict[str, Any], fallback: str) -> str:
    file_info = record.get("file")
    if isinstance(file_info, dict) and isinstance(file_info.get("sha256"), str):
        return file_info["sha256"]
    return fallback


def is_available(library_root: Path, current_path: str) -> bool:
    resolved_root = library_root.resolve()
    candidate = (resolved_root / Path(current_path)).resolve()
    return candidate.is_relative_to(resolved_root) and candidate.is_file()


def missing_videos(database_path: Path, library_root: Path) -> list[MissingVideo]:
    connection = connect(database_path)
    try:
        initialize(connection)
        rows = connection.execute(
            "SELECT id, original_filename, current_path, raw_json FROM videos ORDER BY original_filename COLLATE NOCASE, id"
        )
        missing: list[MissingVideo] = []
        for row in rows:
            if is_available(library_root, row["current_path"]):
                continue
            try:
                record = json.loads(row["raw_json"])
            except json.JSONDecodeError:
                record = {}
            filename = row["original_filename"] or Path(row["current_path"]).name
            missing.append(MissingVideo(row['id'], filename, last_stored_sha(record, row['id'])))
        return missing
    finally:
        connection.close()


def sha256_file(path: Path) -> str:
    """Return the SHA-256 digest for one candidate media file."""
    digest = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def locate_files_by_sha(library_root: Path, checksums: set[str]) -> dict[str, str]:
    """Locate supported media files matching checksums, without modifying the catalog."""
    resolved_root = library_root.resolve()
    remaining = set(checksums)
    matches: dict[str, str] = {}

    for directory, _, filenames in os.walk(resolved_root, onerror=lambda _: None):
        for filename in filenames:
            if not remaining:
                return matches
            candidate = Path(directory, filename)
            if candidate.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            try:
                resolved_candidate = candidate.resolve()
                if not resolved_candidate.is_relative_to(resolved_root) or not resolved_candidate.is_file():
                    continue
                checksum = sha256_file(resolved_candidate)
            except OSError:
                continue
            if checksum in remaining:
                matches[checksum] = str(resolved_candidate.relative_to(resolved_root))
                remaining.remove(checksum)

    return matches


def unique_processed_target(source: Path, processed: Path, checksum: str) -> Path:
    """Choose an unused target without overwriting a recovered media file."""
    processed.mkdir(parents=True, exist_ok=True)
    candidates = [processed / source.name]
    candidates.extend(
        processed / f'{source.stem}-{checksum[:8]}-{index}{source.suffix.lower()}'
        for index in range(2, 10_000)
    )
    return next(candidate for candidate in candidates if not candidate.exists())


def move_without_overwrite(source: Path, target: Path, checksum: str) -> Path:
    """Atomically publish a verified file at target, preserving any existing file."""
    if source == target:
        return source
    try:
        os.link(source, target)
    except FileExistsError as error:
        raise RuntimeError(f'Refusing to overwrite existing file: {target}') from error
    except OSError as error:
        completed = subprocess.run(['mv', '-n', str(source), str(target)], text=True, capture_output=True)
        if completed.returncode != 0 or source.exists() or not target.is_file():
            detail = completed.stderr.strip() or str(error)
            raise RuntimeError(f'Could not safely move {source.name}: {detail}') from error
        if sha256_file(target) != checksum:
            raise RuntimeError(f'Checksum changed while recovering {source.name}')
        return target
    try:
        if sha256_file(target) != checksum:
            raise RuntimeError(f'Checksum changed while recovering {source.name}')
    except Exception:
        target.unlink(missing_ok=True)
        raise
    source.unlink()
    return target


def relative_path(path: Path, library_root: Path) -> str:
    return str(path.resolve().relative_to(library_root.resolve()))


def updated_raw_json(connection: Any, video_id: str, current_path: str) -> str:
    row = connection.execute('SELECT raw_json FROM videos WHERE id=?', (video_id,)).fetchone()
    if row is None:
        raise KeyError(video_id)
    try:
        record = json.loads(row['raw_json'])
    except json.JSONDecodeError as error:
        raise ValueError(f'Catalog record for {video_id} has invalid JSON') from error
    if not isinstance(record, dict):
        raise ValueError(f'Catalog record for {video_id} is not a JSON object')
    record['current_path'] = current_path
    return json.dumps(record, ensure_ascii=False, sort_keys=True)


def fix_missing_videos(
    database_path: Path,
    library_root: Path,
    missing: list[MissingVideo],
    located_paths: dict[str, str],
) -> list[tuple[MissingVideo, str, str]]:
    """Recover checksum matches into processed/ and update their catalog paths."""
    processed = library_root / 'processed'
    processed.mkdir(parents=True, exist_ok=True)
    resolved_root = library_root.resolve()
    resolved_processed = processed.resolve()
    if not resolved_processed.is_relative_to(resolved_root):
        raise ValueError(f'Processed directory must be inside the library: {processed}')

    connection = connect(database_path)
    results: list[tuple[MissingVideo, str, str]] = []
    try:
        initialize(connection)
        for video in missing:
            located_path = located_paths.get(video.checksum)
            if not located_path:
                results.append((video, '', 'not_found'))
                continue
            source = (resolved_root / located_path).resolve()
            if not source.is_relative_to(resolved_root) or not source.is_file():
                results.append((video, located_path, 'not_found'))
                continue

            connection.execute('BEGIN IMMEDIATE')
            try:
                target = source if source.is_relative_to(resolved_processed) else unique_processed_target(
                    source, resolved_processed, video.checksum
                )
                target_path = relative_path(target, resolved_root)
                raw_json = updated_raw_json(connection, video.video_id, target_path)
                moved = move_without_overwrite(source, target, video.checksum)
                connection.execute(
                    'UPDATE videos SET current_path=?, raw_json=? WHERE id=?',
                    (relative_path(moved, resolved_root), raw_json, video.video_id),
                )
                connection.commit()
                results.append((video, relative_path(moved, resolved_root), 'fixed'))
            except Exception as error:
                connection.rollback()
                results.append((video, relative_path(target, resolved_root), f'failed: {error}'))
    finally:
        connection.close()
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--library-root",
        type=Path,
        default=os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT"),
        help="Configured media library root (defaults to VIDEO_CATALOG_LIBRARY_ROOT)",
    )
    parser.add_argument("--database", type=Path, help="Catalog SQLite file (defaults to <library-root>/catalog.sqlite)")
    parser.add_argument(
        "--find-by-sha",
        action="store_true",
        help="Scan the library for missing records with a matching SHA-256 (does not update the catalog)",
    )
    parser.add_argument(
        '--fix',
        action='store_true',
        help='Move checksum matches into processed/ and update their catalog paths (implies --find-by-sha)',
    )
    return parser.parse_args()


def main() -> int:
    load_local_environment(PROJECT_ROOT / ".env")
    args = parse_args()
    if args.library_root is None:
        raise SystemExit("--library-root or VIDEO_CATALOG_LIBRARY_ROOT is required")
    library_root = args.library_root.expanduser().resolve()
    if not library_root.is_dir():
        raise SystemExit(f"Video library does not exist or is not a directory: {library_root}")
    database_path = (args.database or library_root / "catalog.sqlite").expanduser().resolve()
    if not database_path.is_file():
        raise SystemExit(f"Catalog database does not exist: {database_path}")

    missing = missing_videos(database_path, library_root)
    writer = csv.writer(sys.stdout)
    if not args.find_by_sha and not args.fix:
        writer.writerow(("filename", "last_stored_sha256"))
        writer.writerows((video.filename, video.checksum) for video in missing)
        return 0

    print("Scanning the library for matching SHA-256 values...", file=sys.stderr)
    located_paths = locate_files_by_sha(library_root, {video.checksum for video in missing})
    if not args.fix:
        writer.writerow(("filename", "last_stored_sha256", "located_path"))
        writer.writerows(
            (video.filename, video.checksum, located_paths.get(video.checksum, "")) for video in missing
        )
        return 0

    print('Recovering checksum matches into processed/...', file=sys.stderr)
    results = fix_missing_videos(database_path, library_root, missing, located_paths)
    writer.writerow(('filename', 'last_stored_sha256', 'located_path', 'status'))
    writer.writerows((video.filename, video.checksum, path, status) for video, path, status in results)
    return 1 if any(status.startswith('failed:') for _, _, status in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
