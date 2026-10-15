import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRequestActor } from '../../middleware/request-actor-context.js'

const {
  findTrajectoryByIdMock,
  findTrajectoryOutputManifestByIdMock,
  issueTrajectoryResultDownloadUrlMock,
  issuePositioningAnalysisArtifactDownloadUrlMock,
} = vi.hoisted(() => ({
  findTrajectoryByIdMock: vi.fn(),
  findTrajectoryOutputManifestByIdMock: vi.fn(),
  issueTrajectoryResultDownloadUrlMock: vi.fn(),
  issuePositioningAnalysisArtifactDownloadUrlMock: vi.fn(),
}))

vi.mock('../../services/trajectories/index.js', () => ({
  findTrajectoryById: findTrajectoryByIdMock,
  findTrajectoryOutputManifestById: findTrajectoryOutputManifestByIdMock,
}))

vi.mock('../../services/storage/index.js', () => ({
  issueTrajectoryResultDownloadUrl: issueTrajectoryResultDownloadUrlMock,
  issuePositioningAnalysisArtifactDownloadUrl: issuePositioningAnalysisArtifactDownloadUrlMock,
}))

import { getTrajectoryResult } from './get-trajectory-result.js'

const managerActor: UserRequestActor = {
  type: 'user',
  user_id: '99999999-9999-4999-8999-999999999999',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: '11111111-1111-4111-8111-111111111111',
      organization_name: 'Group A',
      role: 'manager',
    },
  ],
}

const memberActor: UserRequestActor = {
  ...managerActor,
  memberships: [
    {
      organization_id: '11111111-1111-4111-8111-111111111111',
      organization_name: 'Group A',
      role: 'member',
    },
  ],
}

describe('getTrajectoryResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findTrajectoryOutputManifestByIdMock.mockResolvedValue(null)
  })

  it('成果物manifestの各オブジェクトに署名付きURLを付ける', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'
    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })
    issueTrajectoryResultDownloadUrlMock.mockResolvedValue({
      downloadUrl: 'https://storage.example.test/result.csv',
      expiresAt: '2026-07-07T00:30:00.000Z',
    })
    findTrajectoryOutputManifestByIdMock.mockResolvedValue({
      schema_version: '1',
      artifacts: {
        diagnostics: {
          object_key: 'analysis/diagnostics.json',
          checksum_sha256: 'a'.repeat(64),
          content_type: 'application/json',
          format: 'json',
        },
      },
    })
    issuePositioningAnalysisArtifactDownloadUrlMock.mockResolvedValue({
      downloadUrl: 'https://storage.example.test/diagnostics.json',
      expiresAt: '2026-07-07T00:30:00.000Z',
    })

    const result = await getTrajectoryResult(managerActor, { trajectoryId })
    expect(result).toMatchObject({
      ok: true,
      value: {
        output_manifest: {
          schema_version: '1',
          artifacts: {
            diagnostics: {
              object_key: 'analysis/diagnostics.json',
              download_url: 'https://storage.example.test/diagnostics.json',
            },
          },
        },
      },
    })
  })

  it('completed trajectory の result download URL を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })
    issueTrajectoryResultDownloadUrlMock.mockResolvedValue({
      downloadUrl: 'https://storage.example.test/result.csv',
      expiresAt: '2026-07-07T00:30:00.000Z',
      objectKey: `trajectories/${trajectoryId}/analyzed/result.csv`,
    })

    const result = await getTrajectoryResult(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: true,
      value: {
        trajectory_id: trajectoryId,
        download_url: 'https://storage.example.test/result.csv',
        expires_at: '2026-07-07T00:30:00.000Z',
      },
    })
    expect(issueTrajectoryResultDownloadUrlMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      trajectoryId
    )
  })

  it('completed 以外は TRAJECTORY_RESULT_NOT_READY を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'processing',
    })

    const result = await getTrajectoryResult(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_RESULT_NOT_READY',
        trajectoryId,
        status: 'processing',
      },
    })
    expect(issueTrajectoryResultDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('member は dashboard trajectory result を取得できない', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue({
      id: trajectoryId,
      organization_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
    })

    const result = await getTrajectoryResult(memberActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
    expect(issueTrajectoryResultDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('存在しない trajectory は TRAJECTORY_NOT_FOUND を返す', async () => {
    const trajectoryId = '22222222-2222-4222-8222-222222222222'

    findTrajectoryByIdMock.mockResolvedValue(undefined)

    const result = await getTrajectoryResult(managerActor, { trajectoryId })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'TRAJECTORY_NOT_FOUND',
        trajectoryId,
      },
    })
  })
})
