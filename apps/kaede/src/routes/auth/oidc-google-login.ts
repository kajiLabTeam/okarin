import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import {
  generateOidcNonce,
  generateOidcState,
  generatePkceCodeVerifier,
  GoogleOidcClient,
} from '../../services/auth/index.js'
import { setGoogleOidcStateCookie } from './oidc-cookie.js'

const loginQuerySchema = z.object({
  client: z.enum(['web', 'mobile']).optional(),
  invite_token: z.string().min(1).optional(),
  redirect_uri: z.url().optional(),
  code_challenge: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  code_challenge_method: z.literal('S256').optional(),
  mobile_state: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
})

const withError = (url: string, errorCode: string) => {
  const redirectUrl = new URL(url, 'http://localhost')
  redirectUrl.searchParams.set('error', errorCode)
  return url.startsWith('/')
    ? `${redirectUrl.pathname}${redirectUrl.search}`
    : redirectUrl.toString()
}

export const registerGoogleOidcLoginRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/oidc/google/login',
    tags: ['Auth'],
    description: 'Google authorization endpoint へ redirect する',
    request: {
      query: loginQuerySchema,
    },
    responses: {
      302: {
        description: 'redirect to Google authorization endpoint',
      },
    },
  })

  app.openapi(route, (c) => {
    const config = getOidcRuntimeConfig()

    if (!config.enabled) {
      return c.redirect(withError(config.loginFailureRedirectUrl, 'oidc_disabled'), 302)
    }

    const query = c.req.valid('query')
    // The app's challenge is independent from the Google-facing PKCE verifier below.
    if (
      query.client === 'mobile' &&
      (query.redirect_uri !== config.mobileRedirectUri ||
        !query.code_challenge ||
        query.code_challenge_method !== 'S256' ||
        !query.mobile_state)
    ) {
      return c.redirect(withError(config.loginFailureRedirectUrl, 'invalid_mobile_request'), 302)
    }
    const state = generateOidcState()
    const nonce = generateOidcNonce()
    const codeVerifier = generatePkceCodeVerifier()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    const client = new GoogleOidcClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    })

    setGoogleOidcStateCookie(
      c,
      {
        state,
        nonce,
        codeVerifier,
        expiresAt: expiresAt.toISOString(),
        intent: 'login',
        client: query.client ?? 'web',
        inviteToken: query.invite_token,
        mobile:
          query.client === 'mobile' && query.code_challenge && query.mobile_state
            ? {
                redirectUri: config.mobileRedirectUri,
                codeChallenge: query.code_challenge,
                state: query.mobile_state,
              }
            : undefined,
      },
      config.stateCookieSecret
    )

    return c.redirect(
      client.createAuthorizationUrl({
        codeVerifier,
        nonce,
        state,
      }),
      302
    )
  })
}
