import { describe, expect, it } from 'vitest'

import { uploadTargetsSchema } from './common.js'

describe('uploadTargetsSchema', () => {
  it('acce と gyro を含む入力を受け入れる', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro'])

    expect(result.success).toBe(true)
  })

  it('acce を含まない入力を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['gyro', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('gyro を含まない入力を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('重複した target を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro', 'gyro'])

    expect(result.success).toBe(false)
  })
})
