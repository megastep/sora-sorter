import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from catalog_db import connect, import_directory, initialize, update


SCRIPT = Path(__file__).parents[1] / ".agents/skills/catalog-db-query/scripts/query_catalog.py"


class QueryCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        self.root = Path(self.workspace.name)
        self.database = self.root / "catalog.sqlite"
        records = self.root / "video_catalog_json"
        records.mkdir()
        (records / "clip.json").write_text(
            json.dumps(
                {
                    "id": "a" * 64,
                    "current_path": "garden.mp4",
                    "original_filename": "garden.mp4",
                    "filename": {"proposed_stem": "garden-walk"},
                    "technical": {"duration_seconds": 12.5, "video": {"orientation": "landscape"}},
                    "audio_analysis": {"language": "en", "speech_present": True},
                    "visual_analysis": {"summary": "A garden walk", "keywords": ["garden"]},
                }
            ),
            encoding="utf-8",
        )
        connection = connect(self.database)
        self.addCleanup(connection.close)
        initialize(connection)
        import_directory(connection, records)
        update(connection, "a" * 64, {"review_status": "approved", "favorite": True})

    def tearDown(self) -> None:
        self.workspace.cleanup()

    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--database", str(self.database), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_search_returns_compact_structured_catalog_data(self) -> None:
        result = self.run_cli("search", "garden", "--review", "approved")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["kind"], "search")
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["items"][0]["title"], "Garden Walk")
        self.assertNotIn("raw_json", payload["items"][0])

    def test_stats_are_available_without_sql(self) -> None:
        stats_result = self.run_cli("stats")

        self.assertEqual(json.loads(stats_result.stdout)["review_statuses"], {"approved": 1})
