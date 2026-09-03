import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

import app as catalog_app
from catalog_db import connect, import_directory, initialize


def record(video_id: str, duration: float | None) -> dict:
    return {
        "id": video_id,
        "current_path": f"{video_id}.mp4",
        "original_filename": f"{video_id}.mp4",
        "filename": {"proposed_stem": video_id},
        "technical": {"duration_seconds": duration, "video": {"orientation": "landscape"}},
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

    def test_job_response_uses_a_fixed_public_field_set(self) -> None:
        response = catalog_app.job_response(
            {"id": "job", "status": "completed", "output": "/private/output.mp4", "extra": "ignore"}
        )

        self.assertEqual(response, {"id": "job", "status": "completed"})
