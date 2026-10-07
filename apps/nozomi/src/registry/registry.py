from __future__ import annotations

import hashlib
import json
from typing import Any

from src.registry.adapter import ComponentAdapter
from src.schemas.pipeline import (
    PipelineAvailability,
    PipelineAvailabilityReason,
    PipelineCatalogEntry,
    PipelineDefinition,
    PipelineSnapshot,
)


def _canonical_json(data: Any) -> str:
    if isinstance(data, dict):
        return (
            "{"
            + ",".join(
                f"{json.dumps(k)}:{_canonical_json(v)}" for k, v in sorted(data.items())
            )
            + "}"
        )
    if isinstance(data, (list, tuple)):
        return "[" + ",".join(_canonical_json(x) for x in data) + "]"
    return json.dumps(data, separators=(",", ":"))


def compute_digest(definition: PipelineDefinition) -> str:
    canonical = _canonical_json(definition.model_dump(mode="json"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class PipelineRegistry:
    def __init__(
        self,
        definitions: tuple[PipelineDefinition, ...],
        adapter: ComponentAdapter,
    ) -> None:
        self._definitions = {d.pipeline_id: d for d in definitions}
        self._adapter = adapter

    def _check_availability(
        self, definition: PipelineDefinition
    ) -> PipelineAvailability:
        supported_components = {c.component_id for c in self._adapter.capabilities()}
        for comp in definition.components:
            if comp.component_id not in supported_components:
                return PipelineAvailability(
                    available=False,
                    reason=PipelineAvailabilityReason(
                        code="unsupported_component",
                        target=comp.component_id,
                    ),
                )
        return PipelineAvailability(available=True, reason=None)

    def catalog(self) -> tuple[PipelineCatalogEntry, ...]:
        entries = []
        for d in self._definitions.values():
            if d.state != "active":
                continue
            digest = compute_digest(d)
            availability = self._check_availability(d)
            entries.append(
                PipelineCatalogEntry(
                    pipeline_id=d.pipeline_id,
                    display_name=d.display_name,
                    definition_version=d.definition_version,
                    digest=digest,
                    input_slots=d.input_slots,
                    outputs=d.outputs,
                    parameters_schema=d.parameters_schema,
                    availability=availability,
                )
            )
        return tuple(entries)

    def resolve(self, pipeline_id: str) -> PipelineSnapshot | None:
        definition = self._definitions.get(pipeline_id)
        if definition is None or definition.state != "active":
            return None
        digest = compute_digest(definition)
        availability = self._check_availability(definition)
        return PipelineSnapshot(
            digest=digest,
            definition=definition,
            availability=availability,
        )
