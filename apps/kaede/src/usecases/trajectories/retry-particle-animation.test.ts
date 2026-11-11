import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { ArtifactRetryError } from '../../services/nozomi/nozomi-execution-client.js'
import { retryParticleAnimation } from './retry-particle-animation.js'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  manifest: vi.fn(),
  upload: vi.fn(),
  retry: vi.fn(),
  merge: vi.fn(),
}))
vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: mocks.find,
  findTrajectoryOutputManifestById: mocks.manifest,
}))
vi.mock('../../services/nozomi/nozomi-execution-client.js', async (original) => ({
  ...(await original()),
  retryParticleAnimationInNozomi: mocks.retry,
}))
vi.mock('../../services/storage/presigned-url.js', () => ({
  issueInternalPositioningAnalysisArtifactUploadUrl: mocks.upload,
}))
vi.mock('../../services/analysis-runs/positioning-analysis-callback-repository.js', () => ({
  mergePositioningRunItemOutputManifest: mocks.merge,
}))
vi.mock('../../services/db/index.js', () => ({
  db: { transaction: () => ({ execute: (fn: (transaction: object) => unknown) => fn({}) }) },
}))

const actor: RequestActor = {
  type: 'user',
  user_id: 'user',
  email: 'test@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: 'org', organization_name: 'Org', role: 'manager' }],
}
const video = {
  object_key: 'video.webm',
  content_type: 'video/webm',
  format: 'webm',
  available: false,
  generation_status: 'failed',
  generation_attempt: 0,
  retry_available: true,
}
const trajectory = {
  id: 'trajectory',
  organization_id: 'org',
  status: 'completed',
  execution: { analysis_run_id: 'run', analysis_run_item_id: 'item' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue(trajectory)
  mocks.manifest.mockResolvedValue({ artifacts: { particle_animation: video } })
  mocks.upload.mockImplementation((_org, _run, _item, _name, format) =>
    Promise.resolve({
      uploadUrl: `https://storage/fresh.${format}`,
      objectKey: `video.${format}`,
    })
  )
  mocks.retry.mockResolvedValue({ generation_attempt: 1 })
})

describe('retryParticleAnimation', () => {
  it('新しい動画用URLを発行し、軌跡は完了のまま生成中に更新する', async () => {
    expect(await retryParticleAnimation(actor, 'trajectory')).toEqual({
      ok: true,
      value: {
        trajectory_id: 'trajectory',
        generation_status: 'processing',
        generation_attempt: 1,
      },
    })
    expect(mocks.retry).toHaveBeenCalledWith('item', {
      particle_animation: {
        upload_uri: 'https://storage/fresh.webm',
        object_key: 'video.webm',
        content_type: 'video/webm',
        format: 'webm',
      },
      particle_animation_mp4: {
        upload_uri: 'https://storage/fresh.mp4',
        object_key: 'video.mp4',
        content_type: 'video/mp4',
        format: 'mp4',
        manifest_name: 'particle_animation',
      },
    })
    expect(mocks.merge).toHaveBeenCalledWith(
      'item',
      { particle_animation: { ...video, generation_status: 'processing', generation_attempt: 1 } },
      expect.anything()
    )
    expect(trajectory.status).toBe('completed')
  })
  it('他組織のユーザーには成果物の参照や生成を許可しない', async () => {
    const result = await retryParticleAnimation({ ...actor, memberships: [] }, 'trajectory')
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(mocks.manifest).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.retry).not.toHaveBeenCalled()
  })
  it.each([
    null,
    { ...video, retry_available: false },
    { ...video, available: true, generation_status: undefined },
  ])('再生成できない動画を拒否する (%j)', async (value) => {
    mocks.manifest.mockResolvedValue({ artifacts: value ? { particle_animation: value } : {} })
    expect(await retryParticleAnimation(actor, 'trajectory')).toMatchObject({
      ok: false,
      status: 409,
    })
    expect(mocks.retry).not.toHaveBeenCalled()
  })
  it('旧方式の軌跡には再生成を許可しない', async () => {
    mocks.find.mockResolvedValue({ ...trajectory, execution: null })
    expect(await retryParticleAnimation(actor, 'trajectory')).toMatchObject({
      ok: false,
      status: 409,
    })
  })
  it('存在しない軌跡は404にする', async () => {
    mocks.find.mockResolvedValue(undefined)
    expect(await retryParticleAnimation(actor, 'missing')).toMatchObject({ ok: false, status: 404 })
  })
  it.each([409, 502])('Nozomiの拒否・接続失敗時には生成中に更新しない (%s)', async (status) => {
    mocks.retry.mockRejectedValue(new ArtifactRetryError(status, 'unavailable'))
    expect(await retryParticleAnimation(actor, 'trajectory')).toMatchObject({ ok: false, status })
    expect(mocks.merge).not.toHaveBeenCalled()
  })
})
