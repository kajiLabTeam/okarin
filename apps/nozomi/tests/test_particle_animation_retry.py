from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from rikka.common.lib.models import (
    Landmark,
    LandmarkCorrection,
    LandmarkCorrectionResult,
)

from src.registry.rikka_executor import ParticleAnimation
from src.routes import executions as routes
from src.schemas.execution import (
    ArtifactRetryRequest,
    ExecutionEvent,
    ExecutionStatus,
    OutputArtifactUpload,
)
from src.usecases.pipeline_execution import ExecutionRecord, ExecutionRepository


def animation() -> ParticleAnimation:
    return ParticleAnimation(
        particles=np.array([[[1.0, 2.0, 3.0]], [[4.0, 5.0, 6.0]]]),
        trajectory=[[1.0, 2.0], [4.0, 5.0]],
        gx_mean=0.0,
        gz_mean=9.8,
        landmark=LandmarkCorrectionResult(
            trajectory=[[1.0, 2.0], [4.0, 5.0]],
            raw_trajectory=[[0.0, 0.0], [1.0, 1.0]],
            corrections=(
                LandmarkCorrection(
                    1, 1.0, "beacon", -50.0, 1.0, 1.0, 4.0, 5.0, 4.0, 5.0, True
                ),
            ),
            detection_count=1,
            discarded_count=0,
            rssi_threshold_dbm=-70.0,
            data_path="/temporary/ble.csv",
            landmarks=(Landmark("beacon", 10.0, 20.0, position_sigma_m=0.1),),
        ),
        floor_map_bytes=b"floor-map-image",
        origin_px=(10, 20),
        scale=0.05,
    )


def retry_request() -> ArtifactRetryRequest:
    return ArtifactRetryRequest(
        output_artifacts={
            "particle_animation": OutputArtifactUpload(
                upload_uri="http://seaweedfs:8333/fresh.webm",
                object_key="video.webm",
                content_type="video/webm",
                format="webm",
            ),
            "particle_animation_mp4": OutputArtifactUpload(
                upload_uri="http://seaweedfs:8333/fresh.mp4",
                object_key="video.mp4",
                content_type="video/mp4",
                format="mp4",
                manifest_name="particle_animation",
            ),
        }
    )


def failed_event() -> ExecutionEvent:
    return ExecutionEvent(
        event_id="initial-failure",
        analysis_run_item_id="video-item",
        status=ExecutionStatus.COMPLETED,
        outputs={
            "digest": "original-csv",
            "output_manifest": {
                "schema_version": "1",
                "artifacts": {
                    "particle_animation": {
                        "object_key": "video.webm",
                        "content_type": "video/webm",
                        "format": "webm",
                        "available": False,
                        "generation_status": "failed",
                        "generation_attempt": 0,
                        "retry_available": True,
                    }
                },
            },
        },
    )


def test_source_roundtrip_preserves_particles_and_ble_overlays() -> None:
    source = animation()
    restored = ParticleAnimation.deserialize(source.serialize())
    np.testing.assert_array_equal(restored.particles, source.particles)
    assert restored.landmark == source.landmark
    assert restored.trajectory == source.trajectory
    assert restored.floor_map_bytes == source.floor_map_bytes
    assert restored.origin_px == source.origin_px
    assert restored.scale == source.scale


def test_retry_after_restart_deduplicates_and_only_renders_video(
    tmp_path: Path, monkeypatch: Any
) -> None:
    database = str(tmp_path / "execution.sqlite3")
    repository = ExecutionRepository(database)
    interrupted = failed_event()
    interrupted.outputs["output_manifest"]["artifacts"]["particle_animation"][
        "generation_status"
    ] = "processing"
    repository.put("video-item", ExecutionRecord("fingerprint", interrupted))
    repository.save_artifact_source(
        "video-item", "particle_animation", animation().serialize()
    )
    repository.close()
    repository = ExecutionRepository(database)
    assert repository.recover_interrupted_executions() == 0
    monkeypatch.setattr(routes, "execution_repository", repository)
    events: list[ExecutionEvent] = []
    monkeypatch.setattr(
        routes, "send_callback_with_retry", lambda _repo, event: events.append(event)
    )
    render_calls: list[Any] = []

    def save(particles: Any, trajectory: Any, **kwargs: Any) -> Path:
        render_calls.append(particles)
        np.testing.assert_array_equal(particles, animation().particles)
        assert trajectory == animation().trajectory
        assert kwargs["landmark"] == animation().landmark
        assert Path(kwargs["floormap_path"]).read_bytes() == b"floor-map-image"
        path = Path(kwargs["output_path"]).with_suffix(".mp4")
        path.write_bytes(b"video")
        return path

    monkeypatch.setattr("src.registry.rikka_executor.save_particle_animation", save)
    monkeypatch.setattr(
        routes,
        "execute_pipeline",
        lambda *_args: pytest.fail("Trajectory must not be recalculated"),
    )
    uploads: list[Any] = []

    def upload(payloads: Any, targets: Any) -> dict[str, Any]:
        uploads.append(targets)
        assert payloads == {"particle_animation_mp4": {"body": b"video"}}
        return {
            "particle_animation": {
                "object_key": "video.mp4",
                "available": True,
                "format": "mp4",
                "content_type": "video/mp4",
                "checksum_sha256": "a" * 64,
            }
        }

    monkeypatch.setattr(routes.output_writer, "write_artifacts", upload)
    first = BackgroundTasks()
    accepted = routes.retry_particle_animation("video-item", retry_request(), first)
    assert accepted.generation_attempt == 1
    duplicate = BackgroundTasks()
    assert (
        routes.retry_particle_animation("video-item", retry_request(), duplicate)
        == accepted
    )
    assert len(duplicate.tasks) == 0
    assert len(first.tasks) == 2
    asyncio.run(first())
    assert len(render_calls) == len(uploads) == 1
    assert uploads[0]["particle_animation_mp4"].upload_uri.endswith("fresh.mp4")
    assert len(events) == 2
    assert events[0].event_id != events[1].event_id
    assert all(event.status == ExecutionStatus.COMPLETED for event in events)
    assert all(event.outputs["digest"] == "original-csv" for event in events)
    assert (
        events[1].outputs["output_manifest"]["artifacts"]["particle_animation"][
            "generation_attempt"
        ]
        == 1
    )
    assert (
        events[1].outputs["output_manifest"]["artifacts"]["particle_animation"][
            "available"
        ]
        is True
    )
    # A ready video cannot be retried, and its retained source is released.
    assert (
        repository._connection.execute(
            "SELECT COUNT(*) FROM artifact_sources"
        ).fetchone()[0]
        == 0
    )
    with pytest.raises(HTTPException) as error:
        routes.retry_particle_animation(
            "video-item", retry_request(), BackgroundTasks()
        )
    assert error.value.status_code == 409


def test_repeated_video_failures_can_be_retried_again(monkeypatch: Any) -> None:
    repository = ExecutionRepository()
    repository.put("video-item", ExecutionRecord("fingerprint", failed_event()))
    repository.save_artifact_source(
        "video-item", "particle_animation", animation().serialize()
    )
    monkeypatch.setattr(routes, "execution_repository", repository)
    monkeypatch.setattr(routes, "send_callback_with_retry", lambda *_args: None)

    def fail(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("encoder failed")

    monkeypatch.setattr("src.registry.rikka_executor.save_particle_animation", fail)
    ids = []
    for attempt in (1, 2):
        tasks = BackgroundTasks()
        accepted = routes.retry_particle_animation("video-item", retry_request(), tasks)
        assert accepted.generation_attempt == attempt
        asyncio.run(tasks())
        record = repository.get("video-item")
        assert record is not None and record.event.status == ExecutionStatus.COMPLETED
        assert (
            record.event.outputs["output_manifest"]["artifacts"]["particle_animation"][
                "generation_status"
            ]
            == "failed"
        )
        ids.append(record.event.event_id)
    assert ids[0] != ids[1]


@pytest.mark.parametrize("exists", [True, False])
def test_missing_execution_or_source_is_rejected(
    monkeypatch: Any, exists: bool
) -> None:
    repository = ExecutionRepository()
    if exists:
        repository.put("video-item", ExecutionRecord("fingerprint", failed_event()))
    monkeypatch.setattr(routes, "execution_repository", repository)
    tasks = BackgroundTasks()
    with pytest.raises(HTTPException) as error:
        routes.retry_particle_animation("video-item", retry_request(), tasks)
    assert error.value.status_code == (409 if exists else 404)
    assert not tasks.tasks


def test_retry_rejects_untrusted_upload_origin() -> None:
    payload = retry_request().model_dump()
    payload["output_artifacts"]["particle_animation"]["upload_uri"] = (
        "http://127.0.0.1/private"
    )
    with pytest.raises(ValidationError):
        ArtifactRetryRequest.model_validate(payload)
