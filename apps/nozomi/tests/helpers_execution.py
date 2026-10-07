from __future__ import annotations

from typing import Any

from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.schemas.execution import (
    CallbackInfo,
    ExecutionRequest,
    InputManifest,
)
from src.schemas.pipeline import (
    PipelineSnapshot,
    SlotBinding,
)


class FakeExecutor:
    def capabilities(self) -> tuple[Any, ...]:
        return ()

    def execute(
        self, component: Any, inputs: dict[str, Any], parameters: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            slot.slot_id: {"component": component.component_id, "inputs": inputs}
            for slot in component.output_slots
        }


def make_snapshot(pipeline_id: str) -> PipelineSnapshot:
    snapshot = PipelineRegistry(initial_catalog(), FakeExecutor()).resolve(pipeline_id)
    assert snapshot is not None
    return snapshot


def make_request(
    snapshot: PipelineSnapshot,
    available: bool = True,
    bindings: tuple[SlotBinding, ...] | None = None,
) -> ExecutionRequest:
    inputs = []
    for slot in snapshot.definition.input_slots:
        contract = slot.accepted_contracts[0]
        inputs.append(
            InputManifest(
                slot_id=slot.slot_id,
                contract=contract,
                uri="http://seaweedfs:8333/input",
                digest="0" * 64,
                available=available,
            )
        )
    return ExecutionRequest(
        analysis_run_item_id="item-1",
        pipeline_id=snapshot.definition.pipeline_id,
        snapshot_digest=snapshot.digest,
        inputs=tuple(inputs),
        bindings=snapshot.definition.bindings if bindings is None else bindings,
        output_uri="http://seaweedfs:8333/output",
        callback=CallbackInfo(
            url="http://kaede:8080/api/internal/pipeline-executions/callbacks",
            secret="request-scoped-secret",
        ),
    )
