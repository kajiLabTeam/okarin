import { getNozomiRuntimeConfig } from '../../config/runtime.js'
import { activePipelineSchema, pipelineCatalogSchema } from '../../schemas/pipelines.js'
import type { Pipeline, PipelineCatalogEntry } from '../../schemas/pipelines.js'

export class NozomiPipelineError extends Error {
  constructor(
    public readonly code: 'NOZOMI_UNAVAILABLE' | 'NOZOMI_SCHEMA_INVALID' | 'PIPELINE_NOT_FOUND',
    message: string
  ) {
    super(message)
  }
}

const request = async (path: string, notFoundCode?: 'PIPELINE_NOT_FOUND'): Promise<unknown> => {
  const config = getNozomiRuntimeConfig()
  let response: Response
  try {
    response = await fetch(`${config.internalEndpoint}${path}`, {
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    })
  } catch (error) {
    throw new NozomiPipelineError('NOZOMI_UNAVAILABLE', String(error))
  }
  if (response.status === 404 && notFoundCode) {
    throw new NozomiPipelineError(notFoundCode, `status ${response.status}`)
  }
  if (!response.ok) throw new NozomiPipelineError('NOZOMI_UNAVAILABLE', `status ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new NozomiPipelineError('NOZOMI_SCHEMA_INVALID', 'response is not JSON')
  }
}

export const fetchPipelineCatalog = async (): Promise<PipelineCatalogEntry[]> => {
  try {
    const parsed = pipelineCatalogSchema.safeParse(await request('/pipelines'))
    if (!parsed.success)
      throw new NozomiPipelineError('NOZOMI_SCHEMA_INVALID', parsed.error.message)
    return parsed.data
  } catch (error) {
    if (error instanceof NozomiPipelineError) throw error
    throw new NozomiPipelineError('NOZOMI_SCHEMA_INVALID', String(error))
  }
}

export const resolveActivePipeline = async (pipelineId: string): Promise<Pipeline> => {
  const raw = await request(
    `/internal/pipelines/${encodeURIComponent(pipelineId)}`,
    'PIPELINE_NOT_FOUND'
  )
  const parsed = activePipelineSchema.safeParse(raw)
  if (!parsed.success) throw new NozomiPipelineError('NOZOMI_SCHEMA_INVALID', parsed.error.message)
  return parsed.data
}
