import json
import tempfile
import unittest
from pathlib import Path

from catalog_db import connect, import_directory, initialize, list_keywords, list_video_ids, list_videos, migrate, update


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

    def write_record(
        self,
        summary: str,
        *,
        video_id: str = "a" * 64,
        filename: str = "clip.json",
    ) -> None:
        record = analysis_record(summary)
        record["id"] = video_id
        (self.records / filename).write_text(json.dumps(record), encoding="utf-8")

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

    def test_rating_sorts_keep_unrated_videos_last(self) -> None:
        ids = {"high": "a" * 64, "low": "b" * 64, "unrated": "c" * 64}
        for name, video_id in ids.items():
            self.write_record(name, video_id=video_id, filename=f"{name}.json")
        import_directory(self.database, self.records)
        update(self.database, ids["high"], {"rating": 5})
        update(self.database, ids["low"], {"rating": 2})

        ascending, _ = list_videos(self.database, sort="rating_asc")
        descending, _ = list_videos(self.database, sort="rating_desc")

        self.assertEqual([video["id"] for video in ascending], [ids["low"], ids["high"], ids["unrated"]])
        self.assertEqual([video["id"] for video in descending], [ids["high"], ids["low"], ids["unrated"]])

    def test_selection_ids_follow_filters_and_catalog_sort_without_a_page_limit(self) -> None:
        ids = [f"{index:064x}" for index in range(105)]
        for index, video_id in enumerate(ids):
            self.write_record(
                "garden",
                video_id=video_id,
                filename=f"{index}.json",
            )
        import_directory(self.database, self.records)
        for index, video_id in enumerate(ids):
            if index % 2:
                update(self.database, video_id, {"title": "forest"})

        selected = list_video_ids(self.database, q="forest", sort="rating_desc")

        self.assertEqual(len(selected), 52)
        self.assertEqual(selected, sorted(selected))

    def test_keyword_summary_uses_effective_editorial_keywords(self) -> None:
        ids = {"garden": "a" * 64, "forest": "b" * 64, "lake": "c" * 64}
        for name, video_id in ids.items():
            self.write_record(name, video_id=video_id, filename=f"{name}.json")
        import_directory(self.database, self.records)
        update(self.database, ids["garden"], {"keywords": ["garden", "aardvark"]})
        update(self.database, ids["forest"], {"keywords": ["forest"]})
        update(self.database, ids["lake"], {"keywords": ["forest", "garden"]})

        self.assertEqual(
            list_keywords(self.database),
            [
                {"keyword": "aardvark", "count": 1},
                {"keyword": "forest", "count": 2},
                {"keyword": "garden", "count": 2},
            ],
        )

    def test_migrations_are_recorded_once_for_a_new_database(self) -> None:
        database = connect(self.root / "new-catalog.sqlite")
        self.addCleanup(database.close)

        self.assertEqual(migrate(database), [1, 2, 3, 4])
        self.assertEqual(migrate(database), [])
        self.assertEqual(
            [tuple(row) for row in database.execute("SELECT version, name FROM schema_migrations")],
            [
                (1, "initial_schema"),
                (2, "montage_presets"),
                (3, "montage_exports"),
                (4, "montage_export_duration"),
            ],
        )

    def test_migrations_adopt_a_legacy_catalog_without_changing_edits(self) -> None:
        self.write_record("Analysis")
        import_directory(self.database, self.records)
        update(self.database, "a" * 64, {"title": "Saved title", "review_status": "approved"})
        self.database.execute("DROP TABLE schema_migrations")
        self.database.commit()

        self.assertEqual(migrate(self.database), [1, 2, 3, 4])
        videos, total = list_videos(self.database)

        self.assertEqual(total, 1)
        self.assertEqual(videos[0]["title"], "Saved title")
        self.assertEqual(videos[0]["review_status"], "approved")
