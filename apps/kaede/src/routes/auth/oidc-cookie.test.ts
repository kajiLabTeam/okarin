import { describe, expect, it } from 'vitest'
import { parseGoogleOidcStateCookie, serializeGoogleOidcStateCookie } from './oidc-cookie.js'

const payload = {
  state: 'state-value',
  nonce: 'nonce-value',
  codeVerifier: 'code-verifier',
  expiresAt: '2026-06-17T00:10:00.000Z',
  intent: 'login' as const,
}

describe('Google OIDC state cookie', () => {
  it('signed cookie value を復元する', () => {
    const cookie = serializeGoogleOidcStateCookie(payload, 'secret')

    expect(
      parseGoogleOidcStateCookie(cookie, 'secret', new Date('2026-06-17T00:00:00.000Z'))
    ).toEqual(payload)
  })

  it('署名不一致と期限切れを拒否する', () => {
    const cookie = serializeGoogleOidcStateCookie(payload, 'secret')

    expect(
      parseGoogleOidcStateCookie(cookie, 'other-secret', new Date('2026-06-17T00:00:00.000Z'))
    ).toBeUndefined()
    expect(
      parseGoogleOidcStateCookie(cookie, 'secret', new Date('2026-06-17T00:10:01.000Z'))
    ).toBeUndefined()
  })
})
