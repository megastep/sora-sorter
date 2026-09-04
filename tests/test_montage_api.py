import json
import math
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

import app as catalog_app
from catalog_db import connect, import_directory, initialize, montage_export, record_montage_export


def record(video_id: str, duration: float | None) -> dict:
    return {
        "id": video_id,
        "current_path": f"{video_id}.mp4",
        "original_filename": f"{video_id}.mp4",
        "filename": {"proposed_stem": video_id},
        "technical": {"duration_seconds": duration, "video": {"orientation": "landscape", "codec": "h264"}},
        "audio_analysis": {},
        "visual_analysis": {},
    }


class MontageApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        self.root = Path(self.workspace.name)
        records = self.root / "video_catalog_json"
        records.mkdir()
        self.first_id = "a" * 64
        self.second_id = "b" * 64
        for video_id in (self.first_id, self.second_id):
            (records / f"{video_id}.json").write_text(
                json.dumps(record(video_id, 1)), encoding="utf-8"
            )
            (self.root / f"{video_id}.mp4").touch()
        catalog_app.configure(catalog_app.catalog_paths(self.root))
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        initialize(database)
        import_directory(database, records)
        catalog_app.jobs.clear()
        catalog_app.capability_probe = None

    def tearDown(self) -> None:
        self.workspace.cleanup()

    def test_rejects_unknown_media_duration_instead_of_rendering_one_frame(self) -> None:
        unknown_id = "c" * 64
        records = self.root / "video_catalog_json"
        (records / "unknown.json").write_text(json.dumps(record(unknown_id, None)), encoding="utf-8")
        (self.root / f"{unknown_id}.mp4").touch()
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        initialize(database)
        import_directory(database, records)

        with self.assertRaises(HTTPException) as raised:
            catalog_app.batch_videos(catalog_app.BatchPayload(ids=[self.first_id, unknown_id]))

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("duration is unavailable", raised.exception.detail)

    def test_rejects_browser_incompatible_video_codecs_before_montage_preview(self) -> None:
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        database.execute(
            "UPDATE videos SET raw_json=json_set(raw_json, '$.technical.video.codec', 'prores') WHERE id=?",
            (self.first_id,),
        )
        database.commit()

        with self.assertRaises(HTTPException) as raised:
            catalog_app.batch_videos(
                catalog_app.BatchPayload(ids=[self.first_id, self.second_id])
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("unsupported browser media format", raised.exception.detail)

    def test_rejects_browser_incompatible_audio_and_containers_before_montage_preview(self) -> None:
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        database.execute(
            "UPDATE videos SET raw_json=json_set(raw_json, '$.technical.audio.codec', 'ac3') WHERE id=?",
            (self.first_id,),
        )
        database.commit()

        with self.assertRaises(HTTPException) as raised:
            catalog_app.batch_videos(catalog_app.BatchPayload(ids=[self.first_id, self.second_id]))

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("audio codec ac3", raised.exception.detail)

        database.execute("UPDATE videos SET current_path=? WHERE id=?", (f"{self.first_id}.mov", self.first_id))
        database.execute(
            "UPDATE videos SET raw_json=json_remove(raw_json, '$.technical.audio.codec') WHERE id=?",
            (self.first_id,),
        )
        database.commit()
        (self.root / f"{self.first_id}.mov").touch()

        with self.assertRaises(HTTPException) as raised:
            catalog_app.batch_videos(catalog_app.BatchPayload(ids=[self.first_id, self.second_id]))

        self.assertIn("container mov", raised.exception.detail)

    def test_serves_the_source_media_type(self) -> None:
        self.assertEqual(catalog_app.media(self.first_id).media_type, "video/mp4")

    def test_rejects_non_finite_media_duration_instead_of_crashing_the_preview(self) -> None:
        item = {
            "id": self.first_id,
            "title": "Broken duration",
            "duration_seconds": math.nan,
        }
        with patch("app.record", return_value=item), patch("app.file_for"):
            with self.assertRaises(HTTPException) as raised:
                catalog_app.batch_videos(
                    catalog_app.BatchPayload(ids=[self.first_id, self.second_id])
                )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("duration is unavailable", raised.exception.detail)

    def test_rejects_non_finite_montage_timing(self) -> None:
        with self.assertRaises(ValidationError):
            catalog_app.MontageSettingsPayload.model_validate(
                {
                    "format": "landscape",
                    "fillMismatchedOrientation": True,
                    "title": "Title",
                    "titleSubtitle": "",
                    "titleFontSize": 88,
                    "titleSubtitleFontSize": 28,
                    "transition": "crossfade",
                    "transitionDuration": math.nan,
                    "cutColor": "#000000",
                    "endPage": {
                        "enabled": False,
                        "title": "Thanks for watching",
                        "subtitle": "",
                        "fontSize": 88,
                        "subtitleFontSize": 28,
                    },
                }
            )

    def test_rejects_non_cut_transitions_that_exceed_clip_duration(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            catalog_app.validate_montage_transition(
                {
                    "transition": "crossfade",
                    "transitionDuration": 1,
                    "clips": [{"duration_seconds": 1}, {"duration_seconds": 2}],
                }
            )

        self.assertEqual(raised.exception.status_code, 400)
        catalog_app.validate_montage_transition(
            {
                "transition": "cut",
                "transitionDuration": 2,
                "clips": [{"duration_seconds": 1}, {"duration_seconds": 1}],
            }
        )
        catalog_app.validate_montage_transition(
            {
                "transition": "film-cut",
                "transitionDuration": 2,
                "clips": [{"duration_seconds": 1}, {"duration_seconds": 1}],
            }
        )

    def test_reports_invalid_video_files_without_exposing_a_path(self) -> None:
        with patch(
            "app.subprocess.run",
            return_value=subprocess.CompletedProcess(["ffprobe"], 1, stderr="invalid data"),
        ):
            result = catalog_app.video_integrity(self.first_id)

        self.assertEqual(result, {"valid": False, "reason": "FFmpeg could not read this video file."})

    def test_renderer_spawn_failure_marks_the_job_failed(self) -> None:
        job_id = "job"
        request_path = self.root / "request.json"
        request_path.write_text("{}", encoding="utf-8")
        catalog_app.jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "output": str(self.root / "result.mp4"),
        }

        with patch("app.subprocess.Popen", side_effect=OSError("node is unavailable")):
            catalog_app._render_job(job_id, request_path)

        status = catalog_app.montage_status(job_id)
        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["error_code"], "render_failed")

    def test_output_reader_start_failure_marks_the_job_failed_and_terminates_renderer(self) -> None:
        class Process:
            stdout = iter(())

            def __init__(self) -> None:
                self.terminated = False

            def poll(self) -> None:
                return None

            def terminate(self) -> None:
                self.terminated = True

            def wait(self, timeout: float | None = None) -> int:
                return 1

        job_id = "job"
        request_path = self.root / "request.json"
        request_path.write_text("{}", encoding="utf-8")
        catalog_app.jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "output": str(self.root / "result.mp4"),
        }
        process = Process()

        with patch("app.subprocess.Popen", return_value=process), patch("app.threading.Thread") as thread:
            thread.return_value.start.side_effect = RuntimeError("no threads")
            catalog_app._render_job(job_id, request_path)

        status = catalog_app.montage_status(job_id)
        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["error_code"], "render_failed")
        self.assertTrue(process.terminated)

    def test_renderer_starting_during_shutdown_is_terminated_without_registration(self) -> None:
        class Process:
            stdout = iter(())

            def __init__(self) -> None:
                self.terminated = False

            def poll(self) -> None:
                return None

            def terminate(self) -> None:
                self.terminated = True

            def wait(self, timeout: float | None = None) -> int:
                return 1

        job_id = "job"
        request_path = self.root / "request.json"
        request_path.write_text("{}", encoding="utf-8")
        catalog_app.jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "output": str(self.root / "result.mp4"),
        }
        process = Process()
        catalog_app.server_stopping = True

        with patch("app.subprocess.Popen", return_value=process):
            catalog_app._render_job(job_id, request_path)

        self.assertTrue(process.terminated)
        self.assertEqual(catalog_app.montage_status(job_id)["status"], "failed")
        self.assertNotIn(job_id, catalog_app.render_processes)

    def test_server_shutdown_terminates_active_renderer_and_removes_staging_artifacts(self) -> None:
        class Process:
            def __init__(self) -> None:
                self.terminated = False

            def poll(self) -> None:
                return None

            def terminate(self) -> None:
                self.terminated = True

            def wait(self, timeout: float | None = None) -> int:
                return 1

        job_id = "job"
        request_path = self.root / "request.json"
        rendered_output = self.root / ".rendering.mp4"
        request_path.write_text("{}", encoding="utf-8")
        rendered_output.touch()
        process = Process()
        catalog_app.jobs[job_id] = {
            "id": job_id,
            "status": "rendering",
            "output": str(self.root / "result.mp4"),
            "render_output": str(rendered_output),
        }
        catalog_app.render_processes[job_id] = (process, request_path, rendered_output)

        catalog_app.stop_renderers()

        self.assertTrue(process.terminated)
        self.assertEqual(catalog_app.montage_status(job_id)["status"], "failed")
        self.assertFalse(request_path.exists())
        self.assertFalse(rendered_output.exists())
        self.assertNotIn(job_id, catalog_app.render_processes)

    def test_rejects_a_montage_directory_that_contains_the_library(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not be the library root"):
            catalog_app.catalog_paths(self.root, montage_directory=self.root.parent)

    def test_renderer_timeout_marks_the_job_failed_and_terminates_it(self) -> None:
        class HangingProcess:
            stdout = iter(())

            def __init__(self) -> None:
                self.terminated = False

            def terminate(self) -> None:
                self.terminated = True

            def wait(self, timeout: float | None = None) -> int:
                return 0

        job_id = "job"
        request_path = self.root / "request.json"
        request_path.write_text("{}", encoding="utf-8")
        output = self.root / "result.mp4"
        output.touch()
        catalog_app.jobs[job_id] = {"id": job_id, "status": "queued", "output": str(output)}
        process = HangingProcess()

        with patch("app.RENDER_TIMEOUT_SECONDS", 0), patch(
            "app.subprocess.Popen", return_value=process
        ):
            catalog_app._render_job(job_id, request_path)

        status = catalog_app.montage_status(job_id)
        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["error_code"], "render_timeout")
        self.assertTrue(process.terminated)
        self.assertFalse(output.exists())

    def test_transient_capability_probe_failure_is_not_cached(self) -> None:
        with patch(
            "app.subprocess.run",
            side_effect=subprocess.TimeoutExpired("node", 120),
        ):
            capability = catalog_app.montage_capabilities()

        self.assertFalse(capability["accelerated"])
        self.assertIsNone(catalog_app.capability_probe)

    def test_non_encoder_capability_probe_failure_is_not_cached(self) -> None:
        with patch(
            "app.subprocess.run",
            return_value=subprocess.CompletedProcess(["node"], 1, stderr="Chromium crashed"),
        ):
            capability = catalog_app.montage_capabilities()

        self.assertFalse(capability["accelerated"])
        self.assertIsNone(catalog_app.capability_probe)

    def test_capability_probe_uses_and_cleans_up_a_unique_output(self) -> None:
        seen_outputs: list[Path] = []

        def complete_probe(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
            output = Path(command[-1])
            seen_outputs.append(output)
            output.touch()
            return subprocess.CompletedProcess(command, 0, stderr="")

        with patch("app.subprocess.run", side_effect=complete_probe):
            capability = catalog_app.montage_capabilities()

        self.assertTrue(capability["accelerated"])
        self.assertEqual(len(seen_outputs), 1)
        self.assertEqual(seen_outputs[0].parent.resolve(), (self.root / ".catalog_montages").resolve())
        self.assertTrue(seen_outputs[0].name.startswith(".acceleration-probe-"))
        self.assertFalse(seen_outputs[0].exists())

    def test_retries_export_persistence_after_a_transient_database_lock(self) -> None:
        job = {
            "title": "Export",
            "output": str(self.root / "result.mp4"),
            "duration_seconds": 12,
        }

        with patch(
            "app.record_montage_export",
            side_effect=[sqlite3.OperationalError("database is locked"), None],
        ) as record_export, patch("app.time.sleep") as sleep:
            catalog_app.persist_montage_export("job", job)

        self.assertEqual(record_export.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_job_response_uses_a_fixed_public_field_set(self) -> None:
        response = catalog_app.job_response(
            {"id": "job", "status": "completed", "output": "/private/output.mp4", "extra": "ignore"}
        )

        self.assertEqual(response, {"id": "job", "status": "completed"})

    def test_deletes_stale_export_record_when_the_file_is_missing(self) -> None:
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        record_montage_export(database, "job-1", "Missing file", "missing.mp4", 12)
        export_id = database.execute("SELECT id FROM montage_exports WHERE job_id='job-1'").fetchone()[0]

        self.assertEqual(catalog_app.remove_montage_export(export_id), {"deleted": True})
        with self.assertRaises(KeyError):
            montage_export(database, export_id)

    def test_file_removal_failure_preserves_the_export_record(self) -> None:
        output_directory = self.root / ".catalog_montages"
        output_directory.mkdir()
        output = output_directory / "export.mp4"
        output.touch()
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        record_montage_export(database, "job-1", "Export", output.name, 12)
        export_id = database.execute("SELECT id FROM montage_exports WHERE job_id='job-1'").fetchone()[0]

        with patch("pathlib.Path.unlink", side_effect=OSError("read-only directory")):
            with self.assertRaises(HTTPException) as raised:
                catalog_app.remove_montage_export(export_id)

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(montage_export(database, export_id)["filename"], output.name)
        self.assertTrue(output.is_file())

    def test_rejects_montage_symlinks_that_escape_the_export_directory(self) -> None:
        output_directory = self.root / ".catalog_montages"
        output_directory.mkdir()
        external_file = self.root / "outside.mp4"
        external_file.write_bytes(b"private")
        linked_output = output_directory / "export.mp4"
        linked_output.symlink_to(external_file)
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        record_montage_export(database, "export-1", "Escaped", linked_output.name, 12)
        export_id = database.execute(
            "SELECT id FROM montage_exports WHERE job_id='export-1'"
        ).fetchone()[0]
        catalog_app.jobs["job-1"] = {
            "id": "job-1",
            "status": "completed",
            "output": str(linked_output),
        }

        with self.assertRaises(HTTPException) as raised:
            catalog_app.download_montage("job-1")

        self.assertEqual(raised.exception.status_code, 404)

    def test_deleting_a_montage_symlink_preserves_its_contained_target(self) -> None:
        output_directory = self.root / ".catalog_montages"
        output_directory.mkdir()
        target = output_directory / "target.mp4"
        target.write_bytes(b"montage")
        linked_output = output_directory / "requested.mp4"
        linked_output.symlink_to(target)
        database = connect(self.root / "catalog.sqlite")
        self.addCleanup(database.close)
        record_montage_export(database, "export-1", "Requested", linked_output.name, 12)
        export_id = database.execute(
            "SELECT id FROM montage_exports WHERE job_id='export-1'"
        ).fetchone()[0]

        self.assertEqual(catalog_app.remove_montage_export(export_id), {"deleted": True})
        self.assertTrue(target.exists())
        self.assertFalse(linked_output.exists())
        with self.assertRaises(HTTPException) as raised:
            catalog_app.montage_export_path(export_id)

        self.assertEqual(raised.exception.status_code, 404)
