import { describe, expect, it } from 'vitest'
import { generateSessionToken, hashSessionToken } from './session-token.js'

describe('session token service', () => {
  it('十分な長さの token を生成する', () => {
    const token = generateSessionToken()

    expect(token.length).toBeGreaterThanOrEqual(40)
  })

  it('連続生成した token は異なる', () => {
    const first = generateSessionToken()
    const second = generateSessionToken()

    expect(first).not.toBe(second)
  })

  it('同じ token は同じ hash になる', () => {
    const token = generateSessionToken()

    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
  })

  it('hash は平文 token と異なる', () => {
    const token = generateSessionToken()

    expect(hashSessionToken(token)).not.toBe(token)
  })

  it('空 token は hash しない', () => {
    expect(() => hashSessionToken('   ')).toThrow('session token must not be empty')
  })
})
