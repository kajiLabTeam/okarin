from __future__ import annotations

from typing import Any

from src.schemas.pipeline import (
    AssetContract,
    ComponentContract,
    DataType,
    InternalValueContract,
    PipelineDefinition,
    PipelineOutput,
    Slot,
    SlotBinding,
)

ACCE = AssetContract(data_type=DataType.ACCE, schema_version="1", format="csv")
GYRO = AssetContract(data_type=DataType.GYRO, schema_version="1", format="csv")
BLE = AssetContract(data_type=DataType.BLE, schema_version="1", format="csv")
FLOOR_MAP_PNG = AssetContract(
    data_type=DataType.FLOOR_MAP, schema_version="1", format="png"
)
BEACON_LAYOUT = AssetContract(
    data_type=DataType.BEACON_LAYOUT, schema_version="1", format="json"
)
TRAJECTORY = InternalValueContract(value_type="trajectory")


def _slot(slot_id: str, *contracts: AssetContract | InternalValueContract) -> Slot:
    return Slot(slot_id=slot_id, accepted_contracts=contracts)


def _parameters_schema(
    *, map_required: bool, particle: bool, ble: bool
) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "initial_direction": {"type": "number", "minimum": 0, "maximum": 360},
        "user_height_m": {"type": "number", "exclusiveMinimum": 0},
    }
    required: list[str] = []
    properties.update(
        {
            "origin_x": {"type": "integer", "minimum": 0},
            "origin_y": {"type": "integer", "minimum": 0},
            "floor_scale": {"type": "number", "exclusiveMinimum": 0},
        }
    )
    if map_required:
        required.extend(("origin_x", "origin_y", "floor_scale"))
    if particle:
        properties.update(
            {
                "particle_count": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100_000,
                },
                "particle_seed": {"type": ["integer", "null"]},
            }
        )
    if ble:
        properties["rssi_threshold_dbm"] = {
            "type": "number",
            "minimum": -150,
            "maximum": 0,
        }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


def _pipeline(
    *,
    pipeline_id: str,
    display_name: str,
    component_id: str,
    inputs: tuple[Slot, ...],
    parameters_schema: dict[str, Any],
) -> PipelineDefinition:
    output = _slot("trajectory", TRAJECTORY)
    component = ComponentContract(
        component_id=component_id,
        instance_id="rikka-1",
        input_slots=inputs,
        output_slots=(output,),
        parameters_schema=parameters_schema,
    )
    bindings = tuple(
        SlotBinding(
            target_component_instance="rikka-1",
            target_slot_id=slot.slot_id,
            source_slot_id=slot.slot_id,
        )
        for slot in inputs
    )
    return PipelineDefinition(
        pipeline_id=pipeline_id,
        display_name=display_name,
        definition_version="1.1.0",
        components=(component,),
        input_slots=inputs,
        outputs=(
            PipelineOutput(
                output_slot_id="trajectory",
                source_component_instance="rikka-1",
                source_slot_id="trajectory",
            ),
        ),
        bindings=bindings,
        parameters_schema=parameters_schema,
    )


def initial_catalog() -> tuple[PipelineDefinition, ...]:
    acce = _slot("acce", ACCE)
    gyro = _slot("gyro", GYRO)
    ble = _slot("ble", BLE)
    floor_map = _slot("floor_map", FLOOR_MAP_PNG)
    beacon_layout = _slot("beacon_layout", BEACON_LAYOUT)

    return (
        _pipeline(
            pipeline_id="pdr",
            display_name="PDR",
            component_id="rikka-pdr",
            inputs=(acce, gyro),
            parameters_schema=_parameters_schema(
                map_required=False, particle=False, ble=False
            ),
        ),
        _pipeline(
            pipeline_id="pdr-particle-filter",
            display_name="PDR + Particle Filter",
            component_id="rikka-pdr-particle-filter",
            inputs=(acce, gyro, floor_map),
            parameters_schema=_parameters_schema(
                map_required=True, particle=True, ble=False
            ),
        ),
        _pipeline(
            pipeline_id="pdr-ble",
            display_name="PDR + BLE",
            component_id="rikka-pdr-ble",
            inputs=(acce, gyro, ble, floor_map, beacon_layout),
            parameters_schema=_parameters_schema(
                map_required=True, particle=False, ble=True
            ),
        ),
        _pipeline(
            pipeline_id="pdr-particle-filter-ble",
            display_name="PDR + Particle Filter + BLE",
            component_id="rikka-pdr-particle-filter-ble",
            inputs=(acce, gyro, ble, floor_map, beacon_layout),
            parameters_schema=_parameters_schema(
                map_required=True, particle=True, ble=True
            ),
        ),
    )
