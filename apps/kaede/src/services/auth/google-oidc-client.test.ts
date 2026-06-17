import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { GoogleOidcClient, createPkceCodeChallenge } from './google-oidc-client.js'

describe('GoogleOidcClient', () => {
  it('authorization URL に state / nonce / PKCE challenge を含める', () => {
    const client = new GoogleOidcClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example.test/callback',
      },
      {
        authorizationEndpoint: 'https://accounts.example.test/auth',
        jwks: { keys: [] },
      }
    )

    const url = new URL(
      client.createAuthorizationUrl({
        codeVerifier: 'code-verifier',
        nonce: 'nonce-value',
        state: 'state-value',
      })
    )

    expect(url.origin + url.pathname).toBe('https://accounts.example.test/auth')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.test/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.get('nonce')).toBe('nonce-value')
    expect(url.searchParams.get('code_challenge')).toBe(createPkceCodeChallenge('code-verifier'))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('authorization code を ID token に交換する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id_token: 'id-token' }),
    })
    const client = new GoogleOidcClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example.test/callback',
      },
      {
        fetch: fetchMock,
        jwks: { keys: [] },
        tokenEndpoint: 'https://accounts.example.test/token',
      }
    )

    await expect(
      client.exchangeCodeForIdToken({
        code: 'authorization-code',
        codeVerifier: 'code-verifier',
      })
    ).resolves.toBe('id-token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://accounts.example.test/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
    )
  })

  it('ID token の署名、audience、issuer、nonce を検証する', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const idToken = await new SignJWT({
      sub: 'google-subject',
      email: 'user@example.com',
      email_verified: true,
      name: 'OIDC User',
      nonce: 'nonce-value',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://accounts.google.com')
      .setAudience('client-id')
      .setExpirationTime('5m')
      .sign(privateKey)

    const client = new GoogleOidcClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example.test/callback',
      },
      {
        jwks: { keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] },
      }
    )

    await expect(client.verifyIdToken({ idToken, nonce: 'nonce-value' })).resolves.toEqual({
      sub: 'google-subject',
      email: 'user@example.com',
      emailVerified: true,
      name: 'OIDC User',
      hostedDomain: null,
    })
    await expect(client.verifyIdToken({ idToken, nonce: 'wrong-nonce' })).rejects.toThrow(
      'Google ID token nonce mismatch'
    )
  })
})
