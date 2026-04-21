import { serve } from '@hono/node-server'

import { createApp } from './server.js'

const app = createApp()
const parsedPort = Number.parseInt(process.env.PORT ?? '8080', 10)
const port = Number.isNaN(parsedPort) ? 8080 : parsedPort
const host = process.env.HOST ?? '0.0.0.0'

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
