import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCompleteGroundTruthUploadRoute } from './complete-ground-truth-upload.js'
import { registerCompleteUploadRoute } from './complete-upload.js'
import { registerCreateTrajectoryRoute } from './create-trajectory.js'
import { registerGetRecordingRoute } from './get-recording.js'
import { registerInitRecordingRoute } from './init-recording.js'
import { registerIssueGroundTruthUploadUrlRoute } from './issue-ground-truth-upload-url.js'
import { registerListRecordingTrajectoriesRoute } from './list-recording-trajectories.js'
import { registerRefreshUploadUrlsRoute } from './refresh-upload-urls.js'

export const recordingsRoutes = new OpenAPIHono()

registerInitRecordingRoute(recordingsRoutes)
registerCompleteUploadRoute(recordingsRoutes)
registerRefreshUploadUrlsRoute(recordingsRoutes)
registerCreateTrajectoryRoute(recordingsRoutes)
registerGetRecordingRoute(recordingsRoutes)
registerListRecordingTrajectoriesRoute(recordingsRoutes)
registerIssueGroundTruthUploadUrlRoute(recordingsRoutes)
registerCompleteGroundTruthUploadRoute(recordingsRoutes)
