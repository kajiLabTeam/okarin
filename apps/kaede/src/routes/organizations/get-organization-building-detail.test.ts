import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetOrganizationBuildingDetailRoute } from './get-organization-building-detail.js'

const { getOrganizationBuildingDetailForSessionMock } = vi.hoisted(() => ({
  getOrganizationBuildingDetailForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  getOrganizationBuildingDetailForSession: getOrganizationBuildingDetailForSessionMock,
}))

describe('GET /api/organizations/:organizationId/buildings/:buildingId/detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('building summary と floor ごとの recording 件数を返す', async () => {
    getOrganizationBuildingDetailForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        building: {
          building_id: '22222222-2222-4222-8222-222222222222',
          organization_id: '11111111-1111-4111-8111-111111111111',
          name: 'Building A',
          latitude: null,
          longitude: null,
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
        summary: {
          floor_count: 1,
          recording_count: 2,
        },
        floors: [
          {
            floor_id: '33333333-3333-4333-8333-333333333333',
            building_id: '22222222-2222-4222-8222-222222222222',
            organization_id: '11111111-1111-4111-8111-111111111111',
            name: '1F',
            level: 1,
            recording_count: 2,
            map_image: {
              download_url: 'https://storage.example.test/maps/floor.png',
              download_expires_at: '2026-06-11T01:00:00.000Z',
              content_type: 'image/png',
              extension: 'png',
            },
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationBuildingDetailRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings/22222222-2222-4222-8222-222222222222/detail',
      {
        headers: { cookie: 'okarin_session=session-token' },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      summary: { floor_count: 1, recording_count: 2 },
      floors: [{ name: '1F', recording_count: 2 }],
    })
    expect(getOrganizationBuildingDetailForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    getOrganizationBuildingDetailForSessionMock.mockResolvedValue({
      ok: false,
      error: { type: 'AUTH_UNAUTHENTICATED' },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationBuildingDetailRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings/22222222-2222-4222-8222-222222222222/detail'
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('別 organization の building は 404 を返す', async () => {
    getOrganizationBuildingDetailForSessionMock.mockResolvedValue({
      ok: false,
      error: { type: 'BUILDING_NOT_FOUND' },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationBuildingDetailRoute)
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/buildings/22222222-2222-4222-8222-222222222222/detail'
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'BUILDING_NOT_FOUND',
      error_message: 'building not found',
    })
  })
})
