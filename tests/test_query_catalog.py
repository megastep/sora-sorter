import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


class MontageCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requests: list[tuple[str, str, dict | None]] = []
        self.capability = {"accelerated": True}
        self.download = {"body": b"mp4-data", "content_length": len(b"mp4-data")}
        requests = self.requests
        capability = self.capability
        download = self.download
        self.preset = {
            "id": 7,
            "name": "Social",
            "last_used_at": "2026-09-03 12:00:00",
            "settings": {
                "format": "portrait",
                "title": "Daily clips",
                "titleSubtitle": "",
                "titleFontSize": 88,
                "titleSubtitleFontSize": 36,
                "transition": "crossfade",
                "transitionDuration": 0.5,
                "cutColor": "#000000",
                "endPage": {
                    "enabled": False,
                    "title": "Thanks for watching",
                    "subtitle": "",
                    "fontSize": 88,
                    "subtitleFontSize": 36,
                },
            },
        }
        preset = self.preset

        class Handler(BaseHTTPRequestHandler):
            def reply(self, payload: dict, status: int = 200) -> None:
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                requests.append(("GET", self.path, None))
                if self.path == "/api/montage-presets":
                    self.reply({"items": [preset]})
                elif self.path == "/api/montages/capabilities":
                    self.reply(capability)
                elif self.path == "/api/montage-exports":
                    self.reply(
                        {
                            "items": [
                                {
                                    "id": 1,
                                    "title": "Draft | portrait\nsecond line",
                                    "duration_seconds": 12,
                                    "generated_at": "2026-09-03 12:00:00",
                                }
                            ]
                        }
                    )
                elif self.path == "/api/montages/job-1":
                    self.reply(
                        {
                            "id": "job-1",
                            "status": "completed",
                            "progress": 1,
                            "stage": "completed",
                        }
                    )
                elif self.path == "/api/montages/job-1/download":
                    body = download["body"]
                    self.send_response(200)
                    self.send_header("Content-Type", "video/mp4")
                    self.send_header("Content-Length", str(download["content_length"]))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.reply({"detail": "Not found"}, 404)

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length) or b"{}")
                requests.append(("POST", self.path, payload))
                if self.path == "/api/montages":
                    self.reply(
                        {
                            "id": "job-1",
                            "status": "queued",
                            "progress": 0,
                            "stage": "queued",
                        }
                    )
                elif self.path == "/api/montage-presets/7/use":
                    self.reply({})
                else:
                    self.reply({"detail": "Not found"}, 404)

            def log_message(self, format: str, *args: object) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        host, port = self.server.server_address
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--server", f"http://{host}:{port}", *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_lists_presets_without_direct_database_access(self) -> None:
        result = self.run_cli("presets")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["kind"], "presets")
        self.assertEqual(payload["items"][0]["name"], "Social")
        self.assertNotIn("settings_json", payload["items"][0])

    def test_montage_markdown_escapes_user_text_in_table_cells(self) -> None:
        self.preset["name"] = "Draft | portrait\nsecond line"

        presets = self.run_cli("--format", "markdown", "presets")
        montages = self.run_cli("--format", "markdown", "montages")

        self.assertEqual(presets.returncode, 0, presets.stderr)
        self.assertEqual(montages.returncode, 0, montages.stderr)
        self.assertIn("Draft \\| portrait second line", presets.stdout)
        self.assertIn("Draft \\| portrait second line", montages.stdout)

    def test_generates_with_preset_and_preserves_video_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.mp4"
            result = self.run_cli(
                "generate",
                "video-b",
                "video-a",
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["job"]["status"], "completed")
            self.assertEqual(output.read_bytes(), b"mp4-data")
            render_request = next(
                body for method, path, body in self.requests if method == "POST" and path == "/api/montages"
            )
            self.assertEqual(
                render_request["spec"]["clips"],
                [{"id": "video-b"}, {"id": "video-a"}],
            )
            self.assertEqual(render_request["spec"]["format"], "portrait")
            self.assertTrue(render_request["spec"]["fillMismatchedOrientation"])
            self.assertIn(("POST", "/api/montage-presets/7/use", {}), self.requests)

    def test_rejects_truncated_download_without_publishing_partial_output(self) -> None:
        self.download["content_length"] = len(self.download["body"]) + 1
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.mp4"
            result = self.run_cli("job", "job-1", "--output", str(output))

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Download was incomplete", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_duplicate_video_ids_before_rendering(self) -> None:
        result = self.run_cli("generate", "same", "same", "--preset", "7")

        self.assertEqual(result.returncode, 2)
        self.assertIn("at least two unique video IDs", result.stderr)
        self.assertFalse(any(path == "/api/montages" for _, path, _ in self.requests))

    def test_rejects_infinite_wait_timeout_during_argument_parsing(self) -> None:
        result = self.run_cli("job", "job-1", "--wait", "--timeout", "inf")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("finite number", result.stderr)

    def test_resolves_a_numeric_preset_name(self) -> None:
        self.preset["name"] = "2026"

        result = self.run_cli("generate", "video-a", "video-b", "--preset", "2026", "--no-wait")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["preset"]["name"], "2026")

    def test_requires_explicit_software_fallback_when_acceleration_is_unavailable(self) -> None:
        self.capability.update(accelerated=False, reason="No hardware encoder")

        result = self.run_cli("generate", "video-a", "video-b")

        self.assertEqual(result.returncode, 2)
        self.assertIn("Hardware acceleration is unavailable", result.stderr)
        self.assertIn("--software-fallback", result.stderr)
        self.assertFalse(any(path == "/api/montages" for _, path, _ in self.requests))
