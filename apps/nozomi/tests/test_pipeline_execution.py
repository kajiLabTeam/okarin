from __future__ import annotations

import asyncio
import json
import math
from pathlib import Path
from typing import Any

import matplotlib.image as mpimg
import numpy as np
import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.registry.catalog import initial_catalog
from src.registry.rikka_executor import RikkaComponentExecutor
from src.routes import executions as execution_routes
from src.routes.executions import start_execution
from src.schemas.execution import (
    ExecutionEvent,
    ExecutionRequest,
    ExecutionStatus,
)
from src.schemas.pipeline import ComponentContract
from src.server import app
from src.usecases.pipeline_execution import (
    ExecutionRepository,
    PermanentComponentError,
    TemporaryComponentError,
    execute_pipeline,
    request_fingerprint,
    retry_pending_callbacks,
    send_callback_with_retry,
    validate_request,
)
from tests.helpers_execution import FakeExecutor, make_request, make_snapshot


def test_single_component_fake_executor_completes() -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot)
    event = execute_pipeline(snapshot, request, FakeExecutor())
    assert event.status == ExecutionStatus.COMPLETED
    assert "trajectory" in event.outputs


def test_multi_component_fake_executor_completes_in_linear_order() -> None:
    snapshot = make_snapshot("pdr-particle-filter")
    request = make_request(snapshot)
    event = execute_pipeline(snapshot, request, FakeExecutor())
    assert event.status == ExecutionStatus.COMPLETED
    assert event.outputs["trajectory"]["component"] == "rikka-pdr-particle-filter"


def test_invalid_and_temporary_inputs_become_typed_failures() -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot, available=False)
    try:
        validate_request(snapshot, request)
    except TemporaryComponentError as exc:
        assert "unavailable" in str(exc)
    request = make_request(snapshot, bindings=())
    try:
        validate_request(snapshot, request)
    except PermanentComponentError as exc:
        assert "bindings" in str(exc)


def test_execution_api_rejects_snapshot_mismatch() -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot).model_dump(mode="json")
    request["snapshot_digest"] = "f" * 64
    response = TestClient(app).post("/internal/pipeline-executions", json=request)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "snapshot_mismatch"


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("input", "http://127.0.0.1:8000/private"),
        ("output", "http://169.254.169.254/latest/meta-data"),
        ("callback", "https://attacker.example/callback"),
    ),
)
def test_execution_request_rejects_unconfigured_outbound_origins(
    field: str, value: str
) -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot).model_dump(mode="python")
    if field == "input":
        request["inputs"][0]["uri"] = value
    elif field == "output":
        request["output_uri"] = value
    else:
        request["callback"]["url"] = value
    with pytest.raises(ValidationError):
        ExecutionRequest.model_validate(request)


def test_execution_api_accepts_rikka_pipeline_before_background_download() -> None:
    client = TestClient(app)
    snapshot = client.get("/internal/pipelines/pdr").json()
    assert snapshot["availability"] == {"available": True, "reason": None}
    digest = snapshot["digest"]
    req = {
        "analysis_run_item_id": "item-test-1",
        "pipeline_id": "pdr",
        "snapshot_digest": digest,
        "inputs": [
            {
                "slot_id": "acce",
                "contract": {
                    "kind": "asset",
                    "data_type": "acce",
                    "schema_version": "1",
                    "format": "csv",
                },
                "uri": "http://seaweedfs:8333/acce.csv",
                "digest": "a" * 64,
                "available": True,
            },
            {
                "slot_id": "gyro",
                "contract": {
                    "kind": "asset",
                    "data_type": "gyro",
                    "schema_version": "1",
                    "format": "csv",
                },
                "uri": "http://seaweedfs:8333/gyro.csv",
                "digest": "b" * 64,
                "available": True,
            },
        ],
        "bindings": snapshot["definition"]["bindings"],
        "output_uri": "http://seaweedfs:8333/output.json",
        "callback": {
            "url": "http://kaede:8080/api/internal/pipeline-executions/callbacks",
            "secret": "request-scoped-secret",
        },
        "parameters": {},
    }
    accepted = start_execution(ExecutionRequest.model_validate(req), BackgroundTasks())
    assert accepted.status == ExecutionStatus.PROCESSING


def test_request_fingerprint_ignores_transport_urls_and_callback_secret() -> None:
    snapshot = make_snapshot("pdr")
    original = make_request(snapshot)
    rotated = original.model_copy(
        update={
            "inputs": tuple(
                item.model_copy(update={"uri": "http://seaweedfs:8333/rotated"})
                for item in original.inputs
            ),
            "output_uri": "http://seaweedfs:8333/rotated-output",
            "callback": original.callback.model_copy(
                update={"secret": "rotated-secret"}
            ),
        }
    )
    changed_input = original.model_copy(
        update={
            "inputs": (
                original.inputs[0].model_copy(update={"digest": "f" * 64}),
                *original.inputs[1:],
            )
        }
    )

    assert request_fingerprint(original) == request_fingerprint(rotated)
    assert request_fingerprint(original) != request_fingerprint(changed_input)


def test_processing_callback_failure_does_not_stop_execution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TestClient(app)
    snapshot = client.get("/internal/pipelines/pdr").json()
    resolved = execution_routes.registry.resolve("pdr")
    assert resolved is not None
    request = make_request(make_snapshot("pdr")).model_copy(
        update={
            "analysis_run_item_id": "callback-failure-regression",
            "snapshot_digest": snapshot["digest"],
            "bindings": tuple(resolved.definition.bindings),
        }
    )
    calls: list[str] = []

    def fail_callback(*args: Any, **kwargs: Any) -> None:
        calls.append("callback")
        raise RuntimeError("callback unavailable")

    def record_execution(*args: Any, **kwargs: Any) -> None:
        calls.append("execution")

    monkeypatch.setattr(execution_routes, "send_callback_with_retry", fail_callback)
    monkeypatch.setattr(execution_routes, "_run_execution", record_execution)
    background = BackgroundTasks()
    accepted = start_execution(request, background)
    asyncio.run(background())

    assert accepted.status == ExecutionStatus.PROCESSING
    assert calls == ["callback", "execution"]


def test_execution_parameters_reject_non_finite_and_out_of_range_values() -> None:
    snapshot = make_snapshot("pdr-particle-filter")
    for parameters in (
        {"origin_x": 0, "origin_y": 0, "floor_scale": 0},
        {"origin_x": 0, "origin_y": 0, "floor_scale": math.inf},
        {
            "origin_x": 0,
            "origin_y": 0,
            "floor_scale": 0.05,
            "particle_count": 0,
        },
    ):
        request = make_request(snapshot).model_copy(update={"parameters": parameters})
        try:
            validate_request(snapshot, request)
        except PermanentComponentError:
            continue
        raise AssertionError(f"invalid parameters were accepted: {parameters}")


def test_callback_delivery_records_and_retries() -> None:
    repo = ExecutionRepository()
    event = ExecutionEvent(
        event_id="evt-1",
        analysis_run_item_id="item-1",
        status=ExecutionStatus.COMPLETED,
    )
    attempts = 0

    def failing_sender(e: ExecutionEvent) -> None:
        nonlocal attempts
        attempts += 1
        raise RuntimeError("network down")

    try:
        send_callback_with_retry(repo, event, sender=failing_sender)
    except RuntimeError:
        pass

    assert attempts == 3
    deliveries = repo.deliveries_for("item-1")
    assert len(deliveries) == 1
    assert deliveries[0].status == "retrying"
    assert deliveries[0].attempts == 3
    assert deliveries[0].next_attempt_at is not None


def test_terminal_callback_retry_survives_repository_restart(tmp_path: Path) -> None:
    database = tmp_path / "executions.sqlite3"
    event = ExecutionEvent(
        event_id="evt-persisted",
        analysis_run_item_id="item-persisted",
        status=ExecutionStatus.COMPLETED,
    )
    repository = ExecutionRepository(str(database))

    def failing_sender(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("temporary outage")

    with pytest.raises(RuntimeError):
        send_callback_with_retry(
            repository,
            event,
            sender=failing_sender,
        )
    repository.close()

    restored = ExecutionRepository(str(database))
    delivery = restored.deliveries_for("item-persisted")[0]
    assert delivery.status == "retrying"
    assert delivery.next_attempt_at is not None
    sent: list[ExecutionEvent] = []

    def succeeding_sender(callback_event: ExecutionEvent) -> None:
        sent.append(callback_event)

    assert (
        retry_pending_callbacks(
            restored,
            sender=succeeding_sender,
            now=delivery.next_attempt_at + 1,
        )
        == 1
    )
    assert sent == [event]
    assert restored.deliveries_for("item-persisted")[0].status == "delivered"


def test_stale_processing_retry_is_skipped_after_terminal_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = ExecutionRepository()
    processing = ExecutionEvent(
        event_id="evt-processing-stale",
        analysis_run_item_id="item-terminal",
        status=ExecutionStatus.PROCESSING,
    )
    delivery = repository.delivery(processing)
    delivery.status = "retrying"
    delivery.next_attempt_at = 0
    repository.update_delivery(delivery)
    stale_snapshot = repository.pending_callbacks(now=1)

    terminal = ExecutionEvent(
        event_id="evt-completed-current",
        analysis_run_item_id="item-terminal",
        status=ExecutionStatus.COMPLETED,
    )
    repository.delivery(terminal)
    monkeypatch.setattr(
        repository, "pending_callbacks", lambda now=None: stale_snapshot
    )
    sent: list[ExecutionEvent] = []

    assert retry_pending_callbacks(repository, sender=sent.append, now=1) == 0
    assert sent == []
    deliveries = repository.deliveries_for("item-terminal")
    statuses = {item.event_id: item.status for item in deliveries}
    assert statuses[processing.event_id] == "superseded"
    assert statuses[terminal.event_id] == "pending"


def test_restart_converges_interrupted_execution_and_supersedes_processing(
    tmp_path: Path,
) -> None:
    database = tmp_path / "executions.sqlite3"
    repository = ExecutionRepository(str(database))
    processing = ExecutionEvent(
        event_id="evt-processing",
        analysis_run_item_id="item-interrupted",
        status=ExecutionStatus.PROCESSING,
    )
    repository.reserve("item-interrupted", "fingerprint", processing)
    delivery = repository.delivery(processing)
    delivery.status = "retrying"
    delivery.next_attempt_at = 0
    repository.update_delivery(delivery)
    repository.close()

    restored = ExecutionRepository(str(database))
    assert restored.recover_interrupted_executions() == 1
    record = restored.get("item-interrupted")
    assert record is not None
    assert record.event.status == ExecutionStatus.FAILED
    assert record.event.error is not None
    assert record.event.error.code == "execution_interrupted"
    deliveries = restored.deliveries_for("item-interrupted")
    assert {item.status for item in deliveries} == {"superseded", "retrying"}
    pending = restored.pending_callbacks(now=1)
    assert len(pending) == 1
    assert pending[0].event.status == ExecutionStatus.FAILED


def _sample_sensor_bytes() -> tuple[bytes, bytes]:
    root = Path(__file__).parents[3]
    sample = root / "sample-csv/input/90steps_turn_Yamamoto"
    return (
        (sample / "Accelerometer.csv").read_bytes(),
        (sample / "Gyroscope.csv").read_bytes(),
    )


def _component(pipeline_id: str) -> ComponentContract:
    definition = next(
        item for item in initial_catalog() if item.pipeline_id == pipeline_id
    )
    return definition.components[0]


def test_rikka_executor_runs_real_pdr() -> None:
    acce, gyro = _sample_sensor_bytes()
    outputs = RikkaComponentExecutor().execute(
        _component("pdr"),
        {"acce": acce, "gyro": gyro},
        {"initial_direction": 90.0, "user_height_m": 1.7},
    )
    trajectory = outputs["trajectory"]
    assert trajectory["component_id"] == "rikka-pdr"
    assert trajectory["step_count"] > 0
    assert len(trajectory["points"]) == trajectory["step_count"] + 1


def test_rikka_executor_runs_real_particle_filter(tmp_path: Path) -> None:
    acce, gyro = _sample_sensor_bytes()
    map_path = tmp_path / "map.png"
    mpimg.imsave(map_path, np.ones((1024, 1024)), cmap="gray", vmin=0, vmax=1)
    outputs = RikkaComponentExecutor().execute(
        _component("pdr-particle-filter"),
        {"acce": acce, "gyro": gyro, "floor_map": map_path.read_bytes()},
        {
            "origin_x": 512,
            "origin_y": 512,
            "floor_scale": 0.05,
            "particle_count": 32,
            "particle_seed": 1,
        },
    )
    trajectory = outputs["trajectory"]
    assert trajectory["component_id"] == "rikka-pdr-particle-filter"
    assert trajectory["step_count"] > 0


def test_rikka_executor_runs_real_pdr_with_ble(tmp_path: Path) -> None:
    executor = RikkaComponentExecutor()
    component_ids = {item.component_id for item in executor.capabilities()}
    assert "rikka-pdr-ble" in component_ids
    assert "rikka-pdr-particle-filter-ble" in component_ids
    acce, gyro = _sample_sensor_bytes()
    map_path = tmp_path / "map.png"
    mpimg.imsave(map_path, np.ones((1024, 1024)), cmap="gray", vmin=0, vmax=1)
    ble = b"""timestamp_s,beacon_id,rssi_dbm
9.8,beacon-1,-90
9.9,beacon-1,-78
10.0,beacon-1,-64
10.1,beacon-1,-55
10.2,beacon-1,-50
10.3,beacon-1,-55
10.4,beacon-1,-64
10.5,beacon-1,-78
10.6,beacon-1,-90
10.7,beacon-1,-90
"""
    layout = json.dumps(
        {"beacons": [{"beacon_id": "beacon-1", "pixel_x": 512, "pixel_y": 512}]}
    ).encode()
    outputs = executor.execute(
        _component("pdr-ble"),
        {
            "acce": acce,
            "gyro": gyro,
            "ble": ble,
            "floor_map": map_path.read_bytes(),
            "beacon_layout": layout,
        },
        {
            "origin_x": 512,
            "origin_y": 512,
            "floor_scale": 0.05,
            "rssi_threshold_dbm": -70.0,
        },
    )
    trajectory = outputs["trajectory"]
    assert trajectory["component_id"] == "rikka-pdr-ble"
    assert trajectory["step_count"] > 0


def test_rikka_executor_runs_real_particle_filter_with_ble(tmp_path: Path) -> None:
    acce, gyro = _sample_sensor_bytes()
    map_path = tmp_path / "map.png"
    mpimg.imsave(map_path, np.ones((1024, 1024)), cmap="gray", vmin=0, vmax=1)
    ble = b"""timestamp_s,beacon_id,rssi_dbm
9.8,beacon-1,-90
9.9,beacon-1,-78
10.0,beacon-1,-64
10.1,beacon-1,-55
10.2,beacon-1,-50
10.3,beacon-1,-55
10.4,beacon-1,-64
10.5,beacon-1,-78
10.6,beacon-1,-90
10.7,beacon-1,-90
"""
    layout = json.dumps(
        {"beacons": [{"beacon_id": "beacon-1", "pixel_x": 512, "pixel_y": 512}]}
    ).encode()
    outputs = RikkaComponentExecutor().execute(
        _component("pdr-particle-filter-ble"),
        {
            "acce": acce,
            "gyro": gyro,
            "ble": ble,
            "floor_map": map_path.read_bytes(),
            "beacon_layout": layout,
        },
        {
            "origin_x": 512,
            "origin_y": 512,
            "floor_scale": 0.05,
            "particle_count": 32,
            "particle_seed": 1,
            "rssi_threshold_dbm": -70.0,
        },
    )
    trajectory = outputs["trajectory"]
    assert trajectory["component_id"] == "rikka-pdr-particle-filter-ble"
    assert trajectory["step_count"] > 0


def test_rikka_executor_rejects_duplicate_or_out_of_map_beacons(
    tmp_path: Path,
) -> None:
    acce, gyro = _sample_sensor_bytes()
    map_path = tmp_path / "map.png"
    mpimg.imsave(map_path, np.ones((64, 64)), cmap="gray", vmin=0, vmax=1)
    ble = b"timestamp_s,beacon_id,rssi_dbm\n1.0,beacon-1,-50\n"
    invalid_layout = json.dumps(
        {
            "beacons": [
                {"beacon_id": "beacon-1", "pixel_x": 10, "pixel_y": 10},
                {"beacon_id": "beacon-1", "pixel_x": 100, "pixel_y": 10},
            ]
        }
    ).encode()
    with pytest.raises(PermanentComponentError, match="beacon_layout"):
        RikkaComponentExecutor().execute(
            _component("pdr-ble"),
            {
                "acce": acce,
                "gyro": gyro,
                "ble": ble,
                "floor_map": map_path.read_bytes(),
                "beacon_layout": invalid_layout,
            },
            {"origin_x": 32, "origin_y": 32, "floor_scale": 0.05},
        )
