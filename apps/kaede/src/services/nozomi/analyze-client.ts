import { z } from 'zod'
import { getNozomiRuntimeConfig } from '../../config/runtime.js'

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

const getNozomiAnalyzeUrl = () => `${getNozomiRuntimeConfig().internalEndpoint}/analyze`

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
