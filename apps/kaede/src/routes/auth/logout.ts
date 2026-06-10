import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { authOkResponseSchema } from '../../schemas/auth.js'
import { logout } from '../../usecases/auth.js'
import { clearSessionCookie, getSessionTokenFromCookie } from './cookie.js'

export const registerLogoutRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/logout',
    tags: ['Auth'],
    description: '現在の session を revoke し session cookie を削除する',
    responses: {
      200: {
        description: 'logout succeeded',
        content: {
          'application/json': {
            schema: authOkResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    await logout(getSessionTokenFromCookie(c))
    clearSessionCookie(c)

    return c.json({ ok: true }, 200)
  })
}
