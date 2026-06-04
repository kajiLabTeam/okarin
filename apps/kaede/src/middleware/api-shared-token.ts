import type { MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'node:crypto'

const isEqualToken = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

const extractBearerToken = (authorization: string | undefined) => {
  const match = authorization?.trim().match(/^bearer\s+(.+)$/i)
  return match?.[1]?.trim()
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

    const actualToken = extractBearerToken(c.req.header('authorization'))

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
