import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { snapshotRecordingMetadata } from './recording-metadata-snapshot.js'

const { getObject, putSnapshot } = vi.hoisted(() => ({ getObject: vi.fn(), putSnapshot: vi.fn() }))
vi.mock('../storage/index.js', () => ({
  getObjectBytes: getObject,
  putRecordingMetadataSnapshotObject: putSnapshot,
}))

const recording = { id: 'recording-1', organization_id: 'org-1' }
const source = {
  data_type: 'metadata',
  schema_version: '1',
  format: 'json',
  validation_status: 'valid',
  object_key: 'raw/metadata.json',
  checksum_sha256: null as string | null,
}
const bytes = new TextEncoder().encode('{"ble":{"configuration":{"beacons":[]}}}')
const checksum = createHash('sha256').update(bytes).digest('hex')

describe('metadata input snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getObject.mockResolvedValue(bytes)
  })

  it('legacy metadataを内容で固定し、配置用bytesと解析inputのdigestを同じ世代にする', async () => {
    const result = await snapshotRecordingMetadata(recording, [source])
    const key = `organizations/org-1/recordings/recording-1/metadata-snapshots/${checksum}.json`
    expect(result.metadata).toEqual({ status: 'ready', bytes })
    expect(result.assets[0]).toMatchObject({ object_key: key, checksum_sha256: checksum })
    expect(putSnapshot).toHaveBeenCalledWith(key, bytes)
    expect(getObject).toHaveBeenCalledTimes(1)
    expect(source.object_key).toBe('raw/metadata.json')
    // 元キーが上書きされても、既に確定した解析入力は変わらない。
    getObject.mockResolvedValue(new TextEncoder().encode('{"changed":true}'))
    expect(result.assets[0].object_key).toBe(key)
    expect(result.metadata).toEqual({ status: 'ready', bytes })
  })

  it('typed metadataは既存checksumと一致する内容だけ固定する', async () => {
    const result = await snapshotRecordingMetadata(recording, [
      { ...source, checksum_sha256: checksum },
    ])
    expect(result.metadata.status).toBe('ready')
    expect(putSnapshot).toHaveBeenCalledWith(expect.stringContaining(checksum), bytes)
  })

  it('typed metadataのchecksumが違えば不正な内容を配置にも解析にも使わない', async () => {
    const result = await snapshotRecordingMetadata(recording, [
      { ...source, checksum_sha256: '0'.repeat(64) },
    ])
    expect(result.metadata.status).toBe('unavailable')
    expect(result.assets[0].validation_status).toBe('invalid')
    expect(putSnapshot).not.toHaveBeenCalled()
  })

  it.each([
    { ...source, validation_status: 'invalid' },
    { ...source, schema_version: '2' },
    { ...source, format: 'csv' },
  ])('bind対象外のmetadataが併存しても有効なJSON v1を選べる', async (other) => {
    const result = await snapshotRecordingMetadata(recording, [other, source])
    expect(result.metadata.status).toBe('ready')
    expect(result.assets[0]).toEqual(other)
    expect(result.assets[1]).toMatchObject({ checksum_sha256: checksum })
    expect(getObject).toHaveBeenCalledTimes(1)
  })

  it('有効なmetadataが複数なら勝手に一方を選ばない', async () => {
    const result = await snapshotRecordingMetadata(recording, [
      source,
      { ...source, object_key: 'second.json' },
    ])
    expect(result.metadata.status).toBe('unavailable')
    expect(getObject).not.toHaveBeenCalled()
  })

  it('metadata未宣言の旧計測と不正なmetadataを区別する', async () => {
    expect((await snapshotRecordingMetadata(recording, [])).metadata.status).toBe('absent')
    expect(
      (await snapshotRecordingMetadata(recording, [{ ...source, validation_status: 'invalid' }]))
        .metadata.status
    ).toBe('unavailable')
    expect(getObject).not.toHaveBeenCalled()
  })

  it.each(['read', 'write'])(
    '%s障害でも一覧全体は落とさず、保存障害は非BLE入力まで無効にしない',
    async (stage) => {
      if (stage === 'read') getObject.mockRejectedValue(new Error('storage read failed'))
      else putSnapshot.mockRejectedValue(new Error('storage write failed'))
      const result = await snapshotRecordingMetadata(recording, [source])
      expect(result.metadata.status).toBe('unavailable')
      expect(result.assets[0].validation_status).toBe(stage === 'read' ? 'invalid' : 'valid')
      if (stage === 'write')
        expect(result.assets[0]).toMatchObject({
          object_key: source.object_key,
          checksum_sha256: checksum,
        })
    }
  )
})
