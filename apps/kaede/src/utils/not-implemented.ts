import type { Context, Handler } from 'hono'

const routeParams = (c: Context) => {
  const params = c.req.param()

  return Object.keys(params).length === 0 ? undefined : params
}

export const notImplemented = (endpoint: string, description: string): Handler => {
  return (c) => {
    return c.json(
      {
        error: 'NOT_IMPLEMENTED',
        endpoint,
        description,
        params: routeParams(c),
      },
      501
    )
  }
}
