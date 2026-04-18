import { Hono } from 'hono'

import { notImplemented } from '../utils/not-implemented.js'

export const recordingsRoutes = new Hono()

recordingsRoutes.post('/init', notImplemented('POST /api/recordings/init', 'recording を作成する'))

recordingsRoutes.post(
  '/:recordingId/complete-upload',
  notImplemented(
    'POST /api/recordings/:recordingId/complete-upload',
    'recording の raw upload 完了を反映する'
  )
)

recordingsRoutes.post(
  '/:recordingId/refresh-upload-urls',
  notImplemented(
    'POST /api/recordings/:recordingId/refresh-upload-urls',
    'recording の upload URL を再発行する'
  )
)

recordingsRoutes.post(
  '/:recordingId/trajectories',
  notImplemented(
    'POST /api/recordings/:recordingId/trajectories',
    'trajectory を作成して解析を開始する'
  )
)

recordingsRoutes.get(
  '/:recordingId',
  notImplemented('GET /api/recordings/:recordingId', 'recording 詳細を取得する')
)

recordingsRoutes.get(
  '/:recordingId/trajectories',
  notImplemented(
    'GET /api/recordings/:recordingId/trajectories',
    'recording 配下の trajectory 一覧を取得する'
  )
)

recordingsRoutes.post(
  '/:recordingId/ground-truth/upload-url',
  notImplemented(
    'POST /api/recordings/:recordingId/ground-truth/upload-url',
    'ground truth raw の upload URL を発行する'
  )
)

recordingsRoutes.post(
  '/:recordingId/ground-truth/complete',
  notImplemented(
    'POST /api/recordings/:recordingId/ground-truth/complete',
    'ground truth raw の登録完了を反映する'
  )
)

recordingsRoutes.delete(
  '/:recordingId',
  notImplemented('DELETE /api/recordings/:recordingId', 'recording を削除する')
)
