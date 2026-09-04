#!/usr/bin/env python3
"""Query a Sora Sorter catalog and generate montage videos."""
from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPOSITORY_ROOT))

from catalog_db import _effective, list_videos


def positive_limit(value: str) -> int:
    limit = int(value)
    if not 1 <= limit <= 100:
        raise argparse.ArgumentTypeError("limit must be between 1 and 100")
    return limit


def positive_number(value: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("value must be a finite number greater than zero")
    return number


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=False)
    source.add_argument("--database", type=Path, help="Path to catalog.sqlite.")
    source.add_argument("--library-root", type=Path, help="Directory containing catalog.sqlite.")
    parser.add_argument("--format", choices=("json", "markdown"), default="json", help="Output format.")
    parser.add_argument(
        "--server",
        default=os.environ.get("VIDEO_CATALOG_SERVER", "http://127.0.0.1:8765"),
        help="Running catalog server used by montage commands.",
    )
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
    commands.add_parser("presets", help="List saved montage presets in most-recently-used order.")
    commands.add_parser("montages", help="List previously generated montage videos.")

    generate = commands.add_parser("generate", help="Generate a montage from ordered catalog video IDs.")
    generate.add_argument("video_ids", nargs="+", help="Catalog video IDs in montage order.")
    generate.add_argument(
        "--preset",
        help="Preset ID or exact preset name (defaults to the most recently used preset).",
    )
    generate.add_argument("--software-fallback", action="store_true")
    generate.add_argument("--no-wait", action="store_true", help="Return as soon as the job is queued.")
    generate.add_argument("--output", type=Path, help="Download the completed MP4 to this path.")
    generate.add_argument("--force", action="store_true", help="Replace an existing --output file.")
    generate.add_argument("--poll-interval", type=positive_number, default=1.0)
    generate.add_argument("--timeout", type=positive_number, default=3600.0)

    job = commands.add_parser("job", help="Inspect or wait for a montage render job.")
    job.add_argument("job_id")
    job.add_argument("--wait", action="store_true")
    job.add_argument("--output", type=Path, help="Download the completed MP4 to this path.")
    job.add_argument("--force", action="store_true", help="Replace an existing --output file.")
    job.add_argument("--poll-interval", type=positive_number, default=1.0)
    job.add_argument("--timeout", type=positive_number, default=3600.0)
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


def api_url(server: str, path: str) -> str:
    return server.rstrip("/") + path


def api_request(
    server: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        api_url(server, path),
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())
    except HTTPError as error:
        try:
            detail = json.loads(error.read()).get("detail")
        except (json.JSONDecodeError, AttributeError):
            detail = None
        raise ValueError(f"Catalog server returned HTTP {error.code}: {detail or error.reason}") from None
    except URLError as error:
        raise ValueError(f"Could not reach catalog server at {server}: {error.reason}") from None
    except TimeoutError:
        raise ValueError(f"Catalog server at {server} timed out") from None


def list_presets(args: argparse.Namespace) -> dict[str, Any]:
    payload = api_request(args.server, "GET", "/api/montage-presets")
    return {"kind": "presets", "items": payload["items"]}


def list_montages(args: argparse.Namespace) -> dict[str, Any]:
    payload = api_request(args.server, "GET", "/api/montage-exports")
    return {"kind": "montages", **payload}


def resolve_preset(args: argparse.Namespace) -> dict[str, Any]:
    presets = list_presets(args)["items"]
    if not presets:
        raise ValueError("No montage presets are available")
    if args.preset is None:
        return presets[0]
    try:
        preset_id = int(args.preset)
    except ValueError:
        preset_id = None
    exact_matches = [preset for preset in presets if preset["name"] == args.preset]
    matches = exact_matches or [
        preset
        for preset in presets
        if (preset_id is not None and preset["id"] == preset_id)
        or preset["name"].casefold() == args.preset.casefold()
    ]
    if not matches:
        raise ValueError(f"Montage preset not found: {args.preset}")
    if len(matches) > 1:
        raise ValueError(f"Montage preset is ambiguous: {args.preset}")
    return matches[0]


def require_acceleration(args: argparse.Namespace) -> None:
    if args.software_fallback:
        return
    # The server's cold Remotion capability probe has a 120-second budget.
    capability = api_request(args.server, "GET", "/api/montages/capabilities", timeout=130)
    if not capability["accelerated"]:
        reason = capability.get("reason", "The required GPU encoder is unavailable.")
        raise ValueError(
            f"Hardware acceleration is unavailable: {reason} "
            "Rerun with --software-fallback only after the user accepts software rendering."
        )


def wait_for_job(args: argparse.Namespace, job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + args.timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError(f"Timed out waiting for montage job {job_id}")
        job = api_request(args.server, "GET", f"/api/montages/{job_id}", timeout=remaining)
        if job["status"] in {"completed", "failed"}:
            return job
        if time.monotonic() >= deadline:
            raise ValueError(f"Timed out waiting for montage job {job_id}")
        time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))


def download_montage(args: argparse.Namespace, job_id: str) -> Path:
    output = args.output.expanduser().resolve()
    if output.exists() and not args.force:
        raise ValueError(f"Output already exists (use --force to replace it): {output}")
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise ValueError(f"Could not prepare output directory for {output}: {error}") from None
    request = Request(api_url(args.server, f"/api/montages/{job_id}/download"))
    try:
        with tempfile.NamedTemporaryFile(
            dir=output.parent, prefix=f".{output.name}.", suffix=".part", delete=False
        ) as temporary:
            partial = Path(temporary.name)
    except OSError as error:
        raise ValueError(f"Could not prepare download output for {output}: {error}") from None
    try:
        with urlopen(request, timeout=60) as response, partial.open("wb") as destination:
            content_length = response.headers.get("Content-Length")
            expected_bytes = int(content_length) if content_length is not None else None
            received_bytes = 0
            while chunk := response.read(1024 * 1024):
                destination.write(chunk)
                received_bytes += len(chunk)
            if expected_bytes is not None and received_bytes != expected_bytes:
                raise ValueError(
                    f"Download was incomplete: received {received_bytes} of {expected_bytes} bytes"
                )
        if args.force:
            partial.replace(output)
        else:
            os.link(partial, output)
            partial.unlink()
    except HTTPError as error:
        partial.unlink(missing_ok=True)
        raise ValueError(f"Could not download montage job {job_id}: HTTP {error.code}") from None
    except URLError as error:
        partial.unlink(missing_ok=True)
        raise ValueError(f"Could not download montage job {job_id}: {error.reason}") from None
    except ValueError:
        partial.unlink(missing_ok=True)
        raise
    except OSError as error:
        partial.unlink(missing_ok=True)
        raise ValueError(f"Could not save montage to {output}: {error}") from None
    return output


def job_result(args: argparse.Namespace) -> dict[str, Any]:
    job = (
        wait_for_job(args, args.job_id)
        if args.wait or args.output
        else api_request(args.server, "GET", f"/api/montages/{args.job_id}")
    )
    if job["status"] == "failed":
        raise ValueError(
            f"Montage export failed ({job.get('error_code', 'render_failed')}): "
            f"{job.get('error', 'Unknown rendering error')}"
        )
    output = download_montage(args, args.job_id) if args.output else None
    return {
        "kind": "montage_job",
        "job": job,
        "download_url": api_url(args.server, f"/api/montages/{args.job_id}/download"),
        **({"output": str(output)} if output else {}),
    }


def generate_montage(args: argparse.Namespace) -> dict[str, Any]:
    if len(args.video_ids) < 2 or len(args.video_ids) != len(set(args.video_ids)):
        raise ValueError("Provide at least two unique video IDs in montage order")
    if args.output and args.no_wait:
        raise ValueError("--output cannot be combined with --no-wait")
    if args.output and args.output.expanduser().resolve().exists() and not args.force:
        raise ValueError(f"Output already exists (use --force to replace it): {args.output}")
    preset = resolve_preset(args)
    require_acceleration(args)
    settings = preset["settings"]
    spec = {
        **settings,
        "fillMismatchedOrientation": settings.get("fillMismatchedOrientation", True),
        "clips": [{"id": video_id} for video_id in args.video_ids],
    }
    job = api_request(
        args.server,
        "POST",
        "/api/montages",
        {"spec": spec, "software_fallback": args.software_fallback},
    )
    preset_warning = None
    try:
        api_request(args.server, "POST", f"/api/montage-presets/{preset['id']}/use")
    except ValueError as error:
        preset_warning = f"Montage job {job['id']} was accepted, but preset recency was not updated: {error}"
    if not args.no_wait:
        job = wait_for_job(args, job["id"])
        if job["status"] == "failed":
            raise ValueError(
                f"Montage export failed ({job.get('error_code', 'render_failed')}): "
                f"{job.get('error', 'Unknown rendering error')}"
            )
    output = download_montage(args, job["id"]) if args.output else None
    return {
        "kind": "montage_generation",
        "preset": {"id": preset["id"], "name": preset["name"]},
        "video_ids": args.video_ids,
        "job": job,
        "download_url": api_url(args.server, f"/api/montages/{job['id']}/download"),
        **({"preset_warning": preset_warning} if preset_warning else {}),
        **({"output": str(output)} if output else {}),
    }


def markdown_cell(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def markdown(payload: dict[str, Any]) -> str:
    if payload["kind"] == "search":
        rows = payload["items"]
        heading = f"# Search results: {payload['returned']} of {payload['total']}"
        if not rows:
            return heading + "\n\nNo clips matched."
        table = ["| Title | ID | Review | Duration |", "| --- | --- | --- | --- |"]
        for item in rows:
            title = markdown_cell(item["title"])
            table.append(
                f"| {title} | {item['id']} | {item['review_status']} | {item['duration_seconds']} |"
            )
        return "\n".join([heading, "", *table])
    if payload["kind"] == "presets":
        table = ["| Name | ID | Format | Transition | Last used |", "| --- | --- | --- | --- | --- |"]
        for preset in payload["items"]:
            settings = preset["settings"]
            table.append(
                f"| {markdown_cell(preset['name'])} | {preset['id']} | {settings['format']} | "
                f"{settings['transition']} | {preset['last_used_at']} |"
            )
        return "\n".join(["# Montage presets", "", *table])
    if payload["kind"] == "montages":
        table = ["| Title | ID | Duration | Generated |", "| --- | --- | --- | --- |"]
        for item in payload["items"]:
            table.append(
                f"| {markdown_cell(item['title'])} | {item['id']} | {item['duration_seconds']} | "
                f"{item['generated_at']} |"
            )
        return "\n".join(["# Generated montages", "", *table])
    return "JSON\n" + json.dumps(payload, ensure_ascii=False, indent=2)


def main() -> int:
    try:
        args = parse_args()
        if args.command in {"presets", "montages", "generate", "job"}:
            montage_operations = {
                "presets": list_presets,
                "montages": list_montages,
                "generate": generate_montage,
                "job": job_result,
            }
            payload = montage_operations[args.command](args)
        else:
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
