import { describe, expect, it } from 'vitest'

import { uploadTargetsSchema } from './common.js'

describe('uploadTargetsSchema', () => {
  it('accepts acce and gyro', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro'])

    expect(result.success).toBe(true)
  })

  it('rejects targets without acce', () => {
    const result = uploadTargetsSchema.safeParse(['gyro', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('rejects targets without gyro', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('rejects duplicate targets', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro', 'gyro'])

    expect(result.success).toBe(false)
  })
})
