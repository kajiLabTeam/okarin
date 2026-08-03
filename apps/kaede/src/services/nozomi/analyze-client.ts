import { z } from 'zod'
import { getNozomiRuntimeConfig } from '../../config/runtime.js'

const analyzeAcceptedResponseSchema = z.object({
  trajectory_id: z.string().uuid(),
  status: z.literal('accepted'),
})

const stayHeatmapAcceptedResponseSchema = z.object({
  analysis_run_id: z.string().uuid(),
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
  floor_scale?: number | null
  constraints: AnalyzeConstraint[]
  raw_data_urls: {
    acce: string
    gyro: string
    pressure?: string
    wifi?: string
  }
  result_upload_url: string
  result_object_key: string
  callback_url: string
  callback_token: string
}

const getNozomiAnalyzeConfig = () => {
  const config = getNozomiRuntimeConfig()

  return {
    requestTimeoutMs: config.requestTimeoutMs,
    url: `${config.internalEndpoint}/analyze`,
  }
}

export const submitAnalyzeRequest = async (payload: AnalyzeRequestPayload) => {
  const { requestTimeoutMs, url } = getNozomiAnalyzeConfig()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(requestTimeoutMs),
  })

  if (!response.ok) {
    throw new Error(`nozomi analyze request failed with status ${response.status}`)
  }

  const raw = await response.json()
  return analyzeAcceptedResponseSchema.parse(raw)
}

export interface StayHeatmapAnalyzeRequestPayload {
  analysis_run_id: string
  analysis_type: 'stay_heatmap'
  definition_version: 'original-v1'
  parameters: {
    speed_threshold_mps: number
    grid_size_m: number
  }
  floor: {
    floor_id: string
    map_width_px: number
    map_height_px: number
    scale_m_per_px: number
  }
  trajectories: {
    trajectory_id: string
    seq: number
    start: { x_px: number; y_px: number }
    source: { download_url: string }
    output: { upload_url: string }
  }[]
  heatmap_output: { upload_url: string }
  callback: { url: string; token: string }
}

export const submitStayHeatmapAnalyzeRequest = async (
  payload: StayHeatmapAnalyzeRequestPayload
) => {
  const config = getNozomiRuntimeConfig()
  const response = await fetch(`${config.internalEndpoint}/stay-heatmaps/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  })

  if (!response.ok) {
    throw new Error(`nozomi stay heatmap request failed with status ${response.status}`)
  }

  return stayHeatmapAcceptedResponseSchema.parse(await response.json())
}
