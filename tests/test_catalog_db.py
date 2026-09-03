import json
import tempfile
import unittest
from pathlib import Path

from catalog_db import connect, import_directory, initialize, list_videos, update


def analysis_record(summary: str) -> dict:
    return {
        "id": "a" * 64,
        "source_path": "video_catalog_json/clip.json",
        "current_path": "clip.mp4",
        "original_filename": "clip.mp4",
        "filename": {"proposed_stem": "garden-walk"},
        "technical": {
            "duration_seconds": 12.5,
            "video": {"orientation": "landscape", "display_width": 1920, "display_height": 1080},
        },
        "audio_analysis": {"transcript": "A quiet garden walk", "language": "en", "speech_present": True},
        "visual_analysis": {"summary": summary, "keywords": ["garden"], "visible_text": [], "content_flags": [], "public_figure_references": []},
    }


class CatalogDatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        self.root = Path(self.workspace.name)
        self.records = self.root / "video_catalog_json"
        self.records.mkdir()
        self.database = connect(self.root / "catalog.sqlite")
        initialize(self.database)

    def tearDown(self) -> None:
        self.database.close()
        self.workspace.cleanup()

    def write_record(self, summary: str) -> None:
        (self.records / "clip.json").write_text(json.dumps(analysis_record(summary)), encoding="utf-8")

    def test_reimport_refreshes_analysis_without_losing_editorial_changes(self) -> None:
        self.write_record("Original analysis")
        self.assertEqual(import_directory(self.database, self.records), {"inserted": 1, "updated": 0, "skipped": 0})

        video_id = "a" * 64
        update(
            self.database,
            video_id,
            {"title": "Saved title", "keywords": ["garden", "favorite"], "review_status": "approved", "favorite": True},
        )
        self.write_record("Refreshed analysis")

        self.assertEqual(import_directory(self.database, self.records), {"inserted": 0, "updated": 1, "skipped": 0})
        videos, total = list_videos(self.database, q="favor")

        self.assertEqual(total, 1)
        self.assertEqual(videos[0]["title"], "Saved title")
        self.assertEqual(videos[0]["summary"], "Refreshed analysis")
        self.assertEqual(videos[0]["review_status"], "approved")
        self.assertTrue(videos[0]["favorite"])

    def test_update_rejects_invalid_editorial_values(self) -> None:
        self.write_record("Analysis")
        import_directory(self.database, self.records)

        with self.assertRaisesRegex(ValueError, "rating must be 1-5"):
            update(self.database, "a" * 64, {"rating": 6})

        with self.assertRaisesRegex(ValueError, "keywords must be a list"):
            update(self.database, "a" * 64, {"keywords": "garden"})
