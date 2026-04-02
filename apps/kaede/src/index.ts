import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

const port = Number(process.env.PORT ?? '3000')
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
