import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { organizationCreationRequestsRoutes } from './index.js'

const {
  createOrganizationCreationRequestForSessionMock,
  listMyOrganizationCreationRequestsForSessionMock,
} = vi.hoisted(() => ({
  createOrganizationCreationRequestForSessionMock: vi.fn(),
  listMyOrganizationCreationRequestsForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  createOrganizationCreationRequestForSession: createOrganizationCreationRequestForSessionMock,
  listMyOrganizationCreationRequestsForSession: listMyOrganizationCreationRequestsForSessionMock,
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
})
