import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationRecordingsRoute } from './list-organization-recordings.js'

const { listOrganizationRecordingsForSessionMock } = vi.hoisted(() => ({
  listOrganizationRecordingsForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  listOrganizationRecordingsForSession: listOrganizationRecordingsForSessionMock,
}))

describe('GET /api/organizations/:organizationId/recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization recording 一覧を返す', async () => {
    listOrganizationRecordingsForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: '22222222-2222-4222-8222-222222222222',
            pedestrian_id: '33333333-3333-4333-8333-333333333333',
            floor_id: '44444444-4444-4444-8444-444444444444',
            organization_id: '11111111-1111-4111-8111-111111111111',
            upload_status: 'accepted',
            upload_targets: ['acce', 'gyro'],
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationRecordingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/recordings',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recordings: [
        {
          recording_id: '22222222-2222-4222-8222-222222222222',
          pedestrian_id: '33333333-3333-4333-8333-333333333333',
          floor_id: '44444444-4444-4444-8444-444444444444',
          organization_id: '11111111-1111-4111-8111-111111111111',
          upload_status: 'accepted',
          upload_targets: ['acce', 'gyro'],
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    })
    expect(listOrganizationRecordingsForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    listOrganizationRecordingsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationRecordingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/recordings'
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization がない場合は 404 を返す', async () => {
    listOrganizationRecordingsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationRecordingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/recordings'
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
    })
  })
})
