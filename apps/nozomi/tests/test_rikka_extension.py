"""Rikkaだけへの方式追加をNozomiが利用できることを検証する。"""

from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from rikka import analysis_api
from rikka.analysis_contracts import ExecutionOptions

from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.registry.rikka_executor import RikkaComponentExecutor
from src.routes import pipelines
from src.schemas.execution import ExecutionStatus
from src.server import app
from src.usecases.pipeline_execution import (
    PermanentComponentError,
    execute_pipeline,
    validate_request,
)
from tests.helpers_execution import make_request


def test_registered_method_is_listed_validated_and_executed_without_adapter_changes(
    monkeypatch: Any,
) -> None:
    original = analysis_api.list_methods()[0]
    definition = replace(
        original,
        # 方式名から実装や必要入力を推測していないことも検証する。
        method_id="extension-particle-filter-ble",
        display_name="Contract extension test",
        definition_version="2.0.0",
        parameters_schema={
            "type": "object",
            "additionalProperties": False,
            "properties": {"mode": {"type": "string", "enum": ["test"]}},
            "required": ["mode"],
        },
    )
    calls: list[dict[str, bytes]] = []

    def execute(
        inputs: dict[str, bytes], parameters: dict[str, Any], options: ExecutionOptions
    ) -> dict[str, Any]:
        assert parameters == {"mode": "test"}
        assert options.requested_artifacts == ("diagnostics",)
        calls.append(inputs)
        return {"trajectory": {"points": [{"x": 0.0, "y": 0.0}], "step_count": 0}}

    monkeypatch.setitem(
        analysis_api.METHODS,
        definition.method_id,
        analysis_api.Method(definition, execute),
    )
    # 本番でも依存更新後のプロセス起動時に一覧から構築される。
    registry = PipelineRegistry(initial_catalog(), RikkaComponentExecutor())
    monkeypatch.setattr(pipelines, "registry", registry)
    client = TestClient(app)
    entries = client.get("/pipelines").json()
    entry = next(row for row in entries if row["pipeline_id"] == definition.method_id)
    assert entry["availability"]["available"]
    assert entry["definition_version"] == "2.0.0"
    assert entry["parameters_schema"] == definition.parameters_schema
    assert [row["slot_id"] for row in entry["input_slots"]] == [
        "acce",
        "gyro",
        "metadata",
    ]
    snapshot = registry.resolve(definition.method_id)
    assert snapshot is not None
    request = make_request(snapshot).model_copy(update={"parameters": {"mode": "test"}})
    validate_request(snapshot, request)
    with pytest.raises(PermanentComponentError):
        validate_request(
            snapshot, request.model_copy(update={"parameters": {"mode": "invalid"}})
        )
    execution_request = request.model_copy(
        update={
            "parameters": {"mode": "test", "_output_artifacts": {"diagnostics": {}}},
        }
    )

    class Loader:
        def load(self, manifest: Any) -> bytes:
            return str(manifest.slot_id).encode()

    event = execute_pipeline(
        snapshot, execution_request, RikkaComponentExecutor(), Loader()
    )
    assert event.status == ExecutionStatus.COMPLETED
    assert event.outputs["trajectory"]["step_count"] == 0
    assert calls == [{"acce": b"acce", "gyro": b"gyro", "metadata": b"metadata"}]


def test_registered_method_accepts_omitted_optional_input(monkeypatch: Any) -> None:
    original = analysis_api.list_methods()[0]
    definition = replace(
        original,
        method_id="optional-input-test",
        input_slots=(
            *original.input_slots[:2],
            {**original.input_slots[2], "required": False},
        ),
    )
    calls: list[dict[str, bytes]] = []

    def execute(
        inputs: dict[str, bytes],
        _parameters: dict[str, Any],
        _options: ExecutionOptions,
    ) -> dict[str, Any]:
        calls.append(inputs)
        return {"trajectory": {"points": [], "step_count": 0}}

    monkeypatch.setitem(
        analysis_api.METHODS,
        definition.method_id,
        analysis_api.Method(definition, execute),
    )
    snapshot = PipelineRegistry(initial_catalog(), RikkaComponentExecutor()).resolve(
        definition.method_id
    )
    assert snapshot is not None
    request = make_request(snapshot)
    request = request.model_copy(
        update={
            "inputs": tuple(
                item for item in request.inputs if item.slot_id != "metadata"
            ),
        }
    )
    validate_request(snapshot, request)

    class Loader:
        def load(self, manifest: Any) -> bytes:
            return str(manifest.slot_id).encode()

    event = execute_pipeline(snapshot, request, RikkaComponentExecutor(), Loader())
    assert event.status == ExecutionStatus.COMPLETED
    assert calls == [{"acce": b"acce", "gyro": b"gyro"}]
    with pytest.raises(PermanentComponentError):
        validate_request(snapshot, request.model_copy(update={"inputs": ()}))
