#!/usr/bin/env python3
"""Report catalog records whose last known media path is unavailable.

Example:
  uv run python scripts/report_missing_videos.py
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from catalog_db import connect, initialize


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


def missing_videos(database_path: Path, library_root: Path) -> list[tuple[str, str]]:
    connection = connect(database_path)
    try:
        initialize(connection)
        rows = connection.execute(
            "SELECT id, original_filename, current_path, raw_json FROM videos ORDER BY original_filename COLLATE NOCASE, id"
        )
        missing: list[tuple[str, str]] = []
        for row in rows:
            if is_available(library_root, row["current_path"]):
                continue
            try:
                record = json.loads(row["raw_json"])
            except json.JSONDecodeError:
                record = {}
            filename = row["original_filename"] or Path(row["current_path"]).name
            missing.append((filename, last_stored_sha(record, row["id"])))
        return missing
    finally:
        connection.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--library-root",
        type=Path,
        default=os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT"),
        help="Configured media library root (defaults to VIDEO_CATALOG_LIBRARY_ROOT)",
    )
    parser.add_argument("--database", type=Path, help="Catalog SQLite file (defaults to <library-root>/catalog.sqlite)")
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

    writer = csv.writer(sys.stdout)
    writer.writerow(("filename", "last_stored_sha256"))
    writer.writerows(missing_videos(database_path, library_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
