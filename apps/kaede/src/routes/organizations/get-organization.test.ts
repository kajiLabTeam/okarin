import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerGetOrganizationRoute } from './get-organization.js'

const { getOrganizationForSessionMock } = vi.hoisted(() => ({
  getOrganizationForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  getOrganizationForSession: getOrganizationForSessionMock,
}))

describe('GET /api/organizations/:organizationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization を返す', async () => {
    getOrganizationForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        organization_id: '11111111-1111-4111-8111-111111111111',
        name: 'Group A',
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationRoute)
    const response = await app.request('/api/organizations/11111111-1111-4111-8111-111111111111', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      organization_id: '11111111-1111-4111-8111-111111111111',
      name: 'Group A',
      created_at: '2026-06-11T00:00:00.000Z',
      updated_at: '2026-06-11T00:00:00.000Z',
    })
    expect(getOrganizationForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('未ログイン時 401 を返す', async () => {
    getOrganizationForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationRoute)
    const response = await app.request('/api/organizations/11111111-1111-4111-8111-111111111111')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })

  it('organization がない場合は 404 を返す', async () => {
    getOrganizationForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organizations', registerGetOrganizationRoute)
    const response = await app.request('/api/organizations/11111111-1111-4111-8111-111111111111')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_NOT_FOUND',
      error_message: 'organization not found',
    })
  })
})
