import { createHmac, timingSafeEqual } from 'node:crypto'
import { getCallbackRuntimeConfig } from '../../config/runtime.js'

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

interface CallbackTokenPayload {
  trajectory_id: string
  exp: number
}

export type VerifyCallbackTokenResult =
  | {
      ok: true
      value: {
        trajectoryId: string
        exp: number
      }
    }
  | {
      ok: false
      error: 'CALLBACK_TOKEN_INVALID' | 'CALLBACK_TOKEN_EXPIRED'
    }

export const generateCallbackToken = (trajectoryId: string, now: Date = new Date()): string => {
  const callbackConfig = getCallbackRuntimeConfig()
  const exp = Math.floor(now.getTime() / 1000) + callbackConfig.tokenTtlSeconds
  const payload = base64UrlEncode(
    JSON.stringify({
      trajectory_id: trajectoryId,
      exp,
    })
  )

  const signature = createHmac('sha256', callbackConfig.tokenSecret)
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
}

export const verifyCallbackToken = (
  token: string,
  now: Date = new Date()
): VerifyCallbackTokenResult => {
  const callbackConfig = getCallbackRuntimeConfig()
  const [payload, signature, ...rest] = token.split('.')

  if (!payload || !signature || rest.length > 0) {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_INVALID',
    }
  }

  const expectedSignature = createHmac('sha256', callbackConfig.tokenSecret)
    .update(payload)
    .digest('base64url')

  if (signature.length !== expectedSignature.length) {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_INVALID',
    }
  }

  const matches = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  if (!matches) {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_INVALID',
    }
  }

  let parsedPayload: CallbackTokenPayload

  try {
    parsedPayload = JSON.parse(base64UrlDecode(payload)) as CallbackTokenPayload
  } catch {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_INVALID',
    }
  }

  if (
    typeof parsedPayload.trajectory_id !== 'string' ||
    typeof parsedPayload.exp !== 'number' ||
    !Number.isFinite(parsedPayload.exp)
  ) {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_INVALID',
    }
  }

  if (parsedPayload.exp <= Math.floor(now.getTime() / 1000)) {
    return {
      ok: false,
      error: 'CALLBACK_TOKEN_EXPIRED',
    }
  }

  return {
    ok: true,
    value: {
      trajectoryId: parsedPayload.trajectory_id,
      exp: parsedPayload.exp,
    },
  }
}
