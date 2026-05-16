import { z } from 'zod'

const analyzeAcceptedResponseSchema = z.object({
  trajectory_id: z.string().uuid(),
  status: z.literal('accepted'),
})

export interface AnalyzeConstraint {
  seq: number
  point_type: 'start' | 'waypoint' | 'goal'
  x: number
  y: number
  direction?: number
  relative_timestamp?: number
}

export interface AnalyzeRequestPayload {
  trajectory_id: string
  recording_id: string
  floor_id: string
  constraints: AnalyzeConstraint[]
  raw_data_urls: {
    acce: string
    gyro: string
    pressure?: string
    wifi?: string
  }
  result_upload_url: string
  callback_url: string
  callback_token: string
}

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

// nozomi analyze API の URL を取得する。環境変数 NOZOMI_INTERNAL_ENDPOINT を基に構築。
const getNozomiAnalyzeUrl = () => {
  const endpoint = getRequiredEnv('NOZOMI_INTERNAL_ENDPOINT').replace(/\/+$/, '')
  return `${endpoint}/analyze`
}

export const submitAnalyzeRequest = async (payload: AnalyzeRequestPayload) => {
  const response = await fetch(getNozomiAnalyzeUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`nozomi analyze request failed with status ${response.status}`)
  }

  const raw = await response.json()
  return analyzeAcceptedResponseSchema.parse(raw)
}
