import { z } from '@hono/zod-openapi'
import { uuidSchema } from './common.js'

export const outputArtifactManifestSchema = z
  .object({
    object_key: z.string().min(1),
    checksum_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    content_type: z.string().min(1),
    format: z.string().min(1),
    size_bytes: z.number().int().nonnegative().optional(),
    generated_at: z.string().min(1).optional(),
    available: z.boolean().optional(),
    generation_status: z.enum(['processing', 'failed']).optional(),
    generation_attempt: z.number().int().nonnegative().optional(),
    retry_available: z.boolean().optional(),
  })
  .strict()
  .refine((artifact) => artifact.available === false || artifact.checksum_sha256 !== undefined, {
    message: 'available artifacts require a checksum',
  })

export const outputManifestSchema = z
  .object({
    schema_version: z.literal('1'),
    artifacts: z.record(z.string().min(1), outputArtifactManifestSchema),
  })
  .strict()

export const positioningAnalysisCallbackRequestSchema = z
  .object({
    event_id: z.string().min(1).max(200),
    analysis_run_item_id: uuidSchema,
    status: z.enum(['processing', 'completed', 'failed']),
    outputs: z
      .record(z.string(), z.unknown())
      .superRefine((outputs, context) => {
        if (!('output_manifest' in outputs)) return
        const parsed = outputManifestSchema.safeParse(outputs.output_manifest)
        if (!parsed.success) {
          context.addIssue({
            code: 'custom',
            path: ['output_manifest'],
            message: 'invalid output manifest',
          })
        }
      })
      .optional(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .openapi('PositioningAnalysisCallbackRequest')

export const positioningAnalysisCallbackResponseSchema = z
  .object({
    event_id: z.string(),
    status: z.enum(['accepted', 'already_processed']),
  })
  .openapi('PositioningAnalysisCallbackResponse')

export type PositioningAnalysisCallbackRequest = z.infer<
  typeof positioningAnalysisCallbackRequestSchema
>
export type PositioningAnalysisCallbackResponse = z.infer<
  typeof positioningAnalysisCallbackResponseSchema
>
