import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendFile: vi.fn(),
  countInFlightTrajectories: vi.fn().mockResolvedValue(0),
  listFloorMapMigrationRows: vi.fn().mockResolvedValue([]),
  listTrajectoryResultMigrationRows: vi.fn().mockResolvedValue([]),
  s3Send: vi.fn(),
  switchFloorMapPath: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  appendFile: mocks.appendFile,
  readFile: vi.fn(),
}))

vi.mock('../config/runtime.js', () => ({
  getAppRuntimeConfig: () => ({ env: 'test', revision: 'test-revision' }),
}))

vi.mock('../services/storage/s3-client.js', () => ({
  getS3Context: () => ({
    config: { bucket: 'test-bucket' },
    internalClient: { send: mocks.s3Send },
  }),
}))

vi.mock('../services/storage-prefix-migration/repository.js', () => ({
  countInFlightTrajectories: mocks.countInFlightTrajectories,
  listFloorMapMigrationRows: mocks.listFloorMapMigrationRows,
  listTrajectoryResultMigrationRows: mocks.listTrajectoryResultMigrationRows,
  switchFloorMapPath: mocks.switchFloorMapPath,
}))

import { main, parseOptions } from './storage-prefix-migration.js'

const organizationId = '11111111-1111-4111-8111-111111111111'
const floorId = '22222222-2222-4222-8222-222222222222'
const buildingId = '33333333-3333-4333-8333-333333333333'
const trajectoryId = '44444444-4444-4444-8444-444444444444'

describe('storage-prefix-migration options', () => {
  it('copy options を解析する', () => {
    expect(
      parseOptions([
        'copy',
        '--resource',
        'floor-maps',
        '--dry-run',
        '--organization-id',
        '11111111-1111-4111-8111-111111111111',
        '--limit',
        '25',
        '--concurrency',
        '2',
        '--retries',
        '4',
        '--manifest',
        '/tmp/migration.jsonl',
      ])
    ).toMatchObject({
      command: 'copy',
      resource: 'floor-maps',
      dryRun: true,
      organizationId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
      concurrency: 2,
      retries: 4,
      manifest: '/tmp/migration.jsonl',
    })
  })

  it('copy では resource を必須にする', () => {
    expect(() => parseOptions(['copy'])).toThrow(/usage/)
  })

  it('並列数の不正値を拒否する', () => {
    expect(() => parseOptions(['plan', '--concurrency', '0'])).toThrow(
      '--concurrency must be positive'
    )
  })
})

describe('storage-prefix-migration execution', () => {
  it('resourceの失敗を記録した場合はcommand全体も失敗させる', async () => {
    mocks.listTrajectoryResultMigrationRows.mockResolvedValueOnce([
      {
        resourceType: 'trajectory_result',
        resourceId: trajectoryId,
        organizationId,
        status: 'completed',
        deletedAt: null,
        sourceKey: `trajectories/${trajectoryId}/analyzed/result.csv`,
      },
    ])
    mocks.s3Send.mockRejectedValue({ name: 'NoSuchKey' })

    await expect(main(['plan', '--resource', 'trajectory-results'])).rejects.toThrow(
      'storage prefix migration failed for 1 resource(s)'
    )
    expect(mocks.appendFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"status":"failed"'),
      expect.any(Object)
    )
  })

  it('verifyではfloorのDB参照先も新keyであることを確認する', async () => {
    mocks.listFloorMapMigrationRows.mockResolvedValueOnce([
      {
        resourceType: 'floor_map',
        resourceId: floorId,
        organizationId,
        buildingId,
        sourceKey: `maps/${buildingId}/${floorId}.png`,
        currentKey: `maps/${buildingId}/${floorId}.png`,
      },
    ])
    mocks.s3Send.mockResolvedValue({ ContentLength: 10, ContentType: 'image/png' })

    await expect(main(['verify', '--resource', 'floor-maps'])).rejects.toThrow(
      'storage prefix migration failed for 1 resource(s)'
    )
    expect(mocks.appendFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('floor image_object_path does not reference destination'),
      expect.any(Object)
    )
  })
})
