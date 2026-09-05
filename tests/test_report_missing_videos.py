from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from catalog_db import connect, initialize

SCRIPT = Path(__file__).parents[1] / "scripts" / "report_missing_videos.py"
SPEC = importlib.util.spec_from_file_location("report_missing_videos", SCRIPT)
assert SPEC and SPEC.loader
report_missing_videos = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(report_missing_videos)


class ReportMissingVideosTests(unittest.TestCase):
    def test_loads_library_root_without_overriding_the_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            env_file = Path(temporary) / ".env"
            env_file.write_text("VIDEO_CATALOG_LIBRARY_ROOT=/from-file\n", encoding="utf-8")

            with patch.dict(os.environ, {"VIDEO_CATALOG_LIBRARY_ROOT": "/from-shell"}, clear=True):
                report_missing_videos.load_local_environment(env_file)

                self.assertEqual(os.environ["VIDEO_CATALOG_LIBRARY_ROOT"], "/from-shell")

            with patch.dict(os.environ, {}, clear=True):
                report_missing_videos.load_local_environment(env_file)

                self.assertEqual(os.environ["VIDEO_CATALOG_LIBRARY_ROOT"], "/from-file")

    def test_reports_missing_media_with_the_last_stored_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            database_path = root / "catalog.sqlite"
            connection = connect(database_path)
            initialize(connection)
            connection.execute(
                "INSERT INTO videos (id, raw_json, source_path, current_path, original_filename, title) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "record-id",
                    json.dumps({"file": {"sha256": "stored-checksum"}}),
                    "missing.mp4",
                    "missing.mp4",
                    "missing.mp4",
                    "Missing",
                ),
            )
            connection.commit()
            connection.close()

            self.assertEqual(
                report_missing_videos.missing_videos(database_path, root),
                [("missing.mp4", "stored-checksum")],
            )

    def test_excludes_available_media_and_falls_back_to_the_record_id(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "available.mp4").touch()
            database_path = root / "catalog.sqlite"
            connection = connect(database_path)
            initialize(connection)
            connection.executemany(
                "INSERT INTO videos (id, raw_json, source_path, current_path, original_filename, title) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    ("available-id", "{}", "available.mp4", "available.mp4", "available.mp4", "Available"),
                    ("missing-id", "{}", "gone.mp4", "gone.mp4", "gone.mp4", "Missing"),
                ),
            )
            connection.commit()
            connection.close()

            self.assertEqual(report_missing_videos.missing_videos(database_path, root), [("gone.mp4", "missing-id")])
