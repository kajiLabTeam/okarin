import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import {
  generateOidcNonce,
  generateOidcState,
  generatePkceCodeVerifier,
  GoogleOidcClient,
} from '../../services/auth/index.js'
import { requireActiveSessionUser } from '../../usecases/auth/index.js'
import { getSessionTokenFromCookie } from './cookie.js'
import { setGoogleOidcStateCookie } from './oidc-cookie.js'

const withError = (url: string, errorCode: string) => {
  const redirectUrl = new URL(url, 'http://localhost')
  redirectUrl.searchParams.set('error', errorCode)
  return url.startsWith('/')
    ? `${redirectUrl.pathname}${redirectUrl.search}`
    : redirectUrl.toString()
}

export const registerGoogleOidcLinkRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/oidc/google/link',
    tags: ['Auth'],
    description: 'ログイン中 user の Google identity 連携を開始する',
    responses: {
      302: {
        description: 'redirect to Google authorization endpoint',
      },
    },
  })

  app.openapi(route, async (c) => {
    const config = getOidcRuntimeConfig()

    if (!config.enabled) {
      return c.redirect(withError(config.loginFailureRedirectUrl, 'oidc_disabled'), 302)
    }

    const activeUser = await requireActiveSessionUser(getSessionTokenFromCookie(c))

    if (!activeUser.ok) {
      return c.redirect(
        withError(config.loginFailureRedirectUrl, activeUser.error.type.toLowerCase()),
        302
      )
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
        intent: 'link',
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
