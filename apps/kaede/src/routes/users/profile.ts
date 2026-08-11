import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { updateUserProfileRequestSchema, userProfileSchema } from '../../schemas/profiles.js'
import { getMyUserProfile, updateMyUserProfile } from '../../usecases/profiles/index.js'
import { toProfileErrorResponse } from '../profiles/error.js'

export const registerUserProfileRoutes = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const getRoute = createRoute({
    method: 'get',
    path: '/me/profile',
    tags: ['Users'],
    description: 'ログインUserのOrganization共通Profileを取得する',
    responses: {
      200: {
        description: 'user profile',
        content: { 'application/json': { schema: userProfileSchema } },
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
        description: 'user not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(getRoute, async (c) => {
    const result = await getMyUserProfile(requireRequestActor(c))
    if (!result.ok) {
      const error = toProfileErrorResponse(result.error)
      return c.json(error.body, error.status as 403 | 404)
    }
    return c.json(result.value, 200)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/me/profile',
    tags: ['Users'],
    description: 'ログインUserのOrganization共通Profileを部分更新する',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: updateUserProfileRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'updated user profile',
        content: { 'application/json': { schema: userProfileSchema } },
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
        description: 'user not found',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(patchRoute, async (c) => {
    const result = await updateMyUserProfile(requireRequestActor(c), c.req.valid('json'))
    if (!result.ok) {
      const error = toProfileErrorResponse(result.error)
      return c.json(error.body, error.status as 403 | 404)
    }
    return c.json(result.value, 200)
  })
}
