import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { getAppRuntimeConfig, getOidcRuntimeConfig } from '../../config/runtime.js'
import { GoogleOidcClient } from '../../services/auth/index.js'
import { completeGoogleOidcLink, completeGoogleOidcLogin } from '../../usecases/auth/index.js'
import { acceptOrganizationInviteWithOidc } from '../../usecases/organization-invites/index.js'
import {
  completeOrganizationOidc,
  isOrganizationOidcTransactionState,
} from '../../usecases/organization-oidc-auth/index.js'
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

const organizationCompletionUrl = (
  result: 'success' | 'error',
  returnTo: string,
  errorCode?: string
) => {
  const frontendOrigin = getAppRuntimeConfig().frontendOrigin
  const url = new URL('/auth/complete', frontendOrigin ?? 'http://localhost')
  url.searchParams.set('result', result)
  url.searchParams.set('return_to', returnTo)
  if (errorCode) url.searchParams.set('code', errorCode)

  return frontendOrigin ? url.toString() : `${url.pathname}${url.search}`
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
    if (!config.enabled) {
      clearGoogleOidcStateCookie(c)
      return c.redirect(withError(failureRedirectUrl, query.error ?? 'oidc_disabled'), 302)
    }

    const organizationTransaction = query.state
      ? await isOrganizationOidcTransactionState(query.state)
      : false
    const client = new GoogleOidcClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    })
    if (organizationTransaction) {
      const result = await completeOrganizationOidc(
        query.error ? undefined : query.code,
        query.state,
        {
          client,
          configuredClientId: config.googleClientId,
          transactionSecret: config.stateCookieSecret,
          sessionToken: getSessionTokenFromCookie(c),
          completeInvite: acceptOrganizationInviteWithOidc,
        }
      )
      if (!result.ok) {
        return c.redirect(
          organizationCompletionUrl('error', result.return_to ?? '/', result.error.type),
          302
        )
      }
      if (result.value.mobileSessionExchangeCode && result.value.mobileRedirectUri) {
        const mobileRedirect = new URL(result.value.mobileRedirectUri)
        mobileRedirect.searchParams.set(
          'mobile_session_exchange_code',
          result.value.mobileSessionExchangeCode
        )
        return c.redirect(mobileRedirect.toString(), 302)
      }
      if (result.value.sessionToken) setSessionCookie(c, result.value.sessionToken)

      return c.redirect(organizationCompletionUrl('success', result.value.return_to), 302)
    }

    clearGoogleOidcStateCookie(c)
    const stateCookie = getGoogleOidcStateCookie(c, config.stateCookieSecret)

    if (!stateCookie) {
      return c.redirect(withError(failureRedirectUrl, 'invalid_state'), 302)
    }

    const mobile =
      stateCookie.intent === 'login' &&
      stateCookie.client === 'mobile' &&
      stateCookie.mobile?.redirectUri === config.mobileRedirectUri
        ? stateCookie.mobile
        : undefined
    const fail = (code: string) => {
      if (!mobile) return withError(failureRedirectUrl, code)
      const url = new URL(mobile.redirectUri)
      url.searchParams.set('mobile_state', mobile.state)
      url.searchParams.set('error', code)
      return url.toString()
    }
    // Do not trust provider errors or return app state until the OAuth state matches.
    if (!query.state || query.state !== stateCookie.state) {
      return c.redirect(withError(failureRedirectUrl, 'invalid_state'), 302)
    }
    if (query.error) return c.redirect(fail(mobile ? 'oidc_provider_error' : query.error), 302)
    if (stateCookie.client === 'mobile' && !mobile) {
      return c.redirect(withError(failureRedirectUrl, 'invalid_mobile_request'), 302)
    }

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
        return c.redirect(fail(result.error.type.toLowerCase()), 302)
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
      return c.redirect(fail(result.error.type.toLowerCase()), 302)
    }

    if (mobile) {
      const { issueGoogleMobileSessionExchangeCode } =
        await import('../../services/mobile-session-exchange/index.js')
      let code: string
      try {
        code = await issueGoogleMobileSessionExchangeCode(
          result.value.sessionToken,
          mobile.codeChallenge
        )
      } catch {
        return c.redirect(fail('mobile_session_exchange_failed'), 302)
      }
      const url = new URL(mobile.redirectUri)
      url.searchParams.set('mobile_state', mobile.state)
      url.searchParams.set('mobile_session_exchange_code', code)
      return c.redirect(url.toString(), 302)
    }
    setSessionCookie(c, result.value.sessionToken)

    return c.redirect(config.loginSuccessRedirectUrl, 302)
  })
}
