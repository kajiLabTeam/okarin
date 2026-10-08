import { describe, expect, it } from 'vitest'
import { pipelineCatalogSchema, pipelineSchema } from './pipelines.js'

const pipeline = {
  definition: {
    pipeline_id: 'pdr',
    display_name: 'PDR',
    definition_version: '1.0.0',
    state: 'active',
    components: [
      {
        component_id: 'pdr',
        instance_id: 'pdr-1',
        input_slots: [
          {
            slot_id: 'acce',
            required: true,
            max_assets: 1,
            accepted_contracts: [
              { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
            ],
          },
        ],
        output_slots: [
          {
            slot_id: 'pose',
            required: true,
            max_assets: 1,
            accepted_contracts: [{ kind: 'internal_value', value_type: 'pose' }],
          },
        ],
        parameters_schema: { type: 'object' },
      },
    ],
    outputs: [
      {
        output_slot_id: 'pose',
        source_component_instance: 'pdr-1',
        source_slot_id: 'pose',
      },
    ],
    bindings: [
      {
        target_component_instance: 'pdr-1',
        target_slot_id: 'acce',
        source_component_instance: null,
        source_slot_id: 'acce',
      },
    ],
    parameters_schema: { type: 'object' },
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
        ],
      },
    ],
  },
  availability: { available: true, reason: null },
  digest: 'd'.repeat(64),
}

const catalogEntry = {
  pipeline_id: 'pdr',
  display_name: 'PDR',
  definition_version: '1.0.0',
  digest: 'd'.repeat(64),
  input_slots: pipeline.definition.input_slots,
  outputs: pipeline.definition.outputs,
  parameters_schema: pipeline.definition.parameters_schema,
  availability: pipeline.availability,
}

describe('pipeline schemas', () => {
  it('Nozomiのpipeline契約を受理する', () => {
    expect(pipelineSchema.parse(pipeline).definition.pipeline_id).toBe('pdr')
    expect(pipelineCatalogSchema.parse([catalogEntry])).toHaveLength(1)
  })

  it('必須のdigestとslot契約が欠けた応答を拒否する', () => {
    expect(pipelineSchema.safeParse({ ...pipeline, digest: undefined }).success).toBe(false)
    expect(
      pipelineSchema.safeParse({
        ...pipeline,
        definition: {
          ...pipeline.definition,
          input_slots: [{ slot_id: 'acce', required: true, max_assets: 1, accepted_contracts: [] }],
        },
      }).success
    ).toBe(false)
  })

  it('壊れたcomponentとbindingを拒否する', () => {
    expect(
      pipelineSchema.safeParse({
        ...pipeline,
        definition: { ...pipeline.definition, components: [{}] },
      }).success
    ).toBe(false)
    expect(
      pipelineSchema.safeParse({
        ...pipeline,
        definition: { ...pipeline.definition, bindings: [{}] },
      }).success
    ).toBe(false)
  })
})
