import { getNozomiRuntimeConfig } from '../../config/runtime.js'

export class RetriableDispatchError extends Error {
  readonly retriable = true
  constructor(message: string) {
    super(message)
    this.name = 'RetriableDispatchError'
  }
}

export class FatalDispatchError extends Error {
  readonly retriable = false
  constructor(message: string) {
    super(message)
    this.name = 'FatalDispatchError'
  }
}

export interface NozomiExecutionInputManifest {
  slot_id: string
  contract: {
    kind: 'asset'
    data_type: string
    schema_version: string
    format: string
  }
  uri: string
  digest: string
  available: boolean
}

export interface NozomiExecutionSlotBinding {
  target_component_instance: string
  target_slot_id: string
  source_component_instance?: string
  source_slot_id?: string
}

export interface NozomiGroundTruthInput {
  uri: string
  digest: string
}

export interface NozomiExecutionRequest {
  analysis_run_item_id: string
  pipeline_id: string
  snapshot_digest: string
  inputs: NozomiExecutionInputManifest[]
  bindings: NozomiExecutionSlotBinding[]
  output_uri: string
  output_artifacts?: Record<
    string,
    {
      upload_uri: string
      object_key: string
      content_type: string
      format: string
      manifest_name?: string
    }
  >
  callback: {
    url: string
    secret?: string | null
  }
  parameters: Record<string, unknown>
  ground_truth?: NozomiGroundTruthInput
}

export interface NozomiExecutionResponse {
  analysis_run_item_id: string
  status: 'processing' | 'completed' | 'failed'
}

export const dispatchExecutionToNozomi = async (
  request: NozomiExecutionRequest
): Promise<NozomiExecutionResponse> => {
  const config = getNozomiRuntimeConfig()
  let response: Response

  try {
    response = await fetch(`${config.internalEndpoint}/internal/pipeline-executions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    })
  } catch (error) {
    throw new RetriableDispatchError(`Nozomi connection failed: ${String(error)}`)
  }

  if (response.status === 202 || response.status === 200) {
    return (await response.json()) as NozomiExecutionResponse
  }

  let errorBody: string
  try {
    errorBody = await response.text()
  } catch {
    errorBody = 'unknown response body'
  }

  if (response.status >= 500) {
    throw new RetriableDispatchError(`Nozomi server error (${response.status}): ${errorBody}`)
  }

  throw new FatalDispatchError(`Nozomi rejected request (${response.status}): ${errorBody}`)
}

export class ArtifactRetryError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ArtifactRetryError'
  }
}

export const retryParticleAnimationInNozomi = async (
  itemId: string,
  outputArtifacts: NonNullable<NozomiExecutionRequest['output_artifacts']>
): Promise<{ generation_attempt: number }> => {
  const config = getNozomiRuntimeConfig()
  let response: Response
  try {
    response = await fetch(
      `${config.internalEndpoint}/internal/pipeline-executions/${encodeURIComponent(itemId)}/particle-animation/retry`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ output_artifacts: outputArtifacts }),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      }
    )
  } catch (error) {
    throw new ArtifactRetryError(502, `Nozomi connection failed: ${String(error)}`)
  }
  if (response.status !== 202) {
    throw new ArtifactRetryError(
      response.status === 404 || response.status === 409 ? 409 : 502,
      'Video retry was not accepted'
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ArtifactRetryError(502, 'Invalid video retry response')
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('generation_attempt' in body) ||
    typeof body.generation_attempt !== 'number' ||
    !Number.isSafeInteger(body.generation_attempt) ||
    body.generation_attempt < 0
  ) {
    throw new ArtifactRetryError(502, 'Invalid video retry response')
  }
  return { generation_attempt: body.generation_attempt }
}
