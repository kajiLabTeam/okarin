import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationBuildingsRoute } from './list-organization-buildings.js'

const { listOrganizationBuildingsForSessionMock } = vi.hoisted(() => ({
  listOrganizationBuildingsForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  listOrganizationBuildingsForSession: listOrganizationBuildingsForSessionMock,
}))

describe('GET /api/organizations/:organizationId/buildings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization building 一覧を返す', async () => {
    listOrganizationBuildingsForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        buildings: [
          {
            building_id: '22222222-2222-4222-8222-222222222222',
            organization_id: '11111111-1111-4111-8111-111111111111',
            name: 'Building A',
            latitude: null,
            longitude: null,
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationBuildingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      buildings: [
        {
          building_id: '22222222-2222-4222-8222-222222222222',
          organization_id: '11111111-1111-4111-8111-111111111111',
          name: 'Building A',
          latitude: null,
          longitude: null,
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    })
    expect(listOrganizationBuildingsForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    listOrganizationBuildingsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationBuildingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings'
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization がない場合は 404 を返す', async () => {
    listOrganizationBuildingsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationBuildingsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings'
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
    })
  })
})
