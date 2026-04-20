import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { notImplementedResponseSchema } from '../schemas/common.js'
import {
  completeUploadResponseSchema,
  initRecordingRequestSchema,
  initRecordingResponseSchema,
  recordingDetailResponseSchema,
  recordingIdParamsSchema,
  recordingTrajectoriesResponseSchema,
  refreshUploadUrlsRequestSchema,
  refreshUploadUrlsResponseSchema,
} from '../schemas/recordings.js'
import {
  createTrajectoryRequestSchema,
  createTrajectoryResponseSchema,
} from '../schemas/trajectories.js'
import { notImplemented } from '../utils/not-implemented.js'

export const recordingsRoutes = new OpenAPIHono()

const initRecordingRoute = createRoute({
  method: 'post',
  path: '/init',
  request: {
    body: {
      content: {
        'application/json': {
          schema: initRecordingRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'recording created',
      content: {
        'application/json': {
          schema: initRecordingResponseSchema,
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

recordingsRoutes.openapi(initRecordingRoute, (c) => {
  c.req.valid('json')

  return notImplemented(c, 'POST /api/recordings/init', 'recording を作成する')
})

const completeUploadRoute = createRoute({
  method: 'post',
  path: '/{recordingId}/complete-upload',
  request: {
    params: recordingIdParamsSchema,
  },
  responses: {
    200: {
      description: 'upload confirmed',
      content: {
        'application/json': {
          schema: completeUploadResponseSchema,
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

recordingsRoutes.openapi(completeUploadRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/recordings/:recordingId/complete-upload',
    'recording の raw upload 完了を反映する'
  )
})

const refreshUploadUrlsRoute = createRoute({
  method: 'post',
  path: '/{recordingId}/refresh-upload-urls',
  request: {
    params: recordingIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: refreshUploadUrlsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'upload urls refreshed',
      content: {
        'application/json': {
          schema: refreshUploadUrlsResponseSchema,
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

recordingsRoutes.openapi(refreshUploadUrlsRoute, (c) => {
  c.req.valid('param')
  c.req.valid('json')

  return notImplemented(
    c,
    'POST /api/recordings/:recordingId/refresh-upload-urls',
    'recording の upload URL を再発行する'
  )
})

const createTrajectoryRoute = createRoute({
  method: 'post',
  path: '/{recordingId}/trajectories',
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

recordingsRoutes.openapi(createTrajectoryRoute, (c) => {
  c.req.valid('param')
  c.req.valid('json')

  return notImplemented(
    c,
    'POST /api/recordings/:recordingId/trajectories',
    'trajectory を作成して解析を開始する'
  )
})

const getRecordingRoute = createRoute({
  method: 'get',
  path: '/{recordingId}',
  request: {
    params: recordingIdParamsSchema,
  },
  responses: {
    200: {
      description: 'recording detail',
      content: {
        'application/json': {
          schema: recordingDetailResponseSchema,
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

recordingsRoutes.openapi(getRecordingRoute, (c) => {
  c.req.valid('param')

  return notImplemented(c, 'GET /api/recordings/:recordingId', 'recording 詳細を取得する')
})

const listRecordingTrajectoriesRoute = createRoute({
  method: 'get',
  path: '/{recordingId}/trajectories',
  request: {
    params: recordingIdParamsSchema,
  },
  responses: {
    200: {
      description: 'recording trajectories',
      content: {
        'application/json': {
          schema: recordingTrajectoriesResponseSchema,
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

recordingsRoutes.openapi(listRecordingTrajectoriesRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'GET /api/recordings/:recordingId/trajectories',
    'recording 配下の trajectory 一覧を取得する'
  )
})

const issueGroundTruthUploadUrlRoute = createRoute({
  method: 'post',
  path: '/{recordingId}/ground-truth/upload-url',
  request: {
    params: recordingIdParamsSchema,
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

recordingsRoutes.openapi(issueGroundTruthUploadUrlRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/recordings/:recordingId/ground-truth/upload-url',
    'ground truth raw の upload URL を発行する'
  )
})

const completeGroundTruthUploadRoute = createRoute({
  method: 'post',
  path: '/{recordingId}/ground-truth/complete',
  request: {
    params: recordingIdParamsSchema,
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

recordingsRoutes.openapi(completeGroundTruthUploadRoute, (c) => {
  c.req.valid('param')

  return notImplemented(
    c,
    'POST /api/recordings/:recordingId/ground-truth/complete',
    'ground truth raw の登録完了を反映する'
  )
})

const deleteRecordingRoute = createRoute({
  method: 'delete',
  path: '/{recordingId}',
  request: {
    params: recordingIdParamsSchema,
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

recordingsRoutes.openapi(deleteRecordingRoute, (c) => {
  c.req.valid('param')

  return notImplemented(c, 'DELETE /api/recordings/:recordingId', 'recording を削除する')
})
