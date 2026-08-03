import { createHmac, timingSafeEqual } from 'node:crypto'
import { getCallbackRuntimeConfig } from '../../config/runtime.js'

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

interface CallbackTokenPayload {
  trajectory_id: string
  exp: number
}

interface AnalysisCallbackTokenPayload {
  analysis_run_id: string
  analysis_type: 'stay_heatmap'
  exp: number
}

const signCallbackPayload = (payload: CallbackTokenPayload | AnalysisCallbackTokenPayload) => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = createHmac('sha256', getCallbackRuntimeConfig().tokenSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
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

export type VerifyAnalysisCallbackTokenResult =
  | {
      ok: true
      value: {
        analysisRunId: string
        analysisType: 'stay_heatmap'
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
  return signCallbackPayload({ trajectory_id: trajectoryId, exp })
}

export const generateAnalysisCallbackToken = (
  analysisRunId: string,
  now: Date = new Date()
): string => {
  const callbackConfig = getCallbackRuntimeConfig()
  const exp = Math.floor(now.getTime() / 1000) + callbackConfig.tokenTtlSeconds
  return signCallbackPayload({
    analysis_run_id: analysisRunId,
    analysis_type: 'stay_heatmap',
    exp,
  })
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

export const verifyAnalysisCallbackToken = (
  token: string,
  now: Date = new Date()
): VerifyAnalysisCallbackTokenResult => {
  const callbackConfig = getCallbackRuntimeConfig()
  const [payload, signature, ...rest] = token.split('.')
  if (!payload || !signature || rest.length > 0) {
    return { ok: false, error: 'CALLBACK_TOKEN_INVALID' }
  }

  const expectedSignature = createHmac('sha256', callbackConfig.tokenSecret)
    .update(payload)
    .digest('base64url')
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return { ok: false, error: 'CALLBACK_TOKEN_INVALID' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as unknown
  } catch {
    return { ok: false, error: 'CALLBACK_TOKEN_INVALID' }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('analysis_run_id' in parsed) ||
    !('analysis_type' in parsed) ||
    !('exp' in parsed) ||
    typeof parsed.analysis_run_id !== 'string' ||
    parsed.analysis_type !== 'stay_heatmap' ||
    typeof parsed.exp !== 'number' ||
    !Number.isFinite(parsed.exp)
  ) {
    return { ok: false, error: 'CALLBACK_TOKEN_INVALID' }
  }
  if (parsed.exp <= Math.floor(now.getTime() / 1000)) {
    return { ok: false, error: 'CALLBACK_TOKEN_EXPIRED' }
  }

  return {
    ok: true,
    value: {
      analysisRunId: parsed.analysis_run_id,
      analysisType: parsed.analysis_type,
      exp: parsed.exp,
    },
  }
}
