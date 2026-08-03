import { OpenAPIHono } from '@hono/zod-openapi'
import { registerAnalysisCallbackRoute } from './callback.js'

export const analysisRunsRoutes = new OpenAPIHono()

registerAnalysisCallbackRoute(analysisRunsRoutes)
