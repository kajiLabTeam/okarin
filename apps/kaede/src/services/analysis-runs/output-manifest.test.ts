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

describe('background video manifest', () => {
  const pending = {
    object_key: 'video.webm',
    content_type: 'video/webm',
    format: 'webm',
    available: false,
    generation_status: 'processing' as const,
  }

  it('生成中の動画にはchecksumがなくても受理する', () => {
    expect(
      outputArtifactsFromCallback({
        output_manifest: { schema_version: '1', artifacts: { particle_animation: pending } },
      })
    ).toEqual({ particle_animation: pending })
    expect(
      outputArtifactsFromCallback({
        output_manifest: {
          schema_version: '1',
          artifacts: { particle_animation: { ...pending, available: true } },
        },
      })
    ).toEqual({})
  })

  it.each(['ready', 'failed'])('遅れて届いた生成中通知が%sの動画を上書きしない', (state) => {
    const finished =
      state === 'ready'
        ? { ...artifact, available: true }
        : { ...pending, generation_status: 'failed' as const }
    const current = mergeOutputManifest({}, { particle_animation: finished })
    expect(
      mergeOutputManifest(current, { particle_animation: pending }).artifacts.particle_animation
    ).toEqual(finished)
  })

  it('動画完成通知で生成中の状態を置き換える', () => {
    const current = mergeOutputManifest({}, { particle_animation: pending })
    const ready = { ...artifact, available: true }
    expect(
      mergeOutputManifest(current, { particle_animation: ready }).artifacts.particle_animation
    ).toEqual(ready)
  })
})

describe('video retry attempt ordering', () => {
  const failed = {
    ...artifact,
    available: false,
    generation_status: 'failed' as const,
    generation_attempt: 1,
  }
  it('新しい試行なら失敗から生成中へ進める', () => {
    const current = mergeOutputManifest({}, { particle_animation: failed })
    const retry = { ...failed, generation_status: 'processing' as const, generation_attempt: 2 }
    expect(
      mergeOutputManifest(current, { particle_animation: retry }).artifacts.particle_animation
    ).toEqual(retry)
  })
  it.each(['processing', 'failed', 'ready'])(
    '古い試行の%s通知で新しい動画を上書きしない',
    (status) => {
      const current = mergeOutputManifest(
        {},
        { particle_animation: { ...artifact, available: true, generation_attempt: 2 } }
      )
      const late = {
        ...failed,
        ...(status === 'ready'
          ? { generation_status: undefined, available: true }
          : { generation_status: status as 'processing' | 'failed' }),
      }
      expect(mergeOutputManifest(current, { particle_animation: late })).toEqual(current)
    }
  )
})
