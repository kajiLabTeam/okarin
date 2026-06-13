import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { requireRequestActor } from '../../middleware/request-actor-context.js'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { errorResponseSchema } from '../../schemas/common.js'
import { recordingIdParamsSchema } from '../../schemas/recordings.js'
import {
  createTrajectoryRequestSchema,
  createTrajectoryResponseSchema,
} from '../../schemas/trajectories.js'
import { createTrajectory } from '../../usecases/create-trajectory.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

export const registerCreateTrajectoryRoute = (app: OpenAPIHono<RequestActorHonoEnv>) => {
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
      400: {
        description: 'constraints などの request 内容が不正',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'recording または floor が存在しない',
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
      403: {
        description: 'permission denied',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      500: {
        description:
          'recording の内部データ不整合または解析依頼準備失敗により trajectory を作成できない',
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
    const actor = requireRequestActor(c)
    const result = await createTrajectory(actor, params, body)

    if (!result.ok) {
      switch (result.error.type) {
        case 'AUTH_DASHBOARD_FORBIDDEN':
        case 'AUTH_ORGANIZATION_FORBIDDEN': {
          const error = toAuthorizationErrorResponse(result.error)
          return c.json(error.body, error.status)
        }

        case 'RECORDING_NOT_FOUND':
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

        case 'RECORDING_NOT_READY':
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

        case 'RECORDING_UPLOAD_TARGETS_INVALID':
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

        case 'FLOOR_NOT_FOUND':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'recording floor not found',
              details: {
                recording_id: result.error.recordingId,
                floor_id: result.error.floorId,
              },
            },
            404
          )

        case 'RESOURCE_ORGANIZATION_MISMATCH':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'recording and floor belong to different organizations',
              details: {
                recording_id: result.error.recordingId,
                recording_organization_id: result.error.recordingOrganizationId,
                floor_id: result.error.floorId,
                floor_organization_id: result.error.floorOrganizationId,
              },
            },
            409
          )

        case 'TRAJECTORY_ANALYZE_PREPARATION_FAILED':
          return c.json(
            {
              error_code: result.error.type,
              error_message: 'failed to prepare analyze request',
              details: {
                recording_id: result.error.recordingId,
                trajectory_id: result.error.trajectoryId,
              },
            },
            500
          )

        case 'NOZOMI_REQUEST_FAILED':
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

        default: {
          const exhaustiveCheck: never = result.error
          throw new Error(`unhandled create-trajectory error: ${JSON.stringify(exhaustiveCheck)}`)
        }
      }
    }

    return c.json(result.value, 201)
  })
}
