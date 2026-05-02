import { OpenAPIHono } from '@hono/zod-openapi'
import { registerBatchTrajectoryMapDataRoute } from './batch-trajectory-map-data.js'
import { registerCallbackRoute } from './callback.js'
import { registerCloneAndReanalyzeRoute } from './clone-and-reanalyze.js'
import { registerCompleteGroundTruthUploadRoute } from './complete-ground-truth-upload.js'
import { registerCompleteManualResultUploadRoute } from './complete-manual-result-upload.js'
import { registerDeleteTrajectoryRoute } from './delete-trajectory.js'
import { registerGetTrajectoryMapDataRoute } from './get-trajectory-map-data.js'
import { registerGetTrajectoryResultRoute } from './get-trajectory-result.js'
import { registerGetTrajectoryRoute } from './get-trajectory.js'
import { registerIssueGroundTruthUploadUrlRoute } from './issue-ground-truth-upload-url.js'
import { registerIssueManualResultUploadUrlRoute } from './issue-manual-result-upload-url.js'
import { registerRetryTrajectoryRoute } from './retry-trajectory.js'

export const trajectoriesRoutes = new OpenAPIHono()

registerCallbackRoute(trajectoriesRoutes)
registerGetTrajectoryRoute(trajectoriesRoutes)
registerGetTrajectoryResultRoute(trajectoriesRoutes)
registerGetTrajectoryMapDataRoute(trajectoriesRoutes)
registerBatchTrajectoryMapDataRoute(trajectoriesRoutes)
registerRetryTrajectoryRoute(trajectoriesRoutes)
registerCloneAndReanalyzeRoute(trajectoriesRoutes)
registerIssueManualResultUploadUrlRoute(trajectoriesRoutes)
registerCompleteManualResultUploadRoute(trajectoriesRoutes)
registerIssueGroundTruthUploadUrlRoute(trajectoriesRoutes)
registerCompleteGroundTruthUploadRoute(trajectoriesRoutes)
registerDeleteTrajectoryRoute(trajectoriesRoutes)
