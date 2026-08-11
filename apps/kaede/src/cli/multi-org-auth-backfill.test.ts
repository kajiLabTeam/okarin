import { describe, expect, it } from 'vitest'
import { parseOptions } from './multi-org-auth-backfill.js'

describe('multi-org-auth-backfill options', () => {
  it('uses a bounded default batch size', () => {
    expect(parseOptions(['backfill-core'])).toEqual({
      batchSize: 500,
      command: 'backfill-core',
    })
  })

  it('accepts an explicit batch size', () => {
    expect(parseOptions(['backfill-auth', '--batch-size', '25'])).toEqual({
      batchSize: 25,
      command: 'backfill-auth',
    })
  })

  it('accepts the one-shot cutover command', () => {
    expect(parseOptions(['cutover', '--batch-size', '1000'])).toEqual({
      batchSize: 1000,
      command: 'cutover',
    })
  })

  it.each(['0', '-1', '1.5', '10001', 'not-a-number'])('rejects invalid batch size %s', (value) => {
    expect(() => parseOptions(['verify', '--batch-size', value])).toThrow('usage:')
  })
})
