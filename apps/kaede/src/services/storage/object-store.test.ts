import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateDataAssetObject } from './object-store.js'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('./s3-client.js', () => ({
  getS3Context: () => ({
    config: { bucket: 'test-bucket' },
    internalClient: { send: sendMock },
  }),
}))

const definition = {
  format: 'csv',
  required_columns: ['timestamp_ns', 'wall_time_ms', 'x', 'label'],
  timestamp_column: 'timestamp_ns',
  wall_time_column: 'wall_time_ms',
  column_types: {
    timestamp_ns: 'integer' as const,
    wall_time_ms: 'integer' as const,
    x: 'number' as const,
    label: 'string' as const,
  },
}

const mockObject = (body: string, contentType = 'text/csv') => {
  const bytes = new TextEncoder().encode(body)
  sendMock
    .mockResolvedValueOnce({ ContentType: contentType, ContentLength: bytes.byteLength })
    .mockResolvedValueOnce({
      Body: (function* () {
        yield bytes.slice(0, Math.max(1, Math.floor(bytes.length / 2)))
        yield bytes.slice(Math.max(1, Math.floor(bytes.length / 2)))
      })(),
    })
}

afterEach(() => sendMock.mockReset())

describe('validateDataAssetObject', () => {
  it('BOMとquoted comma/newline/escaped quoteを含むCSVを検証する', async () => {
    mockObject(
      '\uFEFFtimestamp_ns,wall_time_ms,x,label\n1,1700000000000,1.5,"a,b"\n2,1700000001000,2.5,"line\nwith ""quote"""\n'
    )

    const result = await validateDataAssetObject('asset.csv', 'text/csv', definition)

    expect(result.valid).toBe(true)
    expect(result.sampleCount).toBe(2)
    expect(result.startedAt?.getTime()).toBe(1700000000000)
    expect(result.endedAt?.getTime()).toBe(1700000001000)
  })

  it('未閉じ引用符をinvalidとして扱う', async () => {
    mockObject('timestamp_ns,wall_time_ms,x,label\n1,1700000000000,1.5,"unterminated')

    const result = await validateDataAssetObject('asset.csv', 'text/csv', definition)

    expect(result.valid).toBe(false)
  })

  it('Dateの範囲外のwall_time_msをinvalidとして扱う', async () => {
    mockObject('timestamp_ns,wall_time_ms,x,label\n1,8640000000000001,1.5,ok')

    const result = await validateDataAssetObject('asset.csv', 'text/csv', definition)

    expect(result.valid).toBe(false)
  })

  it('列不足の行を例外ではなくinvalidとして扱う', async () => {
    mockObject('timestamp_ns,wall_time_ms,x,label\n1,1700000000000,1.5')

    const result = await validateDataAssetObject('asset.csv', 'text/csv', definition)

    expect(result.valid).toBe(false)
  })

  it('Content-Type不一致をinvalidとして扱う', async () => {
    mockObject('timestamp_ns,wall_time_ms,x,label\n1,1700000000000,1.5,ok', 'application/json')

    const result = await validateDataAssetObject('asset.csv', 'text/csv', definition)

    expect(result.valid).toBe(false)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
