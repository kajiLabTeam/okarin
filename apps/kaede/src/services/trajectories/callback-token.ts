import { createHmac } from 'node:crypto'
import { getCallbackRuntimeConfig } from '../../config/runtime.js'

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')

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
