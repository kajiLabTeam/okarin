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
  const raw = typeof value === 'string' ? JSON.parse(value) : value
  if (!isObject(raw) || raw.schema_version !== '1' || !isObject(raw.artifacts)) {
    return emptyOutputManifest()
  }

  const artifacts: Record<string, OutputArtifactManifest> = {}
  for (const [name, artifact] of Object.entries(raw.artifacts)) {
    if (!isObject(artifact)) continue
    if (
      typeof artifact.object_key !== 'string' ||
      typeof artifact.checksum_sha256 !== 'string' ||
      typeof artifact.content_type !== 'string' ||
      typeof artifact.format !== 'string'
    ) {
      continue
    }
    artifacts[name] = artifact as unknown as OutputArtifactManifest
  }
  return { schema_version: '1', artifacts }
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

  const artifacts: Record<string, OutputArtifactManifest> = {}
  for (const [name, artifact] of Object.entries(rawArtifacts)) {
    if (!isObject(artifact)) continue
    if (
      typeof artifact.object_key !== 'string' ||
      typeof artifact.checksum_sha256 !== 'string' ||
      typeof artifact.content_type !== 'string' ||
      typeof artifact.format !== 'string'
    ) {
      continue
    }
    artifacts[name] = artifact as unknown as OutputArtifactManifest
  }
  return artifacts
}

export const outputManifestJson = (value: OutputManifest) => JSON.stringify(value) as Json
