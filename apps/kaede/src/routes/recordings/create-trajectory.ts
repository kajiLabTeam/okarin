import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema } from '../../schemas/common.js'
import { recordingIdParamsSchema } from '../../schemas/recordings.js'
import {
  createTrajectoryRequestSchema,
  createTrajectoryResponseSchema,
} from '../../schemas/trajectories.js'
import { createTrajectory } from '../../usecases/create-trajectory.js'

export const registerCreateTrajectoryRoute = (app: OpenAPIHono) => {
  const route = createRoute({
    method: 'post',
    path: '/{recordingId}/trajectories',
    tags: ['Recordings'],
    description: 'recording から trajectory を作成し、解析を開始する',
    request: {
      params: recordingIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: createTrajectoryRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'trajectory created',
        content: {
          'application/json': {
            schema: createTrajectoryResponseSchema,
          },
        },
      },
      404: {
        description: 'recording が存在しない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      409: {
        description: 'recording の現在状態では trajectory を作成できない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      400: {
        description: 'constraints などの request 内容が不正',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      500: {
        description: 'recording の内部データ不整合により trajectory を作成できない',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      502: {
        description: '解析サーバーへの依頼に失敗した',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const params = c.req.valid('param')
    const body = c.req.valid('json')
    const result = await createTrajectory(params, body)

    if (!result.ok && result.error.type === 'RECORDING_NOT_FOUND') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'recording not found',
          details: {
            recording_id: result.error.recordingId,
          },
        },
        404
      )
    }

    if (!result.ok && result.error.type === 'RECORDING_NOT_READY') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'recording is not ready for trajectory creation',
          details: {
            recording_id: result.error.recordingId,
            upload_status: result.error.uploadStatus,
          },
        },
        409
      )
    }

    if (!result.ok && result.error.type === 'RECORDING_UPLOAD_TARGETS_INVALID') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'recording upload_targets contains invalid values',
          details: {
            recording_id: result.error.recordingId,
            invalid_targets: result.error.invalidTargets,
          },
        },
        500
      )
    }

    if (!result.ok && result.error.type === 'NOZOMI_REQUEST_FAILED') {
      return c.json(
        {
          error_code: result.error.type,
          error_message: 'failed to submit analyze request to nozomi',
          details: {
            recording_id: result.error.recordingId,
            trajectory_id: result.error.trajectoryId,
          },
        },
        502
      )
    }

    if (!result.ok) {
      throw new Error('unreachable create-trajectory result')
    }

    return c.json(result.value, 201)
  })
}
