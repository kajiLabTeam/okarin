import { Hono } from 'hono'

import { notImplemented } from '../utils/not-implemented.js'

export const trajectoriesRoutes = new Hono()

trajectoriesRoutes.post(
  '/callback',
  notImplemented('POST /api/trajectories/callback', '解析 callback を反映する')
)

trajectoriesRoutes.get(
  '/:trajectoryId',
  notImplemented('GET /api/trajectories/:trajectoryId', 'trajectory 状態を取得する')
)

trajectoriesRoutes.get(
  '/:trajectoryId/result',
  notImplemented('GET /api/trajectories/:trajectoryId/result', 'trajectory の解析結果を取得する')
)

trajectoriesRoutes.get(
  '/:trajectoryId/map-data',
  notImplemented(
    'GET /api/trajectories/:trajectoryId/map-data',
    'trajectory の map data を取得する'
  )
)

trajectoriesRoutes.post(
  '/map-data:batch',
  notImplemented('POST /api/trajectories/map-data:batch', '複数 trajectory の map data を取得する')
)

trajectoriesRoutes.post(
  '/:trajectoryId/retry',
  notImplemented('POST /api/trajectories/:trajectoryId/retry', '同じ constraint で再解析する')
)

trajectoriesRoutes.post(
  '/:trajectoryId/clone-and-reanalyze',
  notImplemented(
    'POST /api/trajectories/:trajectoryId/clone-and-reanalyze',
    'constraint を変えて再解析する'
  )
)

trajectoriesRoutes.post(
  '/:trajectoryId/manual-result/upload-url',
  notImplemented(
    'POST /api/trajectories/:trajectoryId/manual-result/upload-url',
    '手動生成結果の upload URL を発行する'
  )
)

trajectoriesRoutes.post(
  '/:trajectoryId/manual-result/complete',
  notImplemented(
    'POST /api/trajectories/:trajectoryId/manual-result/complete',
    '手動生成結果の登録完了を反映する'
  )
)

trajectoriesRoutes.post(
  '/:trajectoryId/ground-truth/upload-url',
  notImplemented(
    'POST /api/trajectories/:trajectoryId/ground-truth/upload-url',
    'trajectory 単位 ground truth の upload URL を発行する'
  )
)

trajectoriesRoutes.post(
  '/:trajectoryId/ground-truth/complete',
  notImplemented(
    'POST /api/trajectories/:trajectoryId/ground-truth/complete',
    'trajectory 単位 ground truth の登録完了を反映する'
  )
)

trajectoriesRoutes.delete(
  '/:trajectoryId',
  notImplemented('DELETE /api/trajectories/:trajectoryId', 'trajectory を削除する')
)
