import type { Context } from 'hono'
import type { ZodType } from 'zod'

export const parseWithSchema = <T>(schema: ZodType<T>, input: unknown): T => {
  return schema.parse(input)
}

export const validationErrorResponse = (c: Context, error: unknown) => {
  if (error && typeof error === 'object' && 'issues' in error) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        issues: error.issues,
      },
      400
    )
  }

  return c.json(
    {
      error: 'VALIDATION_ERROR',
      issues: [],
    },
    400
  )
}
