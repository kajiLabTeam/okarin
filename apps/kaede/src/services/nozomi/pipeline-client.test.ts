import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPipelineCatalogCache, getCachedPipelineCatalog } from './pipeline-catalog-cache.js'
import { fetchPipelineCatalog } from './pipeline-client.js'

const catalog = [
  {
    pipeline_id: 'pdr',
    display_name: 'PDR',
    definition_version: '1.0.0',
    digest: 'd'.repeat(64),
    input_slots: [
      {
        slot_id: 'acce',
        required: true,
        max_assets: 1,
        accepted_contracts: [
          { kind: 'asset', data_type: 'acce', schema_version: '1', format: 'csv' },
        ],
      },
    ],
    outputs: [],
    parameters_schema: { type: 'object' },
    availability: { available: true, reason: null },
  },
]

describe('Nozomi pipeline client/cache', () => {
  beforeEach(() => {
    clearPipelineCatalogCache()
    vi.restoreAllMocks()
    process.env.NOZOMI_INTERNAL_ENDPOINT = 'http://nozomi:8000'
    vi.useRealTimers()
  })

  it('catalogを取得し、60秒以内の並行要求を1回にまとめる', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(catalog) } as Response)
    const [first, second] = await Promise.all([
      getCachedPipelineCatalog(),
      getCachedPipelineCatalog(),
    ])
    expect(first[0].pipeline_id).toBe('pdr')
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('非200を構造化されたNozomi障害として扱う', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(fetchPipelineCatalog()).rejects.toMatchObject({
      code: 'NOZOMI_UNAVAILABLE',
    })
  })

  it('60秒を過ぎたcatalogは再取得する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T00:00:00.000Z'))
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(catalog) } as Response)

    await getCachedPipelineCatalog()
    vi.advanceTimersByTime(59_999)
    await getCachedPipelineCatalog()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await getCachedPipelineCatalog()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('不正なカタログschemaを実行可能な値として返さない', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{}]),
    } as Response)
    await expect(fetchPipelineCatalog()).rejects.toMatchObject({
      code: 'NOZOMI_SCHEMA_INVALID',
    })
  })
})
