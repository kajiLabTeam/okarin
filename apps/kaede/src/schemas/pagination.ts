import { z } from '@hono/zod-openapi'

const DEFAULT_PAGE_LIMIT = 20
const MAX_CURSOR_LENGTH = 1024
const base64UrlSchema = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
const cursorTimestampSchema = z
  .string()
  .datetime({ offset: false, precision: 6 })
  .regex(/Z$/)
  .refine((value) => !value.startsWith('0000-'), {
    message: 'year 0000 is not supported by PostgreSQL timestamptz',
  })

const paginationCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    created_at: cursorTimestampSchema,
    id: z.string().uuid(),
  })
  .strict()

const paginationLimitSchema = z
  .string()
  .regex(/^(?:[1-9]|[1-9]\d|100)$/)
  .default(String(DEFAULT_PAGE_LIMIT))
  .transform(Number)

export const paginationQuerySchema = z
  .object({
    limit: paginationLimitSchema.openapi({
      description: '1 ページあたりの取得件数。省略時は 20、最大 100',
      example: '20',
    }),
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional().openapi({
      description: '次ページ取得用の opaque cursor',
    }),
  })
  .openapi('PaginationQuery')

export const paginationMetadataSchema = z
  .object({
    next_cursor: z.string().nullable().openapi({
      description: '次ページ取得用 cursor。最終ページの場合は null',
    }),
    total_count: z.number().int().min(0).openapi({
      description: 'cursor 条件を除く一覧 scope 全体の件数',
    }),
  })
  .openapi('PaginationMetadata')

export interface PaginationCursor {
  createdAt: string
  id: string
}

export interface PaginationOptions {
  limit: number
  cursor: PaginationCursor | null
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  totalCount: number
}

interface CursorPageRow {
  id: string
  cursor_created_at: string
}

export type PaginationCursorDecodeResult =
  | { ok: true; value: PaginationCursor }
  | { ok: false; error: { type: 'PAGINATION_CURSOR_INVALID' } }

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

const invalidCursor = (): PaginationCursorDecodeResult => ({
  ok: false,
  error: { type: 'PAGINATION_CURSOR_INVALID' },
})

export const encodePaginationCursor = (cursor: PaginationCursor): string => {
  const payload = paginationCursorPayloadSchema.parse({
    v: 1,
    created_at: cursor.createdAt,
    id: cursor.id,
  })

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export const decodePaginationCursor = (encoded: string): PaginationCursorDecodeResult => {
  const encodedResult = base64UrlSchema.safeParse(encoded)

  if (!encodedResult.success) {
    return invalidCursor()
  }

  try {
    const bytes = Buffer.from(encoded, 'base64url')

    if (bytes.toString('base64url') !== encoded) {
      return invalidCursor()
    }

    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const payloadResult = paginationCursorPayloadSchema.safeParse(JSON.parse(json))

    if (!payloadResult.success) {
      return invalidCursor()
    }

    return {
      ok: true,
      value: {
        createdAt: payloadResult.data.created_at,
        id: payloadResult.data.id,
      },
    }
  } catch {
    return invalidCursor()
  }
}

export const buildPaginatedResult = <T extends CursorPageRow>(
  rows: T[],
  limit: number,
  totalCount: number
): PaginatedResult<T> => {
  const hasNextPage = rows.length > limit
  const items = hasNextPage ? rows.slice(0, limit) : rows
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor:
      hasNextPage && lastItem
        ? encodePaginationCursor({
            createdAt: lastItem.cursor_created_at,
            id: lastItem.id,
          })
        : null,
    totalCount,
  }
}
