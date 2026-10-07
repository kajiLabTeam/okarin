import '../instrument.mjs'
import { serve } from '@hono/node-server'
import { validateRuntimeConfig } from './config/runtime.js'
import { createApp } from './server.js'
import { expireTimedOutAnalysisRuns, outboxWorker } from './services/analysis-runs/index.js'

const runtimeConfig = validateRuntimeConfig()
await expireTimedOutAnalysisRuns()
outboxWorker.start(3000)

const app = createApp()
const port = runtimeConfig.app.port
const host = runtimeConfig.app.host

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    console.log(`Server is running on http://${host}:${info.port}`)
  }
)

const shutdown = () => {
  outboxWorker.stop()
  server.close()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
