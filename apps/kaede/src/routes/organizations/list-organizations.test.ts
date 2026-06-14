import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerListOrganizationsRoute } from './list-organizations.js'

const { listOrganizationsForSessionMock } = vi.hoisted(() => ({
  listOrganizationsForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  listOrganizationsForSession: listOrganizationsForSessionMock,
}))

describe('GET /api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization 一覧を返す', async () => {
    listOrganizationsForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        organizations: [
          {
            organization_id: '11111111-1111-4111-8111-111111111111',
            name: 'Group A',
            created_at: '2026-06-11T00:00:00.000Z',
            updated_at: '2026-06-11T00:00:00.000Z',
          },
        ],
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationsRoute)
    const response = await app.request('/api/organizations', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      organizations: [
        {
          organization_id: '11111111-1111-4111-8111-111111111111',
          name: 'Group A',
          created_at: '2026-06-11T00:00:00.000Z',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
    })
    expect(listOrganizationsForSessionMock).toHaveBeenCalledWith('session-token')
  })

  it('未ログイン時 401 を返す', async () => {
    listOrganizationsForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'AUTH_UNAUTHENTICATED',
      },
    })

    const app = createRouteTestApp('/organizations', registerListOrganizationsRoute)
    const response = await app.request('/api/organizations')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
  })
})
