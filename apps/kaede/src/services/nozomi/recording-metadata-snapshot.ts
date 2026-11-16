import { createHash } from 'node:crypto'
import { getObjectBytes, putRecordingMetadataSnapshotObject } from '../storage/index.js'

/** 配置の抽出と解析に、同じ内容のmetadataを使用する。 */
export type RecordingMetadataSnapshot =
  { status: 'absent' } | { status: 'unavailable' } | { status: 'ready'; bytes: Uint8Array }

interface MetadataAsset {
  data_type: string
  schema_version: string
  format: string
  validation_status: string
  object_key?: string
  checksum_sha256?: string | null
}

export const snapshotRecordingMetadata = async <T extends MetadataAsset>(
  recording: { id: string; organization_id: string },
  assets: T[]
): Promise<{ assets: T[]; metadata: RecordingMetadataSnapshot }> => {
  // 現在のmetadata入力契約（JSON v1）に一致する、有効な候補だけを選ぶ。
  const candidates = assets.filter(
    (asset) =>
      asset.data_type === 'metadata' &&
      asset.validation_status === 'valid' &&
      asset.format === 'json' &&
      asset.schema_version === '1'
  )
  if (candidates.length !== 1) {
    return {
      assets,
      metadata: {
        status: assets.some((asset) => asset.data_type === 'metadata') ? 'unavailable' : 'absent',
      },
    }
  }
  const [source] = candidates
  let bytes: Uint8Array
  let checksum: string
  let stage = 'read'
  try {
    if (!source.object_key) throw new Error('Metadata has no object key')
    bytes = await getObjectBytes(source.object_key)
    checksum = createHash('sha256').update(bytes).digest('hex')
    stage = 'checksum'
    if (source.checksum_sha256 && source.checksum_sha256 !== checksum)
      throw new Error('Metadata checksum mismatch')
  } catch {
    console.warn('Recording metadata snapshot unavailable', { recordingId: recording.id, stage })
    // 1件の欠損・障害で一覧全体を落とさず、その入力を使う解析だけ利用不可にする。
    return {
      assets: assets.map((asset) =>
        asset === source ? { ...asset, validation_status: 'invalid' } : asset
      ),
      metadata: { status: 'unavailable' },
    }
  }
  const objectKey = `organizations/${recording.organization_id}/recordings/${recording.id}/metadata-snapshots/${checksum}.json`
  try {
    await putRecordingMetadataSnapshotObject(objectKey, bytes)
  } catch {
    console.warn('Recording metadata snapshot unavailable', {
      recordingId: recording.id,
      stage: 'store',
    })
    // 配置との同時固定ができないBLEだけを止め、非BLEは元キーと確定checksumで続行できる。
    return {
      assets: assets.map((asset) =>
        asset === source ? { ...asset, checksum_sha256: checksum } : asset
      ),
      metadata: { status: 'unavailable' },
    }
  }
  return {
    assets: assets.map((asset) =>
      asset === source ? { ...asset, object_key: objectKey, checksum_sha256: checksum } : asset
    ),
    metadata: { status: 'ready', bytes },
  }
}
