import type { Context } from 'hono'

const routeParams = (c: Context) => {
  const params = c.req.param()

  return Object.keys(params).length === 0 ? undefined : params
}

export const notImplemented = (c: Context, endpoint: string, description: string) => {
  const response = {
    error: 'NOT_IMPLEMENTED' as const,
    endpoint,
    description,
    params: routeParams(c),
  }

  return c.json(response, 501)
}
