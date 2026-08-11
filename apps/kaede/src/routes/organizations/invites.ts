import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  createOrganizationInviteRequestSchema,
  organizationInviteParamsSchema,
  organizationInvitesParamsSchema,
  organizationInvitesResponseSchema,
  organizationInviteTokenResponseSchema,
} from '../../schemas/organization-invites.js'
import {
  getOrganizationInvites,
  issueOrganizationInvite,
  reissueInvite,
  revokeInvite,
} from '../../usecases/organization-invites/index.js'
import { toOrganizationInviteErrorResponse } from '../organization-invites/error.js'

const errorResponses = {
  400: {
    description: 'invalid request',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  401: {
    description: 'login required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'permission denied',
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
} as const

/* OpenAPIHono keeps each handler's status union at the call site; this shared mapper intentionally erases it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const respondError = (c: any, error: Parameters<typeof toOrganizationInviteErrorResponse>[0]) => {
  const response = toOrganizationInviteErrorResponse(error)
  return c.json(response.body, response.status)
}

export const registerOrganizationInviteRoutes = (app: OpenAPIHono) => {
  const listRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/invites',
    tags: ['Organization Invites'],
    request: { params: organizationInvitesParamsSchema },
    responses: {
      200: {
        description: 'invites',
        content: { 'application/json': { schema: organizationInvitesResponseSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  })
  app.openapi(listRoute, async (c) => {
    const result = await getOrganizationInvites(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId
    )
    return result.ok ? c.json(result.value, 200) : respondError(c, result.error)
  })

  const issueRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/invites',
    tags: ['Organization Invites'],
    request: {
      params: organizationInvitesParamsSchema,
      body: { content: { 'application/json': { schema: createOrganizationInviteRequestSchema } } },
    },
    responses: {
      201: {
        description: 'plain token is returned once',
        content: { 'application/json': { schema: organizationInviteTokenResponseSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  })
  app.openapi(issueRoute, async (c) => {
    const result = await issueOrganizationInvite(
      requireRequestActor(c as RequestActorContext),
      c.req.valid('param').organizationId,
      c.req.valid('json')
    )
    if (!result.ok) return respondError(c, result.error)
    c.header('Cache-Control', 'no-store')
    return c.json(result.value, 201)
  })

  const revokeRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/invites/{inviteId}/revoke',
    tags: ['Organization Invites'],
    request: { params: organizationInviteParamsSchema },
    responses: {
      200: {
        description: 'revoked',
        content: { 'application/json': { schema: z.object({ revoked: z.literal(true) }) } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  })
  app.openapi(revokeRoute, async (c) => {
    const p = c.req.valid('param')
    const result = await revokeInvite(
      requireRequestActor(c as RequestActorContext),
      p.organizationId,
      p.inviteId
    )
    return result.ok ? c.json(result.value, 200) : respondError(c, result.error)
  })

  const reissueRoute = createRoute({
    method: 'post',
    path: '/{organizationId}/invites/{inviteId}/reissue',
    tags: ['Organization Invites'],
    request: { params: organizationInviteParamsSchema },
    responses: {
      201: {
        description: 'old invite revoked and new plain token returned once',
        content: { 'application/json': { schema: organizationInviteTokenResponseSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  })
  app.openapi(reissueRoute, async (c) => {
    const p = c.req.valid('param')
    const result = await reissueInvite(
      requireRequestActor(c as RequestActorContext),
      p.organizationId,
      p.inviteId
    )
    if (!result.ok) return respondError(c, result.error)
    c.header('Cache-Control', 'no-store')
    return c.json(result.value, 201)
  })
}
