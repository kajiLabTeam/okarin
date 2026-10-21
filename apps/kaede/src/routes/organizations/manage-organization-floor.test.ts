import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerManageOrganizationFloorRoute } from './manage-organization-floor.js'

const managerActor: RequestActor = {
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const { deleteFloorMock, updateFloorMock } = vi.hoisted(() => ({
  deleteFloorMock: vi.fn(),
  updateFloorMock: vi.fn(),
}))

vi.mock('../../usecases/floors/delete-floor.js', () => ({ deleteFloor: deleteFloorMock }))
vi.mock('../../usecases/floors/update-floor.js', () => ({ updateFloor: updateFloorMock }))

const organizationId = '99999999-9999-4999-8999-999999999999'
const floorId = '33333333-3333-4333-8333-333333333333'

describe('organization floor management routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('PATCH で floor の設定を更新する', async () => {
    updateFloorMock.mockResolvedValue({
      ok: true,
      value: {
        floor_id: floorId,
        building_id: '22222222-2222-4222-8222-222222222222',
        organization_id: organizationId,
        building_name: 'Test Building',
        level: 2,
        name: '2F',
        scale: 0.01,
        map_image: {
          download_url: 'https://storage.example.test/maps/floor.png',
          download_expires_at: '2026-05-13T01:00:00.000Z',
          content_type: 'image/png',
          extension: 'png',
        },
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/organizations', registerManageOrganizationFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/organizations/${organizationId}/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '2F', level: 2 }),
    })

    expect(response.status).toBe(200)
    expect(updateFloorMock).toHaveBeenCalledWith(managerActor, organizationId, floorId, {
      name: '2F',
      level: 2,
    })
  })

  it('DELETE で floor を非表示にする', async () => {
    deleteFloorMock.mockResolvedValue({ ok: true })

    const app = createRouteTestApp('/organizations', registerManageOrganizationFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/organizations/${organizationId}/floors/${floorId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
    expect(deleteFloorMock).toHaveBeenCalledWith(managerActor, organizationId, floorId)
  })

  it('空のPATCH bodyは400でusecaseを呼ばない', async () => {
    const app = createRouteTestApp('/organizations', registerManageOrganizationFloorRoute, {
      actor: managerActor,
    })
    const response = await app.request(`/api/organizations/${organizationId}/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(updateFloorMock).not.toHaveBeenCalled()
  })
})
