import { OpenAPIHono } from '@hono/zod-openapi'
import { registerPositioningAnalysisCallbackRoute } from './positioning-analysis-callbacks.js'

export const internalRoutes = new OpenAPIHono()

registerPositioningAnalysisCallbackRoute(internalRoutes)
