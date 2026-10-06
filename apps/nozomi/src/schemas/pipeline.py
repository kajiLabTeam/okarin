from __future__ import annotations

import json
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DataType(StrEnum):
    ACCE = "acce"
    GYRO = "gyro"
    BLE = "ble"
    FLOOR_MAP = "resource.floor_map"
    BEACON_LAYOUT = "resource.beacon_layout"
    POSE = "pose"
    PARTICLE = "particle"


class AssetContract(StrictModel):
    kind: Literal["asset"] = "asset"
    data_type: DataType
    schema_version: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]*$")
    format: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]*$")


class InternalValueContract(StrictModel):
    kind: Literal["internal_value"] = "internal_value"
    value_type: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")


Contract = Annotated[AssetContract | InternalValueContract, Field(discriminator="kind")]


class Slot(StrictModel):
    slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    accepted_contracts: tuple[Contract, ...] = Field(min_length=1)
    required: bool = True
    max_assets: Literal[1] = 1

    @field_validator("accepted_contracts")
    @classmethod
    def unique_contracts(cls, value: tuple[Contract, ...]) -> tuple[Contract, ...]:
        if len(set(value)) != len(value):
            raise ValueError("accepted_contracts must be unique")
        return value


def _json_object_schema(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("type") != "object":
        raise ValueError("parameters_schema must be an object schema")
    try:
        json.dumps(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("parameters_schema must be JSON-serializable") from exc
    return value


class ComponentContract(StrictModel):
    component_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    instance_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    input_slots: tuple[Slot, ...] = ()
    output_slots: tuple[Slot, ...] = Field(min_length=1)
    parameters_schema: dict[str, Any] = Field(
        default_factory=lambda: {"type": "object"}
    )

    @field_validator("parameters_schema")
    @classmethod
    def validate_schema(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _json_object_schema(value)


class SlotBinding(StrictModel):
    target_component_instance: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    target_slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    source_component_instance: str | None = Field(
        default=None, pattern=r"^[a-z][a-z0-9_-]*$"
    )
    source_slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")


class PipelineOutput(StrictModel):
    output_slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    source_component_instance: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    source_slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")


class PipelineDefinition(StrictModel):
    pipeline_id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    display_name: str = Field(min_length=1)
    definition_version: str = Field(pattern=r"^v?[0-9]+\.[0-9]+\.[0-9]+$")
    state: Literal["active", "retired"] = "active"
    components: tuple[ComponentContract, ...] = Field(min_length=1)
    input_slots: tuple[Slot, ...] = ()
    outputs: tuple[PipelineOutput, ...] = Field(min_length=1)
    bindings: tuple[SlotBinding, ...] = ()
    parameters_schema: dict[str, Any] = Field(
        default_factory=lambda: {"type": "object"}
    )

    @field_validator("parameters_schema")
    @classmethod
    def validate_schema(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _json_object_schema(value)

    @model_validator(mode="after")
    def validate_graph(self) -> PipelineDefinition:
        component_map = {c.instance_id: c for c in self.components}
        if len(component_map) != len(self.components):
            raise ValueError("component instance_ids must be unique")

        pipeline_inputs = {slot.slot_id: slot for slot in self.input_slots}
        if len(pipeline_inputs) != len(self.input_slots):
            raise ValueError("pipeline input_slots must have unique slot_ids")

        for binding in self.bindings:
            target = component_map.get(binding.target_component_instance)
            if target is None:
                raise ValueError(
                    f"unknown target component: {binding.target_component_instance}"
                )
            target_slot = next(
                (s for s in target.input_slots if s.slot_id == binding.target_slot_id),
                None,
            )
            if target_slot is None:
                msg = (
                    f"unknown target slot: {binding.target_slot_id} on "
                    f"{binding.target_component_instance}"
                )
                raise ValueError(msg)

            if binding.source_component_instance is None:
                if binding.source_slot_id not in pipeline_inputs:
                    raise ValueError(
                        f"unknown pipeline input slot: {binding.source_slot_id}"
                    )
            else:
                source = component_map.get(binding.source_component_instance)
                if source is None:
                    raise ValueError(
                        f"unknown source component: {binding.source_component_instance}"
                    )
                source_slot = next(
                    (
                        s
                        for s in source.output_slots
                        if s.slot_id == binding.source_slot_id
                    ),
                    None,
                )
                if source_slot is None:
                    msg = (
                        f"unknown source slot: {binding.source_slot_id} on "
                        f"{binding.source_component_instance}"
                    )
                    raise ValueError(msg)

        for out in self.outputs:
            source = component_map.get(out.source_component_instance)
            if source is None:
                raise ValueError(
                    f"unknown output source component: {out.source_component_instance}"
                )
            source_slot = next(
                (s for s in source.output_slots if s.slot_id == out.source_slot_id),
                None,
            )
            if source_slot is None:
                msg = (
                    f"unknown output source slot: {out.source_slot_id} on "
                    f"{out.source_component_instance}"
                )
                raise ValueError(msg)

        return self


class PipelineAvailabilityReason(StrictModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    target: str


class PipelineAvailability(StrictModel):
    available: bool
    reason: PipelineAvailabilityReason | None = None


class PipelineSnapshot(StrictModel):
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    definition: PipelineDefinition
    availability: PipelineAvailability


class PipelineCatalogEntry(StrictModel):
    pipeline_id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    display_name: str = Field(min_length=1)
    definition_version: str = Field(pattern=r"^v?[0-9]+\.[0-9]+\.[0-9]+$")
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    input_slots: tuple[Slot, ...]
    outputs: tuple[PipelineOutput, ...]
    parameters_schema: dict[str, Any]
    availability: PipelineAvailability
