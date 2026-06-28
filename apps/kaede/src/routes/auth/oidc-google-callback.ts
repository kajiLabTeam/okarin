import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getOidcRuntimeConfig } from '../../config/runtime.js'
import { GoogleOidcClient } from '../../services/auth/index.js'
import { completeGoogleOidcLink, completeGoogleOidcLogin } from '../../usecases/auth/index.js'
import { getSessionTokenFromCookie, setSessionCookie } from './cookie.js'
import { clearGoogleOidcStateCookie, getGoogleOidcStateCookie } from './oidc-cookie.js'

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
})

const withError = (url: string, errorCode: string) => {
  const redirectUrl = new URL(url, 'http://localhost')
  redirectUrl.searchParams.set('error', errorCode)
  return url.startsWith('/')
    ? `${redirectUrl.pathname}${redirectUrl.search}`
    : redirectUrl.toString()
}

export const registerGoogleOidcCallbackRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'get',
    path: '/oidc/google/callback',
    tags: ['Auth'],
    description: 'Google OIDC callback を処理し session cookie を発行する',
    request: {
      query: callbackQuerySchema,
    },
    responses: {
      302: {
        description: 'redirect after OIDC callback',
      },
    },
  })

  app.openapi(route, async (c) => {
    const config = getOidcRuntimeConfig()
    const query = c.req.valid('query')
    const failureRedirectUrl = config.loginFailureRedirectUrl

    clearGoogleOidcStateCookie(c)

    if (!config.enabled || query.error) {
      return c.redirect(withError(failureRedirectUrl, query.error ?? 'oidc_disabled'), 302)
    }

    const stateCookie = getGoogleOidcStateCookie(c, config.stateCookieSecret)

    if (!stateCookie) {
      return c.redirect(withError(failureRedirectUrl, 'invalid_state'), 302)
    }

    const client = new GoogleOidcClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    })
    const params = {
      code: query.code,
      state: query.state,
      expectedState: stateCookie.state,
      nonce: stateCookie.nonce,
      codeVerifier: stateCookie.codeVerifier,
    }

    if (stateCookie.intent === 'link') {
      const result = await completeGoogleOidcLink(getSessionTokenFromCookie(c), params, client)

      if (!result.ok) {
        return c.redirect(withError(failureRedirectUrl, result.error.type.toLowerCase()), 302)
      }

      return c.redirect(config.loginSuccessRedirectUrl, 302)
    }

    const result = await completeGoogleOidcLogin(
      {
        code: params.code,
        state: params.state,
        expectedState: params.expectedState,
        nonce: params.nonce,
        codeVerifier: params.codeVerifier,
        allowUserCreation: stateCookie.client !== 'mobile',
      },
      client
    )

    if (!result.ok) {
      return c.redirect(withError(failureRedirectUrl, result.error.type.toLowerCase()), 302)
    }

    setSessionCookie(c, result.value.sessionToken)

    return c.redirect(config.loginSuccessRedirectUrl, 302)
  })
}
