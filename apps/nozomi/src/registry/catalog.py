from __future__ import annotations

from rikka.analysis_api import list_methods
from rikka.analysis_contracts import MethodDefinition

from src.schemas.pipeline import (
    ComponentContract,
    PipelineDefinition,
    PipelineOutput,
    Slot,
    SlotBinding,
)


def pipeline_from_method(method: MethodDefinition) -> PipelineDefinition:
    inputs = tuple(Slot.model_validate(slot) for slot in method.input_slots)
    outputs = tuple(Slot.model_validate(slot) for slot in method.output_slots)
    component = ComponentContract(
        component_id=method.component_id,
        instance_id="rikka-1",
        input_slots=inputs,
        output_slots=outputs,
        parameters_schema=method.parameters_schema,
    )
    return PipelineDefinition(
        pipeline_id=method.method_id,
        display_name=method.display_name,
        definition_version=method.definition_version,
        components=(component,),
        input_slots=inputs,
        outputs=tuple(
            PipelineOutput(
                output_slot_id=slot.slot_id,
                source_component_instance="rikka-1",
                source_slot_id=slot.slot_id,
            )
            for slot in outputs
        ),
        bindings=tuple(
            SlotBinding(
                target_component_instance="rikka-1",
                target_slot_id=slot.slot_id,
                source_slot_id=slot.slot_id,
            )
            for slot in inputs
        ),
        parameters_schema=method.parameters_schema,
    )


def initial_catalog() -> tuple[PipelineDefinition, ...]:
    return tuple(pipeline_from_method(method) for method in list_methods())
