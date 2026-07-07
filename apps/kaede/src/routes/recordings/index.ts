import { OpenAPIHono } from '@hono/zod-openapi'
import type { RequestActorHonoEnv } from '../../middleware/request-actor-context.js'
import { registerCompleteGroundTruthUploadRoute } from './complete-ground-truth-upload.js'
import { registerCompleteUploadRoute } from './complete-upload.js'
import { registerCreateTrajectoryRoute } from './create-trajectory.js'
import { registerGetRecordingConstraintsRoute } from './get-recording-constraints.js'
import { registerGetRecordingRoute } from './get-recording.js'
import { registerInitRecordingRoute } from './init-recording.js'
import { registerIssueGroundTruthUploadUrlRoute } from './issue-ground-truth-upload-url.js'
import { registerListRecordingTrajectoriesRoute } from './list-recording-trajectories.js'
import { registerRefreshUploadUrlsRoute } from './refresh-upload-urls.js'
import { registerUpdateRecordingConstraintsRoute } from './update-recording-constraints.js'

export const recordingsRoutes = new OpenAPIHono<RequestActorHonoEnv>()

registerInitRecordingRoute(recordingsRoutes)
registerCompleteUploadRoute(recordingsRoutes)
registerRefreshUploadUrlsRoute(recordingsRoutes)
registerCreateTrajectoryRoute(recordingsRoutes)
registerGetRecordingConstraintsRoute(recordingsRoutes)
registerUpdateRecordingConstraintsRoute(recordingsRoutes)
registerGetRecordingRoute(recordingsRoutes)
registerListRecordingTrajectoriesRoute(recordingsRoutes)
registerIssueGroundTruthUploadUrlRoute(recordingsRoutes)
registerCompleteGroundTruthUploadRoute(recordingsRoutes)
