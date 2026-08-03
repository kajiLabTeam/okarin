import '../instrument.mjs'
import { serve } from '@hono/node-server'
import { validateRuntimeConfig } from './config/runtime.js'
import { createApp } from './server.js'
import { expireTimedOutAnalysisRuns } from './services/analysis-runs/index.js'

const runtimeConfig = validateRuntimeConfig()
await expireTimedOutAnalysisRuns()
const app = createApp()
const port = runtimeConfig.app.port
const host = runtimeConfig.app.host

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    console.log(`Server is running on http://${host}:${info.port}`)
  }
)
