import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchExecutionToNozomi,
  FatalDispatchError,
  RetriableDispatchError,
} from './nozomi-execution-client.js'
import type { NozomiExecutionRequest } from './nozomi-execution-client.js'

vi.mock('../../config/runtime.js', () => ({
  getNozomiRuntimeConfig: () => ({
    internalEndpoint: 'http://nozomi:8000',
    requestTimeoutMs: 5000,
  }),
}))

describe('dispatchExecutionToNozomi', () => {
  const sampleRequest: NozomiExecutionRequest = {
    analysis_run_item_id: 'item-1',
    pipeline_id: 'pdr',
    snapshot_digest: 'a'.repeat(64),
    inputs: [
      {
        slot_id: 'imu',
        contract: { data_type: 'sensor_raw', schema_version: '1.0.0', format: 'csv' },
        uri: 'http://storage/download.csv',
        digest: 'b'.repeat(64),
        available: true,
      },
    ],
    bindings: [
      {
        target_component_instance: 'pdr_instance',
        target_slot_id: 'imu',
      },
    ],
    output_uri: 'http://storage/output.json',
    callback: {
      url: 'http://kaede:8080/api/internal/pipeline-executions/callbacks',
      secret: 'token-secret',
    },
    parameters: { step_length_m: 0.7 },
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('Nozomiが202 Acceptedを返した場合に正常に結果を返す', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        analysis_run_item_id: 'item-1',
        status: 'processing',
      }),
    } as unknown as Response)

    const result = await dispatchExecutionToNozomi(sampleRequest)

    expect(result).toEqual({
      analysis_run_item_id: 'item-1',
      status: 'processing',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://nozomi:8000/internal/pipeline-executions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sampleRequest),
      })
    )
  })

  it('通信タイムアウトや接続失敗のときはRetriableDispatchErrorを投げる', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

    await expect(dispatchExecutionToNozomi(sampleRequest)).rejects.toThrow(RetriableDispatchError)
  })

  it('Nozomiが500系エラーを返したときはRetriableDispatchErrorを投げる', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    } as unknown as Response)

    await expect(dispatchExecutionToNozomi(sampleRequest)).rejects.toThrow(RetriableDispatchError)
  })

  it('Nozomiが400系エラーを返したときはFatalDispatchErrorを投げる', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 422,
      text: vi.fn().mockResolvedValue('Unprocessable Entity'),
    } as unknown as Response)

    await expect(dispatchExecutionToNozomi(sampleRequest)).rejects.toThrow(FatalDispatchError)
  })
})
