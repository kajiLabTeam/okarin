import type { MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'node:crypto'

const bearerPrefix = 'Bearer '

const isEqualToken = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export interface ApiSharedTokenAuthOptions {
  exemptPaths?: string[]
  token?: string
}

export const apiSharedTokenAuth = ({
  exemptPaths = [],
  token,
}: ApiSharedTokenAuthOptions): MiddlewareHandler => {
  return async (c, next) => {
    if (!token || exemptPaths.includes(c.req.path)) {
      await next()
      return
    }

    const authorization = c.req.header('authorization')
    const actualToken = authorization?.startsWith(bearerPrefix)
      ? authorization.slice(bearerPrefix.length)
      : undefined

    if (!actualToken || !isEqualToken(actualToken, token)) {
      return c.json(
        {
          error_code: 'UNAUTHORIZED',
          error_message: 'invalid or missing API token',
        },
        401
      )
    }

    await next()
  }
}
