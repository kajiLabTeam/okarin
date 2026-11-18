from __future__ import annotations

import json
from typing import Any

import pytest
from rikka import legacy_analysis

from src.registry.rikka_executor import RikkaComponentExecutor
from src.usecases import pipeline_execution
from src.usecases.pipeline_execution import (
    HttpOutputWriter,
    PermanentComponentError,
    execute_pipeline,
    request_fingerprint,
    validate_request,
)
from tests.helpers_execution import make_request, make_snapshot


@pytest.mark.parametrize("with_metadata", [False, True])
@pytest.mark.parametrize(
    "parameters",
    [
        {},
        {
            "origin_x": -1.25,
            "origin_y": 2.5,
            "initial_direction": 123,
            "floor_scale": 0.02,
        },
        {"origin_x": 10, "origin_y": 20},
    ],
)
def test_legacy_pipeline_matches_previous_csv_and_runs_pdr_once(
    monkeypatch: Any, with_metadata: bool, parameters: dict[str, Any]
) -> None:
    calls = []

    def pdr(
        method: str, inputs: dict[str, bytes], params: dict[str, Any]
    ) -> dict[str, Any]:
        calls.append((method, inputs, params))
        return {
            "trajectory": {
                "points": [
                    {"x": 0, "y": 0, "timestamp_s": None},
                    {"x": 1.5, "y": -2.5, "timestamp_s": 10},
                    {"x": 2, "y": -3, "timestamp_s": 12},
                ]
            }
        }

    monkeypatch.setattr("rikka.analysis_api.execute_method", pdr)
    inputs = {
        kind: (
            b"timestamp_ns,wall_time_ms,x,y,z\n"
            b"1000000000,1500,1,2,3\n2000000000,2500,2,3,4\n"
        )
        for kind in ("acce", "gyro")
    }
    if with_metadata:
        inputs["metadata"] = json.dumps({"recording_start_wall_time_ms": 1000}).encode()
    previous_csv = legacy_analysis.analyze_to_csv(inputs, parameters)
    previous_call = calls.pop()
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot).model_copy(
        update={
            "legacy_trajectory": True,
            "parameters": parameters,
        }
    )
    request = request.model_copy(
        update={
            "inputs": tuple(item for item in request.inputs if item.slot_id in inputs),
        }
    )
    validate_request(snapshot, request)

    class Loader:
        def load(self, item):
            return inputs[item.slot_id]

    event = execute_pipeline(snapshot, request, RikkaComponentExecutor(), Loader())
    assert event.status == "completed"
    assert calls == [previous_call]
    assert event.outputs["trajectory"]["_legacy_csv"] == previous_csv
    uploaded = []

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

    class Opener:
        def open(self, request, **kwargs):
            uploaded.append(request.data)
            return Response()

    monkeypatch.setattr(pipeline_execution, "build_opener", lambda *args: Opener())
    HttpOutputWriter().write(request.output_uri, event.outputs)
    assert uploaded == [previous_csv]


def test_legacy_mode_is_part_of_idempotency_and_only_allows_pdr() -> None:
    snapshot = make_snapshot("pdr")
    normal = make_request(snapshot)
    legacy = normal.model_copy(update={"legacy_trajectory": True})
    assert request_fingerprint(normal) != request_fingerprint(legacy)
    other = make_snapshot("pdr-particle-filter")
    with pytest.raises(PermanentComponentError, match="requires pdr"):
        validate_request(
            other, make_request(other).model_copy(update={"legacy_trajectory": True})
        )


def test_missing_metadata_is_only_allowed_for_legacy_requests() -> None:
    snapshot = make_snapshot("pdr")
    request = make_request(snapshot)
    request = request.model_copy(
        update={
            "inputs": tuple(
                item for item in request.inputs if item.slot_id != "metadata"
            ),
        }
    )
    with pytest.raises(PermanentComponentError, match="input manifest"):
        validate_request(snapshot, request)
    validate_request(snapshot, request.model_copy(update={"legacy_trajectory": True}))


def test_legacy_request_redelivery_reserves_only_one_execution(
    monkeypatch: Any,
) -> None:
    from fastapi import BackgroundTasks

    from src.registry.catalog import initial_catalog
    from src.registry.registry import PipelineRegistry
    from src.routes import executions
    from src.usecases.pipeline_execution import ExecutionRepository

    monkeypatch.setattr(executions, "execution_repository", ExecutionRepository())
    registry = PipelineRegistry(initial_catalog(), RikkaComponentExecutor())
    monkeypatch.setattr(executions, "registry", registry)
    snapshot = registry.resolve("pdr")
    assert snapshot is not None
    request = make_request(snapshot).model_copy(update={"legacy_trajectory": True})
    first = BackgroundTasks()
    retry = BackgroundTasks()
    assert executions.start_execution(request, first).status == "processing"
    assert executions.start_execution(request, retry).status == "processing"
    assert len(first.tasks) == 2  # 状態通知と解析をそれぞれ一度だけ予約する。
    assert retry.tasks == []
