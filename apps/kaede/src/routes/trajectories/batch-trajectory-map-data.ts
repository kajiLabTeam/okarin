import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import {
  batchTrajectoryMapDataRequestSchema,
  batchTrajectoryMapDataResponseSchema,
} from '../../schemas/trajectories.js'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorContext } from '../../middleware/request-actor-context.js'
import { getTrajectoryMapData } from '../../usecases/trajectories/get-trajectory-map-data.js'
import { toGetTrajectoryMapDataErrorResponse } from './error.js'

export const registerBatchTrajectoryMapDataRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/map-data:batch',
    tags: ['Trajectories'],
    description: '複数の trajectory ID を指定して map data をまとめて取得する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: batchTrajectoryMapDataRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: '複数 trajectory 地図表示用データ',
        content: {
          'application/json': {
            schema: batchTrajectoryMapDataResponseSchema,
          },
        },
      },
      400: {
        description: 'request is invalid',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      403: {
        description: 'permission denied',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'trajectory が存在しない',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      409: {
        description: 'trajectory の現在状態では map data を取得できない',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      422: {
        description: '解析結果CSVが不正',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  app.openapi(route, async (c) => {
    const request = c.req.valid('json')
    const actor = requireRequestActor(c as unknown as RequestActorContext)
    const results = await Promise.all(
      request.trajectory_ids.map((trajectoryId) =>
        getTrajectoryMapData(actor, { trajectoryId }, { data_type: request.data_type })
      )
    )
    const failed = results.find((result) => !result.ok)
    if (failed && !failed.ok) {
      const error = toGetTrajectoryMapDataErrorResponse(failed.error)
      return c.json(error.body, error.status)
    }
    const values = results.flatMap((result) => (result.ok ? [result.value] : []))
    const floorIds = new Set(values.map((value) => value.floor_id))
    if (floorIds.size !== 1) {
      return c.json(
        {
          error_code: 'TRAJECTORY_FLOOR_MISMATCH',
          error_message: 'trajectories must belong to the same floor',
        },
        400
      )
    }
    return c.json(
      {
        floor_id: values[0]?.floor_id ?? '',
        trajectories: values.map(({ trajectory_id, data_type, points }) => ({
          trajectory_id,
          data_type,
          points,
        })),
      },
      200
    )
  })
}
