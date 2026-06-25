import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationFloorsRoute } from './list-organization-floors.js'

const { listOrganizationFloorsForSessionMock } = vi.hoisted(() => ({
  listOrganizationFloorsForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  listOrganizationFloorsForSession: listOrganizationFloorsForSessionMock,
}))

describe('GET /api/organizations/:organizationId/floors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization floor 一覧を返す', async () => {
    listOrganizationFloorsForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        floors: [
          {
            floor_id: '33333333-3333-4333-8333-333333333333',
            building_id: '22222222-2222-4222-8222-222222222222',
            organization_id: '11111111-1111-4111-8111-111111111111',
            building_name: 'Building A',
            level: 1,
            name: '1F',
            scale: null,
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationFloorsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/floors',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      floors: [
        {
          floor_id: '33333333-3333-4333-8333-333333333333',
          building_id: '22222222-2222-4222-8222-222222222222',
          organization_id: '11111111-1111-4111-8111-111111111111',
          building_name: 'Building A',
          level: 1,
          name: '1F',
          scale: null,
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    })
    expect(listOrganizationFloorsForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    listOrganizationFloorsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationFloorsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/floors'
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization がない場合は 404 を返す', async () => {
    listOrganizationFloorsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationFloorsRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/floors'
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
    })
  })
})
