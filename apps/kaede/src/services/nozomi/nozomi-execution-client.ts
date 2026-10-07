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

export interface NozomiExecutionRequest {
  analysis_run_item_id: string
  pipeline_id: string
  snapshot_digest: string
  inputs: NozomiExecutionInputManifest[]
  bindings: NozomiExecutionSlotBinding[]
  output_uri: string
  callback: {
    url: string
    secret?: string | null
  }
  parameters: Record<string, unknown>
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
