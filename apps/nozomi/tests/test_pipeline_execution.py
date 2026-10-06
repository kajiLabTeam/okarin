from __future__ import annotations

from fastapi.testclient import TestClient

from src.schemas.execution import (
    ExecutionEvent,
    ExecutionStatus,
)
from src.server import app
from src.usecases.pipeline_execution import (
    ExecutionRepository,
    PermanentComponentError,
    TemporaryComponentError,
    execute_pipeline,
    send_callback_with_retry,
    validate_request,
)
from tests.helpers_execution import FakeExecutor, make_request, make_snapshot


def test_single_component_fake_executor_completes() -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot)
    event = execute_pipeline(snapshot, request, FakeExecutor())
    assert event.status == ExecutionStatus.COMPLETED
    assert "pose" in event.outputs


def test_multi_component_fake_executor_completes_in_linear_order() -> None:
    snapshot = make_snapshot("pdr-particle-filter")
    request = make_request(snapshot)
    event = execute_pipeline(snapshot, request, FakeExecutor())
    assert event.status == ExecutionStatus.COMPLETED
    assert event.outputs["particle"]["component"] == "particle-filter"


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


def test_execution_api_rejects_unavailable_pipeline() -> None:
    # In default app, RikkaAdapter returns capabilities=() so available=False
    client = TestClient(app)
    snapshot = client.get("/internal/pipelines/pdr").json()
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
                "uri": "http://storage:9000/acce.csv",
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
                "uri": "http://storage:9000/gyro.csv",
                "digest": "b" * 64,
                "available": True,
            },
        ],
        "bindings": snapshot["definition"]["bindings"],
        "output_uri": "http://storage:9000/output.json",
        "callback": {"url": "http://kaede:8080/callback"},
        "parameters": {},
    }
    response = client.post("/internal/pipeline-executions", json=req)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "UNSUPPORTED_COMPONENT"


def test_callback_delivery_records_and_retries() -> None:
    repo = ExecutionRepository()
    event = ExecutionEvent(
        event_id="evt-1",
        analysis_run_item_id="item-1",
        status=ExecutionStatus.COMPLETED,
    )
    attempts = 0

    def failing_sender(e, url, secret):
        nonlocal attempts
        attempts += 1
        raise RuntimeError("network down")

    try:
        send_callback_with_retry(
            repo, event, "http://kaede:8080/callback", None, sender=failing_sender
        )
    except RuntimeError:
        pass

    assert attempts == 3
    deliveries = repo.deliveries_for("item-1")
    assert len(deliveries) == 1
    assert deliveries[0].status == "failed"
    assert deliveries[0].attempts == 3
