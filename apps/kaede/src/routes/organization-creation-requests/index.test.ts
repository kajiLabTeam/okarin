import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { organizationCreationRequestsRoutes } from './index.js'

const {
  approveOrganizationCreationRequestForAdminSessionMock,
  createOrganizationCreationRequestForSessionMock,
  getOrganizationCreationRequestForAdminSessionMock,
  listMyOrganizationCreationRequestsForSessionMock,
  rejectOrganizationCreationRequestForAdminSessionMock,
} = vi.hoisted(() => ({
  approveOrganizationCreationRequestForAdminSessionMock: vi.fn(),
  createOrganizationCreationRequestForSessionMock: vi.fn(),
  getOrganizationCreationRequestForAdminSessionMock: vi.fn(),
  listMyOrganizationCreationRequestsForSessionMock: vi.fn(),
  rejectOrganizationCreationRequestForAdminSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  approveOrganizationCreationRequestForAdminSession:
    approveOrganizationCreationRequestForAdminSessionMock,
  createOrganizationCreationRequestForSession: createOrganizationCreationRequestForSessionMock,
  getOrganizationCreationRequestForAdminSession: getOrganizationCreationRequestForAdminSessionMock,
  listMyOrganizationCreationRequestsForSession: listMyOrganizationCreationRequestsForSessionMock,
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

describe('organization creation request routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /api/organization-creation-requests creates request', async () => {
    createOrganizationCreationRequestForSessionMock.mockResolvedValue({
      ok: true,
      value: requestResponse,
    })

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request('/api/organization-creation-requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        organization_name: 'Group A',
        requested_slug: 'group-a',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(requestResponse)
    expect(createOrganizationCreationRequestForSessionMock).toHaveBeenCalledWith('session-token', {
      organization_name: 'Group A',
      requested_slug: 'group-a',
    })
  })

  it('POST /api/organization-creation-requests returns 409 for existing pending request', async () => {
    createOrganizationCreationRequestForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING',
      },
    })

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request('/api/organization-creation-requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'okarin_session=session-token',
      },
      body: JSON.stringify({
        organization_name: 'Group A',
        requested_slug: 'group-a',
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING',
      error_message: 'organization creation request already pending',
    })
  })

  it('GET /api/organization-creation-requests/me lists own requests', async () => {
    listMyOrganizationCreationRequestsForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        requests: [requestResponse],
      },
    })

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request('/api/organization-creation-requests/me', {
      headers: {
        cookie: 'okarin_session=session-token',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      requests: [requestResponse],
    })
    expect(listMyOrganizationCreationRequestsForSessionMock).toHaveBeenCalledWith('session-token')
  })

  it('GET /api/organization-creation-requests/{requestId} returns request for admin', async () => {
    getOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: true,
      value: requestResponse,
    })

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request(
      '/api/organization-creation-requests/11111111-1111-4111-8111-111111111111',
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

  it('GET /api/organization-creation-requests/{requestId} returns 404 when missing', async () => {
    getOrganizationCreationRequestForAdminSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND',
      },
    })

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request(
      '/api/organization-creation-requests/11111111-1111-4111-8111-111111111111',
      {
        headers: {
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND',
      error_message: 'organization creation request not found',
    })
  })

  it('POST /api/organization-creation-requests/{requestId}/approve approves request', async () => {
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

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request(
      '/api/organization-creation-requests/11111111-1111-4111-8111-111111111111/approve',
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

  it('POST /api/organization-creation-requests/{requestId}/reject rejects request', async () => {
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

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request(
      '/api/organization-creation-requests/11111111-1111-4111-8111-111111111111/reject',
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

    const app = createRouteTestApp('/organization-creation-requests', (resource) =>
      resource.route('/', organizationCreationRequestsRoutes)
    )
    const response = await app.request(
      '/api/organization-creation-requests/11111111-1111-4111-8111-111111111111/approve',
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
