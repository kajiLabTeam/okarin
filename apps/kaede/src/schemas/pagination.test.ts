import { describe, expect, it } from 'vitest'
import {
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
