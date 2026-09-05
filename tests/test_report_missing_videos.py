from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess

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
                [report_missing_videos.MissingVideo('record-id', 'missing.mp4', 'stored-checksum')],
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

            self.assertEqual(
                report_missing_videos.missing_videos(database_path, root),
                [report_missing_videos.MissingVideo('missing-id', 'gone.mp4', 'missing-id')],
            )

    def test_locates_missing_media_by_checksum_in_supported_library_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = b'catalog-media'
            matching_file = root / 'recovered.mp4'
            matching_file.write_bytes(payload)
            (root / 'ignored.txt').write_bytes(payload)
            checksum = hashlib.sha256(payload).hexdigest()

            self.assertEqual(
                report_missing_videos.locate_files_by_sha(root, {checksum}),
                {checksum: 'recovered.mp4'},
            )

    def test_fixes_located_media_without_overwriting_processed_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'recovered.mp4'
            payload = b'catalog-media'
            source.write_bytes(payload)
            checksum = hashlib.sha256(payload).hexdigest()
            processed = root / 'processed'
            processed.mkdir()
            (processed / source.name).write_bytes(b'existing-media')

            database_path = root / 'catalog.sqlite'
            connection = connect(database_path)
            initialize(connection)
            connection.execute(
                'INSERT INTO videos (id, raw_json, source_path, current_path, original_filename, title) VALUES (?, ?, ?, ?, ?, ?)',
                (checksum, json.dumps({'current_path': 'gone.mp4'}), 'gone.mp4', 'gone.mp4', 'gone.mp4', 'Missing'),
            )
            connection.commit()
            connection.close()

            missing = report_missing_videos.missing_videos(database_path, root)
            results = report_missing_videos.fix_missing_videos(
                database_path,
                root,
                missing,
                report_missing_videos.locate_files_by_sha(root, {checksum}),
            )

            recovered_path = f'processed/recovered-{checksum[:8]}-2.mp4'
            self.assertEqual(results, [(missing[0], recovered_path, 'fixed')])
            self.assertFalse(source.exists())
            self.assertEqual((root / 'processed' / source.name).read_bytes(), b'existing-media')
            self.assertEqual((root / recovered_path).read_bytes(), payload)

            connection = connect(database_path)
            row = connection.execute('SELECT current_path, raw_json FROM videos WHERE id=?', (checksum,)).fetchone()
            connection.close()
            self.assertEqual(row['current_path'], recovered_path)
            self.assertEqual(json.loads(row['raw_json'])['current_path'], recovered_path)

    def test_falls_back_to_no_clobber_move_when_hard_links_are_unsupported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.mp4'
            target = root / 'processed' / 'target.mp4'
            target.parent.mkdir()
            payload = b'catalog-media'
            source.write_bytes(payload)
            checksum = hashlib.sha256(payload).hexdigest()

            def move_without_link(*_: object, **__: object) -> subprocess.CompletedProcess[str]:
                source.rename(target)
                return subprocess.CompletedProcess([], 0, '', '')

            with patch.object(report_missing_videos.os, 'link', side_effect=OSError(45, 'Operation not supported')):
                with patch.object(report_missing_videos.subprocess, 'run', side_effect=move_without_link) as move:
                    self.assertEqual(report_missing_videos.move_without_overwrite(source, target, checksum), target)

            self.assertFalse(source.exists())
            self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(move.call_args.args[0][:2], ['mv', '-n'])
