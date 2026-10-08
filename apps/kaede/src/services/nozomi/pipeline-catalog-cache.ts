import type { PipelineCatalogEntry } from '../../schemas/pipelines.js'
import { fetchPipelineCatalog } from './pipeline-client.js'

const TTL_MS = 60_000
let cached: { expiresAt: number; value: PipelineCatalogEntry[] } | undefined
let inflight: Promise<PipelineCatalogEntry[]> | undefined

export const getCachedPipelineCatalog = async (): Promise<PipelineCatalogEntry[]> => {
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
