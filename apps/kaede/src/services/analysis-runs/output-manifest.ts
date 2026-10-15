import { outputManifestSchema } from '../../schemas/positioning-analysis-callbacks.js'
import type { Json } from '../db/generated.js'

export interface OutputArtifactManifest {
  object_key: string
  checksum_sha256: string
  content_type: string
  format: string
  size_bytes?: number
  generated_at?: string
  available?: boolean
}

export interface OutputManifest {
  schema_version: '1'
  artifacts: Record<string, OutputArtifactManifest>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const emptyOutputManifest = (): OutputManifest => ({
  schema_version: '1',
  artifacts: {},
})

export const parseOutputManifest = (value: unknown): OutputManifest => {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return emptyOutputManifest()
    }
  }
  const parsed = outputManifestSchema.safeParse(raw)
  if (!parsed.success) {
    return emptyOutputManifest()
  }
  return parsed.data
}

export const mergeOutputManifest = (
  current: unknown,
  patch: Record<string, OutputArtifactManifest>
): OutputManifest => ({
  schema_version: '1',
  artifacts: {
    ...parseOutputManifest(current).artifacts,
    ...patch,
  },
})

export const outputArtifactsFromCallback = (
  outputs: unknown
): Record<string, OutputArtifactManifest> => {
  if (!isObject(outputs) || !isObject(outputs.output_manifest)) return {}
  const rawArtifacts = outputs.output_manifest.artifacts
  if (!isObject(rawArtifacts)) return {}
  const parsed = outputManifestSchema.safeParse(outputs.output_manifest)
  return parsed.success ? parsed.data.artifacts : {}
}

export const outputManifestJson = (value: OutputManifest) => JSON.stringify(value) as Json
