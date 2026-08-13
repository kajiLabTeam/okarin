import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { rotateSessionToken } from '../../services/auth/index.js'
import { consumeMobileSessionExchangeCode } from '../../services/mobile-session-exchange/index.js'
import { setSessionCookie } from './cookie.js'

const requestSchema = z
  .object({
    mobile_session_exchange_code: z.string().min(1).max(512),
    code_verifier: z.string().min(43).max(128),
  })
  .openapi('MobileSessionExchangeRequest')

export const registerMobileSessionExchangeRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/mobile/session/exchange',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: requestSchema } } } },
    responses: {
      200: {
        description: 'session cookie established',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      400: {
        description: 'invalid mobile session exchange',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')
    const result = await consumeMobileSessionExchangeCode(
      payload.mobile_session_exchange_code,
      payload.code_verifier
    )
    if (!result) {
      return c.json(
        {
          error_code: 'AUTH_MOBILE_SESSION_EXCHANGE_INVALID',
          error_message: 'mobile session exchange is invalid',
        },
        400
      )
    }
    const rotated = await rotateSessionToken(result.session.id)
    if (!rotated) {
      return c.json(
        {
          error_code: 'AUTH_MOBILE_SESSION_EXCHANGE_INVALID',
          error_message: 'mobile session exchange is invalid',
        },
        400
      )
    }
    setSessionCookie(c, rotated.token, rotated.session.expires_at)
    return c.json({ ok: true as const }, 200)
  })
}
