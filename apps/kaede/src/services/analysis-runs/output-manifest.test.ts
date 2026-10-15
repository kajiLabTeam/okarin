import { describe, expect, it } from 'vitest'
import {
  emptyOutputManifest,
  mergeOutputManifest,
  outputArtifactsFromCallback,
  parseOutputManifest,
} from './output-manifest.js'

const artifact = {
  object_key: 'organizations/org/items/item/diagnostics.json',
  checksum_sha256: 'a'.repeat(64),
  content_type: 'application/json',
  format: 'json',
} as const

describe('output manifest', () => {
  it('空のmanifestを生成できる', () => {
    expect(emptyOutputManifest()).toEqual({ schema_version: '1', artifacts: {} })
  })

  it('artifactを追加して既存artifactを保持する', () => {
    const first = mergeOutputManifest({}, { diagnostics: artifact })
    const second = mergeOutputManifest(first, {
      particle_animation: { ...artifact, format: 'webm', content_type: 'video/webm' },
    })

    expect(Object.keys(second.artifacts)).toEqual(['diagnostics', 'particle_animation'])
  })

  it('callback outputsからoutput_manifestだけを抽出する', () => {
    expect(
      outputArtifactsFromCallback({
        digest: 'ignored',
        output_manifest: { schema_version: '1', artifacts: { diagnostics: artifact } },
      })
    ).toEqual({ diagnostics: artifact })
  })

  it('不正なmanifestは空として扱う', () => {
    expect(parseOutputManifest({ schema_version: '2', artifacts: {} })).toEqual(
      emptyOutputManifest()
    )
  })
})
