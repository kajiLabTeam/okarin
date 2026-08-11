import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  acceptLocalOrganizationInviteRequestSchema,
  acceptLocalOrganizationInviteResponseSchema,
  verifyOrganizationInviteRequestSchema,
  verifyOrganizationInviteResponseSchema,
} from '../../schemas/organization-invites.js'
import {
  acceptOrganizationInviteWithLocalCredential,
  verifyOrganizationInvite,
} from '../../usecases/organization-invites/index.js'
import { getSessionTokenFromCookie, setSessionCookie } from '../auth/cookie.js'
import { toOrganizationInviteErrorResponse } from './error.js'

const errors = {
  400: {
    description: 'invalid registration payload',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  401: {
    description: 'invalid session',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'authentication method or membership is not allowed',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'invite not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  409: {
    description: 'invite conflicts with current state',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  422: {
    description: 'invite expired',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const

export const registerPublicOrganizationInviteRoutes = (app: OpenAPIHono) => {
  const verifyRoute = createRoute({
    method: 'post',
    path: '/verify',
    tags: ['Organization Invites'],
    request: {
      body: { content: { 'application/json': { schema: verifyOrganizationInviteRequestSchema } } },
    },
    responses: {
      200: {
        description: 'invite is available',
        content: { 'application/json': { schema: verifyOrganizationInviteResponseSchema } },
      },
      404: errors[404],
      409: errors[409],
      422: errors[422],
    },
  })
  app.openapi(verifyRoute, async (c) => {
    const result = await verifyOrganizationInvite(c.req.valid('json').token)
    if (!result.ok) {
      switch (result.error.type) {
        case 'INVITE_INVALID':
          return c.json(
            { error_code: result.error.type, error_message: 'invite is not available' },
            404
          )
        case 'INVITE_ALREADY_REDEEMED':
          return c.json(
            { error_code: result.error.type, error_message: 'invite was already redeemed' },
            409
          )
        case 'INVITE_EXPIRED':
          return c.json({ error_code: result.error.type, error_message: 'invite expired' }, 422)
      }
    }
    c.header('Cache-Control', 'no-store')
    return c.json(result.value, 200)
  })

  const localRoute = createRoute({
    method: 'post',
    path: '/auth/local',
    tags: ['Organization Invites'],
    request: {
      body: {
        content: { 'application/json': { schema: acceptLocalOrganizationInviteRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'invite accepted',
        content: { 'application/json': { schema: acceptLocalOrganizationInviteResponseSchema } },
      },
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: errors[404],
      409: errors[409],
      422: errors[422],
    },
  })
  app.openapi(localRoute, async (c) => {
    const result = await acceptOrganizationInviteWithLocalCredential(
      getSessionTokenFromCookie(c),
      c.req.valid('json'),
      { requestId: c.req.header('x-request-id'), userAgent: c.req.header('user-agent') }
    )
    if (!result.ok) {
      const error = toOrganizationInviteErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    if (result.value.sessionToken) setSessionCookie(c, result.value.sessionToken)
    c.header('Cache-Control', 'no-store')
    return c.json(
      {
        session: result.value.session,
        membership: result.value.membership,
        grant: result.value.grant,
      },
      200
    )
  })
}
