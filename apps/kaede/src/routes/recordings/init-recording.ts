import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute } from '@hono/zod-openapi'
import { errorResponseSchema, recordingUploadStatusSchema } from '../../schemas/common.js'
import {
  initRecordingRequestSchema,
  initRecordingResponseSchema,
} from '../../schemas/recordings.js'
import { db } from '../../services/db/index.js'
import { insertRecording } from '../../services/recordings/index.js'
import { issueRecordingUploadUrls } from '../../services/storage/index.js'

export const registerInitRecordingRoute = (app: OpenAPIHono) => {
  const route = createRoute({
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
      404: {
        description: 'pedestrian or floor not found',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  })

  app.openapi(route, async (c) => {
    const payload = c.req.valid('json')

    const [pedestrian, floor] = await Promise.all([
      db
        .selectFrom('pedestrians')
        .select('id')
        .where('id', '=', payload.pedestrian_id)
        .executeTakeFirst(),
      db.selectFrom('floors').select('id').where('id', '=', payload.floor_id).executeTakeFirst(),
    ])

    if (!pedestrian) {
      return c.json(
        {
          error_code: 'PEDESTRIAN_NOT_FOUND',
          error_message: 'pedestrian_id does not exist',
          details: {
            pedestrian_id: payload.pedestrian_id,
          },
        },
        404
      )
    }

    if (!floor) {
      return c.json(
        {
          error_code: 'FLOOR_NOT_FOUND',
          error_message: 'floor_id does not exist',
          details: {
            floor_id: payload.floor_id,
          },
        },
        404
      )
    }

    const recording = await insertRecording({
      pedestrian_id: payload.pedestrian_id,
      floor_id: payload.floor_id,
      upload_targets: payload.upload_targets,
    })
    const { expiresAt, uploadUrls } = await issueRecordingUploadUrls(
      recording.id,
      payload.upload_targets
    )

    return c.json(
      {
        recording_id: recording.id,
        upload_status: recordingUploadStatusSchema.parse(recording.upload_status),
        upload_urls: uploadUrls,
        expires_at: expiresAt,
      },
      201
    )
  })
}
