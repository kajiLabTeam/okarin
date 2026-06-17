import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerOrganizationCreationRequestAdminRoutes } from './organization-creation-requests.js'

const {
  approveOrganizationCreationRequestForAdminSessionMock,
  getOrganizationCreationRequestForAdminSessionMock,
  listOrganizationCreationRequestsForAdminSessionMock,
  rejectOrganizationCreationRequestForAdminSessionMock,
} = vi.hoisted(() => ({
  approveOrganizationCreationRequestForAdminSessionMock: vi.fn(),
  getOrganizationCreationRequestForAdminSessionMock: vi.fn(),
  listOrganizationCreationRequestsForAdminSessionMock: vi.fn(),
  rejectOrganizationCreationRequestForAdminSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  approveOrganizationCreationRequestForAdminSession:
    approveOrganizationCreationRequestForAdminSessionMock,
  getOrganizationCreationRequestForAdminSession: getOrganizationCreationRequestForAdminSessionMock,
  listOrganizationCreationRequestsForAdminSession:
    listOrganizationCreationRequestsForAdminSessionMock,
  rejectOrganizationCreationRequestForAdminSession:
    rejectOrganizationCreationRequestForAdminSessionMock,
}))

const requestResponse = {
  request_id: '11111111-1111-4111-8111-111111111111',
  requester_user_id: '22222222-2222-4222-8222-222222222222',
  requested_organization_name: 'Group A',
  requested_slug: 'group-a',
  status: 'pending',
  reviewed_by_user_id: null,
  reviewed_at: null,
  rejected_reason: null,
  created_organization_id: null,
  created_at: '2026-06-11T00:00:00.000Z',
  updated_at: '2026-06-11T00:00:00.000Z',
}

describe('platform organization creation request routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /api/platform/organization-creation-requests lists requests', async () => {
    listOrganizationCreationRequestsForAdminSessionMock.mockResolvedValue({
      ok: true,
      value: {
        requests: [requestResponse],
      },
    })

    const app = createRouteTestApp('/platform', registerOrganizationCreationRequestAdminRoutes)
    const response = await app.request('/api/platform/organization-creation-requests', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      requests: [requestResponse],
    })
    expect(listOrganizationCreationRequestsForAdminSessionMock).toHaveBeenCalledWith(
      'session-token'
    )
  })

  it('GET /api/platform/organization-creation-requests/{requestId} returns request', async () => {
    getOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: true,
      value: requestResponse,
    })

    const app = createRouteTestApp('/platform', registerOrganizationCreationRequestAdminRoutes)
    const response = await app.request(
      '/api/platform/organization-creation-requests/11111111-1111-4111-8111-111111111111',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(requestResponse)
    expect(getOrganizationCreationRequestForAdminSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('POST /api/platform/organization-creation-requests/{requestId}/approve approves request', async () => {
    approveOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: true,
      value: {
        ...requestResponse,
        status: 'approved',
        reviewed_by_user_id: '33333333-3333-4333-8333-333333333333',
        reviewed_at: '2026-06-11T00:00:00.000Z',
        created_organization_id: '44444444-4444-4444-8444-444444444444',
      },
    })

    const app = createRouteTestApp('/platform', registerOrganizationCreationRequestAdminRoutes)
    const response = await app.request(
      '/api/platform/organization-creation-requests/11111111-1111-4111-8111-111111111111/approve',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          slug: 'approved-org',
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(approveOrganizationCreationRequestForAdminSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      {
        slug: 'approved-org',
      }
    )
  })

  it('POST /api/platform/organization-creation-requests/{requestId}/reject rejects request', async () => {
    rejectOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: true,
      value: {
        ...requestResponse,
        status: 'rejected',
        reviewed_by_user_id: '33333333-3333-4333-8333-333333333333',
        reviewed_at: '2026-06-11T00:00:00.000Z',
        rejected_reason: 'not enough detail',
      },
    })

    const app = createRouteTestApp('/platform', registerOrganizationCreationRequestAdminRoutes)
    const response = await app.request(
      '/api/platform/organization-creation-requests/11111111-1111-4111-8111-111111111111/reject',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          reason: 'not enough detail',
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(rejectOrganizationCreationRequestForAdminSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      {
        reason: 'not enough detail',
      }
    )
  })

  it('approve returns 409 when slug is already used', async () => {
    approveOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
      },
    })

    const app = createRouteTestApp('/platform', registerOrganizationCreationRequestAdminRoutes)
    const response = await app.request(
      '/api/platform/organization-creation-requests/11111111-1111-4111-8111-111111111111/approve',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
        body: JSON.stringify({
          slug: 'used-slug',
        }),
      }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
      error_message: 'organization slug already exists',
    })
  })
})
