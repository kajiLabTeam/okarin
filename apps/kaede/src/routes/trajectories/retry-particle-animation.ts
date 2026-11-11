import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { trajectoryIdParamsSchema } from '../../schemas/trajectories.js'
import { retryParticleAnimation } from '../../usecases/trajectories/retry-particle-animation.js'

export const registerRetryParticleAnimationRoute = (app: OpenAPIHono) => {
  const errorResponse = {
    description: '動画を再生成できない',
    content: { 'application/json': { schema: errorResponseSchema } },
  }
  const route = createRoute({
    method: 'post',
    path: '/{trajectoryId}/particle-animation/retry',
    tags: ['Trajectories'],
    description: '失敗したパーティクルフィルター動画だけを再生成する',
    request: { params: trajectoryIdParamsSchema },
    responses: {
      202: {
        description: '動画再生成受付',
        content: {
          'application/json': {
            schema: z.object({
              trajectory_id: z.uuid(),
              generation_status: z.literal('processing'),
              generation_attempt: z.number().int().nonnegative(),
            }),
          },
        },
      },
      403: errorResponse,
      404: errorResponse,
      409: errorResponse,
      502: errorResponse,
    },
  })
  app.openapi(route, async (c) => {
    const actor = requireRequestActor(c as unknown as RequestActorContext)
    const result = await retryParticleAnimation(actor, c.req.valid('param').trajectoryId)
    if (!result.ok)
      return c.json(
        { error_code: 'VIDEO_RETRY_REJECTED', error_message: result.message },
        result.status
      )
    return c.json(result.value, 202)
  })
}
