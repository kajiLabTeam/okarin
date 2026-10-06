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
FLOOR_MAP_SVG = AssetContract(
    data_type=DataType.FLOOR_MAP, schema_version="1", format="svg"
)
BEACON_LAYOUT = AssetContract(
    data_type=DataType.BEACON_LAYOUT, schema_version="1", format="json"
)
POSE = InternalValueContract(value_type="pose")
PARTICLE = InternalValueContract(value_type="particle")


def _slot(slot_id: str, *contracts: AssetContract | InternalValueContract) -> Slot:
    return Slot(slot_id=slot_id, accepted_contracts=contracts)


def _component(
    component_id: str, instance_id: str, inputs: tuple[Slot, ...], output: Slot
) -> ComponentContract:
    return ComponentContract(
        component_id=component_id,
        instance_id=instance_id,
        input_slots=inputs,
        output_slots=(output,),
        parameters_schema={"type": "object"},
    )


def initial_catalog() -> tuple[PipelineDefinition, ...]:
    acce, gyro, ble = _slot("acce", ACCE), _slot("gyro", GYRO), _slot("ble", BLE)
    floor_map = _slot("floor_map", FLOOR_MAP_PNG, FLOOR_MAP_SVG)
    beacon_layout = _slot("beacon_layout", BEACON_LAYOUT)
    pose, particle = _slot("pose", POSE), _slot("particle", PARTICLE)

    pdr = _component("pdr", "pdr-1", (acce, gyro), pose)
    pdr_bindings = (
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="acce",
            source_slot_id="acce",
        ),
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="gyro",
            source_slot_id="gyro",
        ),
    )
    pdr_definition = PipelineDefinition(
        pipeline_id="pdr",
        display_name="PDR",
        definition_version="1.0.0",
        components=(pdr,),
        input_slots=(acce, gyro),
        outputs=(
            PipelineOutput(
                output_slot_id="pose",
                source_component_instance="pdr-1",
                source_slot_id="pose",
            ),
        ),
        bindings=pdr_bindings,
    )

    particle_filter = _component(
        "particle-filter", "particle-filter-1", (pose, floor_map), particle
    )
    pf_bindings = (
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="acce",
            source_slot_id="acce",
        ),
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="gyro",
            source_slot_id="gyro",
        ),
        SlotBinding(
            target_component_instance="particle-filter-1",
            target_slot_id="pose",
            source_component_instance="pdr-1",
            source_slot_id="pose",
        ),
        SlotBinding(
            target_component_instance="particle-filter-1",
            target_slot_id="floor_map",
            source_slot_id="floor_map",
        ),
    )
    pf_definition = PipelineDefinition(
        pipeline_id="pdr-particle-filter",
        display_name="PDR + Particle Filter",
        definition_version="1.0.0",
        components=(pdr, particle_filter),
        input_slots=(acce, gyro, floor_map),
        outputs=(
            PipelineOutput(
                output_slot_id="particle",
                source_component_instance="particle-filter-1",
                source_slot_id="particle",
            ),
        ),
        bindings=pf_bindings,
    )

    ble_landmark = _component(
        "ble-landmark", "ble-landmark-1", (pose, ble, floor_map, beacon_layout), pose
    )
    pdr_ble_bindings = (
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="acce",
            source_slot_id="acce",
        ),
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="gyro",
            source_slot_id="gyro",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="pose",
            source_component_instance="pdr-1",
            source_slot_id="pose",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="ble",
            source_slot_id="ble",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="floor_map",
            source_slot_id="floor_map",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="beacon_layout",
            source_slot_id="beacon_layout",
        ),
    )
    pdr_ble_definition = PipelineDefinition(
        pipeline_id="pdr-ble",
        display_name="PDR + BLE",
        definition_version="1.0.0",
        components=(pdr, ble_landmark),
        input_slots=(acce, gyro, ble, floor_map, beacon_layout),
        outputs=(
            PipelineOutput(
                output_slot_id="pose",
                source_component_instance="ble-landmark-1",
                source_slot_id="pose",
            ),
        ),
        bindings=pdr_ble_bindings,
    )

    pdr_pf_ble_bindings = (
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="acce",
            source_slot_id="acce",
        ),
        SlotBinding(
            target_component_instance="pdr-1",
            target_slot_id="gyro",
            source_slot_id="gyro",
        ),
        SlotBinding(
            target_component_instance="particle-filter-1",
            target_slot_id="pose",
            source_component_instance="pdr-1",
            source_slot_id="pose",
        ),
        SlotBinding(
            target_component_instance="particle-filter-1",
            target_slot_id="floor_map",
            source_slot_id="floor_map",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="pose",
            source_component_instance="particle-filter-1",
            source_slot_id="particle",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="ble",
            source_slot_id="ble",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="floor_map",
            source_slot_id="floor_map",
        ),
        SlotBinding(
            target_component_instance="ble-landmark-1",
            target_slot_id="beacon_layout",
            source_slot_id="beacon_layout",
        ),
    )
    pdr_pf_ble_definition = PipelineDefinition(
        pipeline_id="pdr-particle-filter-ble",
        display_name="PDR + Particle Filter + BLE",
        definition_version="1.0.0",
        components=(pdr, particle_filter, ble_landmark),
        input_slots=(acce, gyro, ble, floor_map, beacon_layout),
        outputs=(
            PipelineOutput(
                output_slot_id="pose",
                source_component_instance="ble-landmark-1",
                source_slot_id="pose",
            ),
        ),
        bindings=pdr_pf_ble_bindings,
    )

    return (pdr_definition, pf_definition, pdr_ble_definition, pdr_pf_ble_definition)
