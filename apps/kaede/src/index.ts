import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10)
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort
const host = process.env.HOST ?? '0.0.0.0'

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

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
