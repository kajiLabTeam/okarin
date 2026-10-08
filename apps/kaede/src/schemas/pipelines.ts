import { z } from 'zod'
import { uuidSchema } from './common.js'

export const assetContractSchema = z
  .object({
    kind: z.literal('asset'),
    data_type: z.enum([
      'acce',
      'gyro',
      'ble',
      'resource.floor_map',
      'resource.beacon_layout',
      'pose',
      'particle',
    ]),
    schema_version: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    format: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  })
  .strict()
export const internalValueContractSchema = z
  .object({
    kind: z.literal('internal_value'),
    value_type: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  })
  .strict()
export const contractSchema = z.discriminatedUnion('kind', [
  assetContractSchema,
  internalValueContractSchema,
])

export const pipelineSlotSchema = z
  .object({
    slot_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    accepted_contracts: z.array(contractSchema).min(1),
    required: z.boolean(),
    max_assets: z.number().int().min(1).max(1),
  })
  .strict()

const jsonObjectSchema = z
  .record(z.unknown())
  .refine((value) => value.type === 'object', 'JSON schema must have type=object')

export const componentContractSchema = z
  .object({
    component_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    instance_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    input_slots: z.array(pipelineSlotSchema),
    output_slots: z.array(pipelineSlotSchema),
    parameters_schema: jsonObjectSchema,
  })
  .strict()

export const slotBindingSchema = z
  .object({
    target_component_instance: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    target_slot_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    source_component_instance: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/)
      .nullable(),
    source_slot_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  })
  .strict()

export const pipelineOutputSchema = z
  .object({
    output_slot_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    source_component_instance: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    source_slot_id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  })
  .strict()

export const pipelineDefinitionSchema = z
  .object({
    pipeline_id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    display_name: z.string().min(1),
    definition_version: z.string().regex(/^v?[0-9]+\.[0-9]+\.[0-9]+$/),
    state: z.enum(['active', 'retired']),
    components: z.array(componentContractSchema).min(1),
    input_slots: z.array(pipelineSlotSchema),
    outputs: z.array(pipelineOutputSchema).min(1),
    bindings: z.array(slotBindingSchema),
    parameters_schema: jsonObjectSchema,
  })
  .strict()
export const pipelineAvailabilitySchema = z
  .object({
    available: z.boolean(),
    reason: z
      .object({ code: z.string().regex(/^[a-z][a-z0-9_]*$/), target: z.string() })
      .strict()
      .nullable(),
  })
  .strict()
export const pipelineSchema = z
  .object({
    definition: pipelineDefinitionSchema,
    availability: pipelineAvailabilitySchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export const activePipelineSchema = pipelineSchema.extend({
  definition: pipelineDefinitionSchema.extend({ state: z.literal('active') }),
})

export const pipelineCatalogEntrySchema = z
  .object({
    pipeline_id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    display_name: z.string().min(1),
    definition_version: z.string().regex(/^v?[0-9]+\.[0-9]+\.[0-9]+$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    input_slots: z.array(pipelineSlotSchema),
    outputs: z.array(pipelineOutputSchema),
    parameters_schema: jsonObjectSchema,
    availability: pipelineAvailabilitySchema,
  })
  .strict()

export const pipelineCatalogSchema = z.array(pipelineCatalogEntrySchema)
export type AssetContract = z.infer<typeof assetContractSchema>
export type PipelineCatalogEntry = z.infer<typeof pipelineCatalogEntrySchema>
export type Pipeline = z.infer<typeof pipelineSchema>

export const pipelineAvailabilityQuerySchema = z.object({
  recording_ids: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((id) => id.trim()))
    .pipe(
      z
        .array(uuidSchema)
        .min(1)
        .max(100)
        .superRefine((ids, context) => {
          if (new Set(ids).size !== ids.length) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'recording_ids must not contain duplicates',
            })
          }
        })
    ),
})

const pipelineIssueSchema = z.object({
  slot_id: z.string(),
  code: z.enum(['MISSING_INPUT', 'AMBIGUOUS_INPUT', 'RESOURCE_NOT_AVAILABLE']),
})

const pipelineUnavailableReasonSchema = z.object({
  code: z.string(),
  target: z.string().optional(),
  recording_id: uuidSchema.optional(),
  slot_id: z.string().optional(),
})

export const pipelineAvailabilityResponseSchema = z.object({
  pipelines: z.array(
    z.object({
      pipeline_id: z.string(),
      display_name: z.string(),
      digest: z.string(),
      definition_version: z.string(),
      available: z.boolean(),
      engine_availability: pipelineAvailabilitySchema,
      unavailable_reasons: z.array(pipelineUnavailableReasonSchema),
      recordings: z.array(
        z.object({
          recording_id: z.string(),
          available: z.boolean(),
          bindings: z.record(z.string(), z.string()),
          issues: z.array(pipelineIssueSchema),
        })
      ),
    })
  ),
})
