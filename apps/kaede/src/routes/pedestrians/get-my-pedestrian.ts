import { createRoute } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { pedestrianSchema } from '../../schemas/pedestrians.js'
import { getMyPedestrian } from '../../usecases/get-my-pedestrian.js'
import type { GetMyPedestrianResult } from '../../usecases/get-my-pedestrian.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

type GetMyPedestrianError = Extract<GetMyPedestrianResult, { ok: false }>['error']

const toGetMyPedestrianErrorResponse = (error: GetMyPedestrianError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'PEDESTRIAN_NOT_FOUND':
      return {
        body: {
          error_code: error.type,
          error_message: 'pedestrian not found',
        },
        status: 404 as const,
      }
  }
}

export const registerGetMyPedestrianRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
  const route = createRoute({
    method: 'get',
    path: '/me',
    tags: ['Pedestrians'],
    description: 'ログイン user に紐づく pedestrian を返す',
    responses: {
      200: {
        description: 'linked pedestrian',
        content: {
          'application/json': {
            schema: pedestrianSchema,
          },
        },
      },
      403: {
        description: 'permission denied',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'pedestrian not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c)
    const result = await getMyPedestrian(actor)

    if (!result.ok) {
      const error = toGetMyPedestrianErrorResponse(result.error)
      return c.json(error.body, error.status)
    }

    return c.json(result.value, 200)
  })
}
