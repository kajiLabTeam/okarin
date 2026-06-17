import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'
import type { JSONWebKeySet, JWTVerifyGetKey, JWTPayload } from 'jose'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const googleAuthorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
const googleTokenEndpoint = 'https://oauth2.googleapis.com/token'
const googleJwksUrl = 'https://www.googleapis.com/oauth2/v3/certs'

export interface GoogleOidcClientConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface GoogleOidcClientOptions {
  authorizationEndpoint?: string
  tokenEndpoint?: string
  jwks?: JSONWebKeySet
  jwksUrl?: string
  fetch?: typeof fetch
}

export interface GoogleIdTokenClaims {
  sub: string
  email: string
  emailVerified: boolean
  name: string
  hostedDomain: string | null
}

interface GoogleIdTokenPayload extends JWTPayload {
  email?: unknown
  email_verified?: unknown
  name?: unknown
  hd?: unknown
}

const base64Url = (value: Buffer) => value.toString('base64url')

export const generateOidcState = () => randomUUID()

export const generateOidcNonce = () => randomUUID()

export const generatePkceCodeVerifier = () => base64Url(randomBytes(32))

export const createPkceCodeChallenge = (codeVerifier: string) => {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

const requireStringClaim = (payload: GoogleIdTokenPayload, key: keyof GoogleIdTokenPayload) => {
  const value = payload[key]

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Google ID token ${String(key)} claim is missing`)
  }

  return value
}

export class GoogleOidcClient {
  private readonly authorizationEndpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly jwks: JWTVerifyGetKey
  private readonly tokenEndpoint: string

  constructor(
    private readonly config: GoogleOidcClientConfig,
    options: GoogleOidcClientOptions = {}
  ) {
    this.authorizationEndpoint = options.authorizationEndpoint ?? googleAuthorizationEndpoint
    this.fetchImpl = options.fetch ?? fetch
    this.jwks = options.jwks
      ? createLocalJWKSet(options.jwks)
      : createRemoteJWKSet(new URL(options.jwksUrl ?? googleJwksUrl))
    this.tokenEndpoint = options.tokenEndpoint ?? googleTokenEndpoint
  }

  createAuthorizationUrl({
    codeVerifier,
    nonce,
    state,
  }: {
    codeVerifier: string
    nonce: string
    state: string
  }) {
    const url = new URL(this.authorizationEndpoint)
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', this.config.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', createPkceCodeChallenge(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')

    return url.toString()
  }

  async exchangeCodeForIdToken({
    code,
    codeVerifier,
  }: {
    code: string
    codeVerifier: string
  }): Promise<string> {
    const response = await this.fetchImpl(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    })

    if (!response.ok) {
      throw new Error(`Google token endpoint returned ${response.status}`)
    }

    const body = (await response.json()) as { id_token?: unknown }

    if (typeof body.id_token !== 'string' || body.id_token.trim().length === 0) {
      throw new Error('Google token endpoint did not return id_token')
    }

    return body.id_token
  }

  async verifyIdToken({ idToken, nonce }: { idToken: string; nonce: string }) {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      audience: this.config.clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    })
    const googlePayload = payload as GoogleIdTokenPayload

    if (googlePayload.nonce !== nonce) {
      throw new Error('Google ID token nonce mismatch')
    }

    return {
      sub: requireStringClaim(googlePayload, 'sub'),
      email: requireStringClaim(googlePayload, 'email'),
      emailVerified: googlePayload.email_verified === true,
      name:
        typeof googlePayload.name === 'string' && googlePayload.name.trim().length > 0
          ? googlePayload.name
          : requireStringClaim(googlePayload, 'email'),
      hostedDomain:
        typeof googlePayload.hd === 'string' && googlePayload.hd.trim().length > 0
          ? googlePayload.hd
          : null,
    } satisfies GoogleIdTokenClaims
  }
}
