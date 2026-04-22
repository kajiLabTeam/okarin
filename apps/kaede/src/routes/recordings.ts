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
  tags: ['Recordings'],
  description: '新しい recording を作成し、初回アップロード用の URL を返す',
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
  tags: ['Recordings'],
  description: 'recording に紐づく raw データのアップロード完了を確定する',
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
  tags: ['Recordings'],
  description: '指定したアップロード対象について署名付き URL を再発行する',
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
  tags: ['Recordings'],
  description: 'recording の基本情報とアップロード状態を返す',
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
  tags: ['Recordings'],
  description: 'recording に紐づく trajectory の一覧を返す',
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
  tags: ['Recordings'],
  description: 'recording 単位の ground truth raw をアップロードするための URL を発行する',
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
  tags: ['Recordings'],
  description: 'recording 単位の ground truth raw の登録完了を反映する',
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
  tags: ['Recordings'],
  description: '指定した recording を削除する',
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
