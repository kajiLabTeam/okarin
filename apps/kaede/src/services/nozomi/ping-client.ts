import { getNozomiRuntimeConfig } from '../../config/runtime.js'
import { nozomiPingResponseSchema } from '../../schemas/common.js'

const getNozomiPingConfig = () => {
  const config = getNozomiRuntimeConfig()

  return {
    requestTimeoutMs: config.requestTimeoutMs,
    url: `${config.internalEndpoint}/rikka/ping`,
  }
}

export const pingNozomi = async () => {
  const { requestTimeoutMs, url } = getNozomiPingConfig()

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(requestTimeoutMs),
  })

  if (!response.ok) {
    throw new Error(`nozomi ping request failed with status ${response.status}`)
  }

  const raw = await response.json()
  return nozomiPingResponseSchema.parse(raw)
}
