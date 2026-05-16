import { createHmac } from 'node:crypto'

const defaultCallbackTokenTtlSeconds = 24 * 60 * 60

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

const getCallbackTokenSecret = () => getRequiredEnv('CALLBACK_TOKEN_SECRET')

const getCallbackTokenTtlSeconds = () => {
  const raw = process.env.CALLBACK_TOKEN_TTL_SECONDS
  if (!raw) {
    return defaultCallbackTokenTtlSeconds
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('CALLBACK_TOKEN_TTL_SECONDS must be a positive integer')
  }

  return parsed
}

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')

export const generateCallbackToken = (trajectoryId: string, now: Date = new Date()): string => {
  const exp = Math.floor(now.getTime() / 1000) + getCallbackTokenTtlSeconds()
  const payload = base64UrlEncode(
    JSON.stringify({
      trajectory_id: trajectoryId,
      exp,
    })
  )

  const signature = createHmac('sha256', getCallbackTokenSecret())
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
}
