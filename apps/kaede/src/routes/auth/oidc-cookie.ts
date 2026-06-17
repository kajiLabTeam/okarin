import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAppRuntimeConfig } from '../../config/runtime.js'

export const googleOidcStateCookieName = 'okarin_oidc_google'

export interface GoogleOidcStateCookiePayload {
  state: string
  nonce: string
  codeVerifier: string
  expiresAt: string
  inviteToken?: string
}

const cookiePath = '/api/auth/oidc/google'
const maxAgeSeconds = 10 * 60

const sign = (value: string, secret: string) => {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

const encodePayload = (payload: GoogleOidcStateCookiePayload) => {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

const decodePayload = (value: string): GoogleOidcStateCookiePayload => {
  return JSON.parse(
    Buffer.from(value, 'base64url').toString('utf8')
  ) as GoogleOidcStateCookiePayload
}

const isEqualSignature = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export const serializeGoogleOidcStateCookie = (
  payload: GoogleOidcStateCookiePayload,
  secret: string
) => {
  const encodedPayload = encodePayload(payload)
  return `${encodedPayload}.${sign(encodedPayload, secret)}`
}

export const parseGoogleOidcStateCookie = (
  value: string,
  secret: string,
  now: Date = new Date()
): GoogleOidcStateCookiePayload | undefined => {
  const [encodedPayload, signature] = value.split('.')

  if (!encodedPayload || !signature || !isEqualSignature(signature, sign(encodedPayload, secret))) {
    return undefined
  }

  const payload = decodePayload(encodedPayload)

  if (new Date(payload.expiresAt) <= now) {
    return undefined
  }

  return payload
}

export const getGoogleOidcStateCookie = (
  c: Context,
  secret: string,
  now: Date = new Date()
): GoogleOidcStateCookiePayload | undefined => {
  const value = getCookie(c, googleOidcStateCookieName)

  if (!value) {
    return undefined
  }

  return parseGoogleOidcStateCookie(value, secret, now)
}

export const setGoogleOidcStateCookie = (
  c: Context,
  payload: GoogleOidcStateCookiePayload,
  secret: string
) => {
  const runtimeConfig = getAppRuntimeConfig()

  setCookie(c, googleOidcStateCookieName, serializeGoogleOidcStateCookie(payload, secret), {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: cookiePath,
    sameSite: 'Lax',
    secure: runtimeConfig.env !== 'local',
  })
}

export const clearGoogleOidcStateCookie = (c: Context) => {
  deleteCookie(c, googleOidcStateCookieName, {
    path: cookiePath,
  })
}
