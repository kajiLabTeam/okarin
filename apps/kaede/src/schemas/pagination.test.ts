import { describe, expect, it } from 'vitest'
import {
  buildPaginatedResult,
  decodePaginationCursor,
  encodePaginationCursor,
  paginationQuerySchema,
} from './pagination.js'

const cursor = {
  createdAt: '2026-07-28T00:00:00.123456Z',
  id: '550e8400-e29b-41d4-a716-446655440000',
}

describe('pagination query schema', () => {
  it('query 省略時は limit=20 を適用する', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 })
  })

  it.each([
    ['1', 1],
    ['20', 20],
    ['100', 100],
  ])('limit=%s を数値 %i に変換する', (input, expected) => {
    expect(paginationQuerySchema.parse({ limit: input })).toEqual({ limit: expected })
  })

  it.each(['', '0', '01', '20.0', ' 20', '20 ', '101', '-1', ['20', '30']])(
    '不正な limit=%j を拒否する',
    (limit) => {
      expect(paginationQuerySchema.safeParse({ limit }).success).toBe(false)
    }
  )

  it.each(['', 'a'.repeat(1025), ['cursor-1', 'cursor-2']])(
    '不正な cursor query=%j を拒否する',
    (value) => {
      expect(paginationQuerySchema.safeParse({ cursor: value }).success).toBe(false)
    }
  )
})

describe('pagination cursor codec', () => {
  it('マイクロ秒精度を維持して round-trip する', () => {
    const encoded = encodePaginationCursor(cursor)

    expect(decodePaginationCursor(encoded)).toEqual({
      ok: true,
      value: cursor,
    })
  })

  it.each([
    '',
    'not+base64url',
    'a'.repeat(1025),
    Buffer.from('not json').toString('base64url'),
    Buffer.from(JSON.stringify([])).toString('base64url'),
    Buffer.from(JSON.stringify('cursor')).toString('base64url'),
    Buffer.from(JSON.stringify({ created_at: cursor.createdAt, id: cursor.id })).toString(
      'base64url'
    ),
    Buffer.from(JSON.stringify({ v: 2, created_at: cursor.createdAt, id: cursor.id })).toString(
      'base64url'
    ),
    Buffer.from(
      JSON.stringify({ v: 1, created_at: '2026-07-28T00:00:00.123Z', id: cursor.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, created_at: '0000-01-01T00:00:00.000000Z', id: cursor.id })
    ).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, created_at: cursor.createdAt, id: 'not-a-uuid' })).toString(
      'base64url'
    ),
    Buffer.from(
      JSON.stringify({ v: 1, created_at: cursor.createdAt, id: cursor.id, extra: true })
    ).toString('base64url'),
  ])('不正な cursor %j を拒否する', (value) => {
    expect(decodePaginationCursor(value)).toEqual({
      ok: false,
      error: { type: 'PAGINATION_CURSOR_INVALID' },
    })
  })

  it('不正 UTF-8 を拒否する', () => {
    expect(decodePaginationCursor(Buffer.from([0xc3, 0x28]).toString('base64url'))).toEqual({
      ok: false,
      error: { type: 'PAGINATION_CURSOR_INVALID' },
    })
  })
})

describe('buildPaginatedResult', () => {
  const rows = [
    { id: '11111111-1111-4111-8111-111111111111', cursor_created_at: cursor.createdAt },
    { id: '22222222-2222-4222-8222-222222222222', cursor_created_at: cursor.createdAt },
    { id: '33333333-3333-4333-8333-333333333333', cursor_created_at: cursor.createdAt },
  ]

  it('limit + 1 件から返却対象と next cursor を作る', () => {
    const result = buildPaginatedResult(rows, 2, 3)

    expect(result.items).toEqual(rows.slice(0, 2))
    expect(result.totalCount).toBe(3)
    expect(decodePaginationCursor(result.nextCursor ?? '')).toEqual({
      ok: true,
      value: {
        createdAt: rows[1].cursor_created_at,
        id: rows[1].id,
      },
    })
  })

  it('最終ページは next cursor を返さない', () => {
    expect(buildPaginatedResult(rows.slice(0, 2), 2, 2)).toEqual({
      items: rows.slice(0, 2),
      nextCursor: null,
      totalCount: 2,
    })
  })
})
