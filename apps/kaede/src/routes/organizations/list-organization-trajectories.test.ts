import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationTrajectoriesRoute } from './list-organization-trajectories.js'

const { listOrganizationTrajectoriesForSessionMock } = vi.hoisted(() => ({
  listOrganizationTrajectoriesForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  listOrganizationTrajectoriesForSession: listOrganizationTrajectoriesForSessionMock,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'

describe('GET /api/organizations/:organizationId/trajectories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization trajectory 一覧を返す', async () => {
    listOrganizationTrajectoriesForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        trajectories: [
          {
            trajectory_id: '22222222-2222-4222-8222-222222222222',
            recording_id: '33333333-3333-4333-8333-333333333333',
            floor_id: '44444444-4444-4444-8444-444444444444',
            organization_id: organizationId,
            status: 'completed',
            created_at: '2026-07-28T00:00:00.000Z',
            updated_at: '2026-07-28T00:01:00.000Z',
          },
        ],
        pagination: {
          next_cursor: null,
          total_count: 1,
        },
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request(
      `/api/organizations/${organizationId}/trajectories?limit=10&cursor=opaque-cursor`,
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      trajectories: [
        {
          trajectory_id: '22222222-2222-4222-8222-222222222222',
          recording_id: '33333333-3333-4333-8333-333333333333',
          floor_id: '44444444-4444-4444-8444-444444444444',
          organization_id: organizationId,
          status: 'completed',
          created_at: '2026-07-28T00:00:00.000Z',
          updated_at: '2026-07-28T00:01:00.000Z',
        },
      ],
      pagination: {
        next_cursor: null,
        total_count: 1,
      },
    })
    expect(listOrganizationTrajectoriesForSessionMock).toHaveBeenCalledWith(
      'session-token',
      organizationId,
      { limit: 10, cursor: 'opaque-cursor' }
    )
  })

  it('query を省略すると limit=20 を渡す', async () => {
    listOrganizationTrajectoriesForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        trajectories: [],
        pagination: {
          next_cursor: null,
          total_count: 0,
        },
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request(`/api/organizations/${organizationId}/trajectories`)

    expect(response.status).toBe(200)
    expect(listOrganizationTrajectoriesForSessionMock).toHaveBeenCalledWith(
      undefined,
      organizationId,
      { limit: 20 }
    )
  })

  it('pagination query が不正な場合は 400 を返す', async () => {
    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request(
      `/api/organizations/${organizationId}/trajectories?limit=101`
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PAGINATION_QUERY_INVALID',
      error_message: 'pagination query is invalid',
    })
    expect(listOrganizationTrajectoriesForSessionMock).not.toHaveBeenCalled()
  })

  it('organizationId が UUID でない場合は 400 を返す', async () => {
    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request('/api/organizations/not-a-uuid/trajectories')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'REQUEST_PARAMS_INVALID',
      error_message: 'request parameters are invalid',
    })
    expect(listOrganizationTrajectoriesForSessionMock).not.toHaveBeenCalled()
  })

  it('不正な cursor は 400 を返す', async () => {
    listOrganizationTrajectoriesForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'PAGINATION_CURSOR_INVALID',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request(`/api/organizations/${organizationId}/trajectories`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error_code: 'PAGINATION_CURSOR_INVALID',
      error_message: 'pagination cursor is invalid',
    })
  })

  it.each([
    ['AUTH_UNAUTHENTICATED', 401, 'login required'],
    ['AUTH_FORBIDDEN', 403, 'permission denied'],
    ['ORGANIZATION_NOT_FOUND', 404, 'organization not found'],
  ] as const)('%s は %i を返す', async (type, status, message) => {
    listOrganizationTrajectoriesForSessionMock.mockResolvedValue({
      ok: false,
      error: { type },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationTrajectoriesRoute)
    const response = await app.request(`/api/organizations/${organizationId}/trajectories`)

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({
      error_code: type,
      error_message: message,
    })
  })
})
