import type { Pipeline } from '../../schemas/pipelines.js'
import { fetchPipelineCatalog } from './pipeline-client.js'

const TTL_MS = 60_000
let cached: { expiresAt: number; value: Pipeline[] } | undefined
let inflight: Promise<Pipeline[]> | undefined

export const getCachedPipelineCatalog = async (): Promise<Pipeline[]> => {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value
  inflight ??= fetchPipelineCatalog()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + TTL_MS }
      return value
    })
    .finally(() => {
      inflight = undefined
    })
  return inflight
}

export const clearPipelineCatalogCache = () => {
  cached = undefined
  inflight = undefined
}
