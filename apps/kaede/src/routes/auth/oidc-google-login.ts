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
