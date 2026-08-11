import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resetRuntimeConfigForTests } from '../../config/runtime.js'
import { callbackRequestSchema } from '../../schemas/trajectories.js'
import { submitAnalyzeRequest } from './analyze-client.js'
import type { AnalyzeRequestPayload } from './analyze-client.js'

interface TrajectoryAnalysisContract {
  analyze_request: AnalyzeRequestPayload
  accepted_response: {
    trajectory_id: string
    status: 'accepted'
  }
  completed_callback: unknown
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../../../contracts/kaede-nozomi/trajectory-analysis.json', import.meta.url),
    'utf8'
  )
) as TrajectoryAnalysisContract

describe('Kaede-Nozomi trajectory analysis contract', () => {
  const originalFetch = globalThis.fetch
  const originalNozomiInternalEndpoint = process.env.NOZOMI_INTERNAL_ENDPOINT
  const originalNozomiRequestTimeoutMs = process.env.NOZOMI_REQUEST_TIMEOUT_MS

  beforeEach(() => {
    process.env.NOZOMI_INTERNAL_ENDPOINT = 'http://nozomi:8000'
    process.env.NOZOMI_REQUEST_TIMEOUT_MS = '1000'
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    if (originalNozomiInternalEndpoint === undefined) {
      delete process.env.NOZOMI_INTERNAL_ENDPOINT
    } else {
      process.env.NOZOMI_INTERNAL_ENDPOINT = originalNozomiInternalEndpoint
    }
    if (originalNozomiRequestTimeoutMs === undefined) {
      delete process.env.NOZOMI_REQUEST_TIMEOUT_MS
    } else {
      process.env.NOZOMI_REQUEST_TIMEOUT_MS = originalNozomiRequestTimeoutMs
    }
    resetRuntimeConfigForTests()
  })

  it('organization-aware storage payload is sent without authentication context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(contract.accepted_response), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })
    )
    globalThis.fetch = fetchMock as typeof fetch

    await expect(submitAnalyzeRequest(contract.analyze_request)).resolves.toEqual(
      contract.accepted_response
    )

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(typeof request.body).toBe('string')
    if (typeof request.body !== 'string') {
      throw new TypeError('Kaede-Nozomi request body must be JSON text')
    }
    expect(JSON.parse(request.body)).toEqual(contract.analyze_request)
    expect(contract.analyze_request.result_object_key).toMatch(
      /^organizations\/[0-9a-f-]+\/trajectories\/[0-9a-f-]+\/analyzed\/result\.csv$/
    )
    expect(contract.analyze_request).not.toHaveProperty('user_id')
    expect(contract.analyze_request).not.toHaveProperty('membership_id')
    expect(contract.analyze_request).not.toHaveProperty('session_id')
  })

  it('accepts the completed callback emitted by Nozomi', () => {
    expect(callbackRequestSchema.parse(contract.completed_callback)).toEqual(
      contract.completed_callback
    )
  })
})
