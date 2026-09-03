#!/usr/bin/env python3
"""Run common read-only queries against a Sora Sorter catalog."""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPOSITORY_ROOT))

from catalog_db import _effective, list_videos


def positive_limit(value: str) -> int:
    limit = int(value)
    if not 1 <= limit <= 100:
        raise argparse.ArgumentTypeError("limit must be between 1 and 100")
    return limit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=False)
    source.add_argument("--database", type=Path, help="Path to catalog.sqlite.")
    source.add_argument("--library-root", type=Path, help="Directory containing catalog.sqlite.")
    parser.add_argument("--format", choices=("json", "markdown"), default="json", help="Output format.")
    commands = parser.add_subparsers(dest="command", required=True)

    search = commands.add_parser("search", help="Search and filter clips.")
    search.add_argument("text", nargs="?", default="", help="Search titles and analyzed text.")
    search.add_argument("--language")
    search.add_argument("--orientation")
    search.add_argument("--speech", choices=("yes", "no"))
    search.add_argument("--review", choices=("unreviewed", "shortlisted", "approved", "rejected"))
    search.add_argument("--favorite", choices=("yes", "no"))
    search.add_argument("--publishable", choices=("yes", "no"))
    search.add_argument("--flag")
    search.add_argument(
        "--sort",
        choices=("newest", "oldest", "title", "title_desc", "duration", "language"),
        default="newest",
    )
    search.add_argument("--limit", type=positive_limit, default=20)

    clip = commands.add_parser("clip", help="Get one clip by its catalog ID.")
    clip.add_argument("video_id")
    commands.add_parser("stats", help="Summarize catalog and review counts.")
    return parser.parse_args()


def database_path(args: argparse.Namespace) -> Path:
    if args.database:
        return args.database.expanduser().resolve()
    root = args.library_root or os.environ.get("VIDEO_CATALOG_LIBRARY_ROOT")
    if root:
        return Path(root).expanduser().resolve() / "catalog.sqlite"
    raise ValueError("Provide --database or --library-root (or set VIDEO_CATALOG_LIBRARY_ROOT).")


def compact_video(video: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "id",
        "title",
        "summary",
        "language",
        "orientation",
        "duration_seconds",
        "keywords",
        "visible_text",
        "content_flags",
        "review_status",
        "rating",
        "favorite",
        "publishable",
        "notes",
        "imported_at",
    )
    return {field: video.get(field) for field in fields}


def search(connection: sqlite3.Connection, args: argparse.Namespace) -> dict[str, Any]:
    items, total = list_videos(
        connection,
        q=args.text,
        language=args.language or "",
        orientation=args.orientation or "",
        speech=args.speech or "",
        review=args.review or "",
        favorite=args.favorite or "",
        publishable=args.publishable or "",
        flag=args.flag or "",
        sort=args.sort,
        limit=args.limit,
    )
    filters = {
        name: value
        for name, value in vars(args).items()
        if name in {"language", "orientation", "speech", "review", "favorite", "publishable", "flag"}
        and value
    }
    return {
        "kind": "search",
        "query": args.text,
        "filters": filters,
        "sort": args.sort,
        "total": total,
        "returned": len(items),
        "truncated": total > len(items),
        "items": [compact_video(item) for item in items],
    }


def clip(connection: sqlite3.Connection, args: argparse.Namespace) -> dict[str, Any]:
    try:
        return {"kind": "clip", "item": compact_video(_effective(connection, args.video_id))}
    except KeyError:
        raise ValueError(f"Video not found: {args.video_id}") from None


def stats(connection: sqlite3.Connection) -> dict[str, Any]:
    review_counts = {
        row["review_status"]: row["videos"]
        for row in connection.execute(
            "SELECT review_status, count(*) AS videos FROM overrides GROUP BY review_status"
        )
    }
    return {
        "kind": "stats",
        "videos": connection.execute("SELECT count(*) FROM videos").fetchone()[0],
        "review_statuses": review_counts,
        "favorites": connection.execute("SELECT count(*) FROM overrides WHERE favorite = 1").fetchone()[0],
        "publishable": connection.execute("SELECT count(*) FROM overrides WHERE publishable = 1").fetchone()[0],
    }


def markdown(payload: dict[str, Any]) -> str:
    if payload["kind"] == "search":
        rows = payload["items"]
        heading = f"# Search results: {payload['returned']} of {payload['total']}"
        if not rows:
            return heading + "\n\nNo clips matched."
        table = ["| Title | ID | Review | Duration |", "| --- | --- | --- | --- |"]
        for item in rows:
            title = str(item["title"]).replace("|", "\\|")
            table.append(
                f"| {title} | {item['id']} | {item['review_status']} | {item['duration_seconds']} |"
            )
        return "\n".join([heading, "", *table])
    return "JSON\n" + json.dumps(payload, ensure_ascii=False, indent=2)


def main() -> int:
    try:
        args = parse_args()
        path = database_path(args)
        if not path.is_file():
            raise ValueError(f"Catalog database does not exist: {path}")
        connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA query_only = ON")
            operations = {
                "search": search,
                "clip": clip,
                "stats": lambda value, _: stats(value),
            }
            payload = operations[args.command](connection, args)
        finally:
            connection.close()
        print(markdown(payload) if args.format == "markdown" else json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    except (sqlite3.Error, ValueError) as error:
        print(f"query_catalog: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
