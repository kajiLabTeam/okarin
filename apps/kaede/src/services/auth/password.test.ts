import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password service', () => {
  it('password を Argon2id hash に変換する', async () => {
    const passwordHash = await hashPassword('correct-password')

    expect(passwordHash).not.toBe('correct-password')
    expect(passwordHash).toContain('argon2id')
  })

  it('正しい password を検証できる', async () => {
    const passwordHash = await hashPassword('correct-password')

    await expect(verifyPassword(passwordHash, 'correct-password')).resolves.toBe(true)
  })

  it('誤った password は検証に失敗する', async () => {
    const passwordHash = await hashPassword('correct-password')

    await expect(verifyPassword(passwordHash, 'wrong-password')).resolves.toBe(false)
  })

  it('不正な password hash は検証に失敗する', async () => {
    await expect(verifyPassword('not-a-valid-hash', 'any-password')).resolves.toBe(false)
  })

  it('空 password は hash しない', async () => {
    await expect(hashPassword('   ')).rejects.toThrow('password must not be empty')
  })
})
