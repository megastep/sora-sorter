"""SQLite storage and idempotent JSON importer for the local video catalog."""
from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Callable
from pathlib import Path
from typing import Any

EDITABLE = {"title", "summary", "keywords", "language", "transcript", "visible_text", "content_flags", "likeness_references"}
REVIEW_STATES = {"unreviewed", "shortlisted", "approved", "rejected"}
Migration = tuple[int, str, Callable[[sqlite3.Connection], None]]


def connect(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def _initial_schema(db: sqlite3.Connection) -> None:
    statements = (
        """
        CREATE TABLE IF NOT EXISTS videos (
          id TEXT PRIMARY KEY, raw_json TEXT NOT NULL, source_path TEXT NOT NULL,
          current_path TEXT NOT NULL, original_filename TEXT NOT NULL, title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '', transcript TEXT NOT NULL DEFAULT '', language TEXT,
          speech_present INTEGER, orientation TEXT, duration_seconds REAL, width INTEGER, height INTEGER,
          keywords_json TEXT NOT NULL DEFAULT '[]', visible_text_json TEXT NOT NULL DEFAULT '[]',
          content_flags_json TEXT NOT NULL DEFAULT '[]', likeness_json TEXT NOT NULL DEFAULT '[]',
          transcript_segments_json TEXT NOT NULL DEFAULT '[]', imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS overrides (
          video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
          descriptive_json TEXT NOT NULL DEFAULT '{}', review_status TEXT NOT NULL DEFAULT 'unreviewed',
          rating INTEGER, favorite INTEGER NOT NULL DEFAULT 0, publishable INTEGER NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (review_status IN ('unreviewed','shortlisted','approved','rejected')),
          CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
        )
        """,
        "CREATE VIRTUAL TABLE IF NOT EXISTS video_fts USING fts5(video_id UNINDEXED, title, summary, keywords, visible_text, transcript)",
        "CREATE INDEX IF NOT EXISTS videos_language_idx ON videos(language)",
        "CREATE INDEX IF NOT EXISTS videos_orientation_idx ON videos(orientation)",
        "CREATE INDEX IF NOT EXISTS overrides_review_idx ON overrides(review_status, favorite, publishable, rating)",
    )
    for statement in statements:
        db.execute(statement)


MIGRATIONS: tuple[Migration, ...] = ((1, "initial_schema", _initial_schema),)


def migrate(db: sqlite3.Connection) -> list[int]:
    """Apply all known schema migrations and return the newly applied versions."""
    versions = [version for version, _, _ in MIGRATIONS]
    if versions != sorted(set(versions)):
        raise RuntimeError("Migration versions must be unique and increasing")
    known = {version: name for version, name, _ in MIGRATIONS}

    with db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        applied = {
            row["version"]: row["name"]
            for row in db.execute("SELECT version, name FROM schema_migrations")
        }
        unknown = set(applied) - set(known)
        if unknown:
            raise RuntimeError(f"Database has unknown migration versions: {sorted(unknown)}")
        mismatched = [version for version, name in applied.items() if known[version] != name]
        if mismatched:
            raise RuntimeError(f"Database migration names do not match: {sorted(mismatched)}")

        newly_applied = []
        for version, name, apply in MIGRATIONS:
            if version not in applied:
                apply(db)
                db.execute(
                    "INSERT INTO schema_migrations(version, name) VALUES (?, ?)",
                    (version, name),
                )
                newly_applied.append(version)
    return newly_applied


def initialize(db: sqlite3.Connection) -> None:
    migrate(db)


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _base(record: dict[str, Any]) -> dict[str, Any]:
    technical = record.get("technical", {})
    video = technical.get("video", {})
    audio = record.get("audio_analysis", {})
    visual = record.get("visual_analysis", {})
    proposed = record.get("filename", {}).get("proposed_stem") or record.get("original_filename") or record["id"][:12]
    return {
        "id": record["id"], "raw_json": json.dumps(record, ensure_ascii=False, sort_keys=True),
        "source_path": record.get("source_path", ""), "current_path": record.get("current_path", ""),
        "original_filename": record.get("original_filename", ""), "title": proposed.replace("-", " ").title(),
        "summary": visual.get("summary", "") or "", "transcript": audio.get("transcript", "") or "",
        "language": audio.get("language"), "speech_present": int(bool(audio.get("speech_present"))),
        "orientation": video.get("orientation"), "duration_seconds": technical.get("duration_seconds"),
        "width": video.get("display_width"), "height": video.get("display_height"),
        "keywords_json": json.dumps(_list(visual.get("keywords")), ensure_ascii=False),
        "visible_text_json": json.dumps(_list(visual.get("visible_text")), ensure_ascii=False),
        "content_flags_json": json.dumps(_list(visual.get("content_flags")), ensure_ascii=False),
        "likeness_json": json.dumps(_list(visual.get("public_figure_references")), ensure_ascii=False),
        "transcript_segments_json": json.dumps(_list(audio.get("segments")), ensure_ascii=False),
    }


def _effective(db: sqlite3.Connection, video_id: str) -> dict[str, Any]:
    row = db.execute("SELECT v.*, o.descriptive_json, o.review_status, o.rating, o.favorite, o.publishable, o.notes FROM videos v JOIN overrides o ON o.video_id=v.id WHERE v.id=?", (video_id,)).fetchone()
    if not row: raise KeyError(video_id)
    item = dict(row); overrides = json.loads(item.pop("descriptive_json"))
    for key in EDITABLE:
        if key in overrides: item[key] = overrides[key]
    item["keywords"] = item.pop("keywords", json.loads(item.pop("keywords_json")))
    item["visible_text"] = item.pop("visible_text", json.loads(item.pop("visible_text_json")))
    item["content_flags"] = item.pop("content_flags", json.loads(item.pop("content_flags_json")))
    item["likeness_references"] = item.pop("likeness_references", json.loads(item.pop("likeness_json")))
    item["transcript_segments"] = json.loads(item.pop("transcript_segments_json"))
    item["favorite"] = bool(item["favorite"]); item["publishable"] = bool(item["publishable"])
    return item


def _index(db: sqlite3.Connection, video_id: str) -> None:
    item = _effective(db, video_id)
    db.execute("DELETE FROM video_fts WHERE video_id=?", (video_id,))
    db.execute("INSERT INTO video_fts VALUES (?, ?, ?, ?, ?, ?)", (video_id, item["title"], item["summary"], " ".join(map(str, item["keywords"])), " ".join(map(str, item["visible_text"])), item["transcript"]))


def import_directory(db: sqlite3.Connection, directory: Path) -> dict[str, int]:
    counts = {"inserted": 0, "updated": 0, "skipped": 0}
    with db:
        for path in sorted(directory.glob("*.json")):
            if path.name.startswith("._") or path.name == "deduplication.json": continue
            try: record = json.loads(path.read_text(encoding="utf-8")); base = _base(record)
            except (OSError, json.JSONDecodeError, KeyError): counts["skipped"] += 1; continue
            exists = db.execute("SELECT 1 FROM videos WHERE id=?", (base["id"],)).fetchone()
            columns = list(base); placeholders = ",".join("?" for _ in columns)
            updates = ",".join(f"{name}=excluded.{name}" for name in columns if name != "id")
            db.execute(f"INSERT INTO videos ({','.join(columns)}) VALUES ({placeholders}) ON CONFLICT(id) DO UPDATE SET {updates}, imported_at=CURRENT_TIMESTAMP", [base[c] for c in columns])
            db.execute("INSERT OR IGNORE INTO overrides(video_id) VALUES (?)", (base["id"],)); _index(db, base["id"])
            counts["updated" if exists else "inserted"] += 1
    return counts


def update(db: sqlite3.Connection, video_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not db.execute("SELECT 1 FROM videos WHERE id=?", (video_id,)).fetchone(): raise KeyError(video_id)
    invalid = set(payload) - EDITABLE - {"review_status", "rating", "favorite", "publishable", "notes"}
    if invalid: raise ValueError(f"Read-only or unknown fields: {', '.join(sorted(invalid))}")
    descriptions = {key: payload[key] for key in EDITABLE & payload.keys()}
    for key in {"keywords", "visible_text", "content_flags"} & descriptions.keys():
        if not isinstance(descriptions[key], list): raise ValueError(f"{key} must be a list")
        descriptions[key] = list(dict.fromkeys(str(value).strip() for value in descriptions[key] if str(value).strip()))
    if "likeness_references" in descriptions:
        if not isinstance(descriptions["likeness_references"], list): raise ValueError("likeness_references must be a list")
        normalized_references = []
        for reference in descriptions["likeness_references"]:
            if not isinstance(reference, dict): raise ValueError("Each likeness reference must be an object")
            confidence = str(reference.get("confidence", "possible")).strip().lower()
            if confidence not in {"possible", "likely"}: raise ValueError("Reference confidence must be possible or likely")
            normalized_references.append({"name": str(reference.get("name", "")).strip(), "confidence": confidence, "basis": str(reference.get("basis", "")).strip()})
        descriptions["likeness_references"] = [reference for reference in normalized_references if reference["name"] or reference["basis"]]
    if "language" in descriptions and not isinstance(descriptions["language"], str): raise ValueError("language must be a string")
    if "review_status" in payload and payload["review_status"] not in REVIEW_STATES: raise ValueError("Invalid review status")
    if "rating" in payload and payload["rating"] is not None and (not isinstance(payload["rating"], int) or not 1 <= payload["rating"] <= 5): raise ValueError("rating must be 1-5")
    with db:
        current = json.loads(db.execute("SELECT descriptive_json FROM overrides WHERE video_id=?", (video_id,)).fetchone()[0]); current.update(descriptions)
        review = {key: payload[key] for key in {"review_status", "rating", "favorite", "publishable", "notes"} & payload.keys()}
        sets = ["descriptive_json=?", "updated_at=CURRENT_TIMESTAMP"]; values: list[Any] = [json.dumps(current, ensure_ascii=False)]
        for key, value in review.items(): sets.append(f"{key}=?"); values.append(int(value) if key in {"favorite", "publishable"} else value)
        values.append(video_id); db.execute(f"UPDATE overrides SET {','.join(sets)} WHERE video_id=?", values); _index(db, video_id)
    return _effective(db, video_id)


def list_videos(db: sqlite3.Connection, *, q: str = "", language: str = "", orientation: str = "", speech: str = "", review: str = "", favorite: str = "", publishable: str = "", flag: str = "", sort: str = "newest", limit: int = 48, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
    where = []; params: list[Any] = []
    terms = re.findall(r"[\w]+", q, flags=re.UNICODE)
    if terms:
        prefix_query = " AND ".join(f'"{term.replace(chr(34), "")}"*' for term in terms)
        where.append("v.id IN (SELECT video_id FROM video_fts WHERE video_fts MATCH ?)"); params.append(prefix_query)
    for field, value in (("v.language", language), ("v.orientation", orientation), ("o.review_status", review)):
        if value: where.append(f"{field}=?"); params.append(value)
    if speech in {"yes", "no"}: where.append("v.speech_present=?"); params.append(int(speech == "yes"))
    if favorite in {"yes", "no"}: where.append("o.favorite=?"); params.append(int(favorite == "yes"))
    if publishable in {"yes", "no"}: where.append("o.publishable=?"); params.append(int(publishable == "yes"))
    if flag: where.append("v.content_flags_json LIKE ?"); params.append(f'%"{flag}"%')
    clause = " WHERE " + " AND ".join(where) if where else ""
    total = db.execute("SELECT count(*) FROM videos v JOIN overrides o ON o.video_id=v.id" + clause, params).fetchone()[0]
    orders = {
        "newest": "v.imported_at DESC, v.id",
        "oldest": "v.imported_at ASC, v.id",
        "title": "COALESCE(json_extract(o.descriptive_json, '$.title'), v.title) COLLATE NOCASE, v.id",
        "title_desc": "COALESCE(json_extract(o.descriptive_json, '$.title'), v.title) COLLATE NOCASE DESC, v.id",
        "duration": "v.duration_seconds DESC, v.id",
        "language": "v.language COLLATE NOCASE, COALESCE(json_extract(o.descriptive_json, '$.title'), v.title) COLLATE NOCASE, v.id",
    }
    rows = db.execute("SELECT v.id FROM videos v JOIN overrides o ON o.video_id=v.id" + clause + f" ORDER BY {orders.get(sort, orders['newest'])} LIMIT ? OFFSET ?", params + [min(max(limit, 1), 100), max(offset, 0)]).fetchall()
    return [_effective(db, row["id"]) for row in rows], total
