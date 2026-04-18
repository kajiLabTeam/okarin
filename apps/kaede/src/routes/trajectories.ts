import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import { notImplementedResponseSchema } from '../schemas/common.js'
import {
  callbackRequestSchema,
  callbackResponseSchema,
  trajectoryIdParamsSchema,
  trajectoryStatusResponseSchema,
} from '../schemas/trajectories.js'
import { notImplemented } from '../utils/not-implemented.js'

export const trajectoriesRoutes = new OpenAPIHono()

const callbackRoute = createRoute({
  method: 'post',
  path: '/callback',
  request: {
    body: {
      content: {
        'application/json': {
          schema: callbackRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'callback accepted',
      content: {
        'application/json': {
          schema: callbackResponseSchema,
        },
      },
    },
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(callbackRoute, (c) => {
  c.req.valid('json')

  return notImplemented(c, 'POST /api/trajectories/callback', '解析 callback を反映する')
})

const getTrajectoryRoute = createRoute({
  method: 'get',
  path: '/{trajectoryId}',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    200: {
      description: 'trajectory status',
      content: {
        'application/json': {
          schema: trajectoryStatusResponseSchema,
        },
      },
    },
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(getTrajectoryRoute, (c) => {
  c.req.valid('param')

  return notImplemented(c, 'GET /api/trajectories/:trajectoryId', 'trajectory 状態を取得する')
})

const getTrajectoryResultRoute = createRoute({
  method: 'get',
  path: '/{trajectoryId}/result',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(getTrajectoryResultRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'GET /api/trajectories/:trajectoryId/result',
    'trajectory の解析結果を取得する'
  )
})

const getTrajectoryMapDataRoute = createRoute({
  method: 'get',
  path: '/{trajectoryId}/map-data',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(getTrajectoryMapDataRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'GET /api/trajectories/:trajectoryId/map-data',
    'trajectory の map data を取得する'
  )
})

const batchTrajectoryMapDataRoute = createRoute({
  method: 'post',
  path: '/map-data:batch',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            trajectory_ids: z.array(z.string().uuid()).min(1),
          }),
        },
      },
    },
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(batchTrajectoryMapDataRoute, (c) => {
  c.req.valid('json')

  return notImplemented(
    c,
    'POST /api/trajectories/map-data:batch',
    '複数 trajectory の map data を取得する'
  )
})

const retryTrajectoryRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/retry',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(retryTrajectoryRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/retry',
    '同じ constraint で再解析する'
  )
})

const cloneAndReanalyzeRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/clone-and-reanalyze',
  request: {
    params: trajectoryIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            constraints: z.array(z.unknown()).min(1),
          }),
        },
      },
    },
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(cloneAndReanalyzeRoute, (c) => {
  c.req.valid('param')
  c.req.valid('json')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/clone-and-reanalyze',
    'constraint を変えて再解析する'
  )
})

const issueManualResultUploadUrlRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/manual-result/upload-url',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(issueManualResultUploadUrlRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/manual-result/upload-url',
    '手動生成結果の upload URL を発行する'
  )
})

const completeManualResultUploadRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/manual-result/complete',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(completeManualResultUploadRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/manual-result/complete',
    '手動生成結果の登録完了を反映する'
  )
})

const issueGroundTruthUploadUrlRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/ground-truth/upload-url',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(issueGroundTruthUploadUrlRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/ground-truth/upload-url',
    'trajectory 単位 ground truth の upload URL を発行する'
  )
})

const completeGroundTruthUploadRoute = createRoute({
  method: 'post',
  path: '/{trajectoryId}/ground-truth/complete',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(completeGroundTruthUploadRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/trajectories/:trajectoryId/ground-truth/complete',
    'trajectory 単位 ground truth の登録完了を反映する'
  )
})

const deleteTrajectoryRoute = createRoute({
  method: 'delete',
  path: '/{trajectoryId}',
  request: {
    params: trajectoryIdParamsSchema,
  },
  responses: {
    501: {
      description: 'not implemented',
      content: {
        'application/json': {
          schema: notImplementedResponseSchema,
        },
      },
    },
  },
})

trajectoriesRoutes.openapi(deleteTrajectoryRoute, (c) => {
  c.req.valid('param')

  return notImplemented(c, 'DELETE /api/trajectories/:trajectoryId', 'trajectory を削除する')
})
