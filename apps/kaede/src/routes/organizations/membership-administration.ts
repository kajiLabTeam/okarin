import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  managedMembershipSchema,
  membershipAdministrationParamsSchema,
  updateMembershipRequestSchema,
} from '../../schemas/membership-administration.js'
import { updateOrganizationMembership } from '../../usecases/membership-administration/index.js'

const errorResponse = (type: string) => {
  if (type === 'MEMBERSHIP_NOT_FOUND') {
    return {
      status: 404 as const,
      body: { error_code: type, error_message: 'membership not found' },
    }
  }
  if (type === 'MEMBERSHIP_LAST_OWNER' || type === 'MEMBERSHIP_LEFT') {
    return {
      status: 409 as const,
      body: { error_code: type, error_message: 'membership conflict' },
    }
  }
  return { status: 403 as const, body: { error_code: type, error_message: 'operation forbidden' } }
}

export const registerMembershipAdministrationRoutes = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'patch',
    path: '/{organizationId}/members/{membershipId}',
    tags: ['Organizations'],
    description: 'Membershipのrole/statusを変更する。left Membershipは再利用しない',
    request: {
      params: membershipAdministrationParamsSchema,
      body: { content: { 'application/json': { schema: updateMembershipRequestSchema } } },
    },
    responses: {
      200: {
        description: 'membership updated',
        content: { 'application/json': { schema: managedMembershipSchema } },
      },
      403: {
        description: 'operation forbidden',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'membership not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'membership lifecycle conflict',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const result = await updateOrganizationMembership(
      requireRequestActor(c as RequestActorContext),
      params.organizationId,
      params.membershipId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = errorResponse(result.error.type)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
