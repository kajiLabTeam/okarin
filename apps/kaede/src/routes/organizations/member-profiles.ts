import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  organizationMemberProfileParamsSchema,
  organizationMemberProfileSchema,
  organizationMemberProfileUpdateResponseSchema,
  organizationProfileParamsSchema,
  updateOrganizationMemberProfileRequestSchema,
} from '../../schemas/profiles.js'
import {
  getMyOrganizationMemberProfile,
  updateMyOrganizationMemberProfile,
  updateOrganizationMemberProfile,
} from '../../usecases/profiles/index.js'
import { toProfileErrorResponse } from '../profiles/error.js'

const errorResponses = {
  401: {
    description: 'login required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'permission denied or membership inactive',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'membership not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  409: {
    description: 'membership migration is incomplete',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const

export const registerOrganizationMemberProfileRoutes = (app: OpenAPIHono) => {
  const getMyRoute = createRoute({
    method: 'get',
    path: '/{organizationId}/members/me/profile',
    tags: ['Organization Member Profiles'],
    description: 'Organization共通値、override値、実効Profileを取得する',
    request: { params: organizationProfileParamsSchema },
    responses: {
      200: {
        description: 'organization member profile',
        content: { 'application/json': { schema: organizationMemberProfileSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  })

  app.openapi(getMyRoute, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await getMyOrganizationMemberProfile(
      requireRequestActor(c as RequestActorContext),
      organizationId
    )
    if (!result.ok) {
      const error = toProfileErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const patchMyRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/members/me/profile',
    tags: ['Organization Member Profiles'],
    description: '本人がOrganization内Profileを部分更新する。身長・歩幅の単位はメートル',
    request: {
      params: organizationProfileParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateOrganizationMemberProfileRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'updated organization member profile',
        content: {
          'application/json': { schema: organizationMemberProfileUpdateResponseSchema },
        },
      },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  })

  app.openapi(patchMyRoute, async (c) => {
    const { organizationId } = c.req.valid('param')
    const result = await updateMyOrganizationMemberProfile(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = toProfileErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })

  const patchMemberRoute = createRoute({
    method: 'patch',
    path: '/{organizationId}/members/{membershipId}/profile',
    tags: ['Organization Member Profiles'],
    description: 'manager/ownerが管理対象MembershipのProfileを部分更新する',
    request: {
      params: organizationMemberProfileParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateOrganizationMemberProfileRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'forcibly updated organization member profile',
        content: {
          'application/json': { schema: organizationMemberProfileUpdateResponseSchema },
        },
      },
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  })

  app.openapi(patchMemberRoute, async (c) => {
    const { organizationId, membershipId } = c.req.valid('param')
    const result = await updateOrganizationMemberProfile(
      requireRequestActor(c as RequestActorContext),
      organizationId,
      membershipId,
      c.req.valid('json')
    )
    if (!result.ok) {
      const error = toProfileErrorResponse(result.error)
      return c.json(error.body, error.status)
    }
    return c.json(result.value, 200)
  })
}
