import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerCreateOrganizationUserActivationLinkRoute } from './create-organization-user-activation-link.js'

const { createOrganizationUserActivationLinkForSessionMock } = vi.hoisted(() => ({
  createOrganizationUserActivationLinkForSessionMock: vi.fn(),
}))

vi.mock('../../usecases/organizations/index.js', () => ({
  createOrganizationUserActivationLinkForSession:
    createOrganizationUserActivationLinkForSessionMock,
}))

describe('POST /api/organizations/:organizationId/users/:userId/activation-link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('organization user activation link を発行して返す', async () => {
    createOrganizationUserActivationLinkForSessionMock.mockResolvedValue({
      ok: true,
      value: {
        activation_url: 'https://dashboard.example.test/auth/activate?token=abc123',
        expires_at: '2026-06-18T00:00:00.000Z',
      },
    })

    const app = createRouteTestApp(
      '/organizations',
      registerCreateOrganizationUserActivationLinkRoute
    )
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users/22222222-2222-4222-8222-222222222222/activation-link',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activation_url: 'https://dashboard.example.test/auth/activate?token=abc123',
      expires_at: '2026-06-18T00:00:00.000Z',
    })
    expect(createOrganizationUserActivationLinkForSessionMock).toHaveBeenCalledWith(
      'session-token',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  })

  it('organization user が pending_activation でない場合は 409 を返す', async () => {
    createOrganizationUserActivationLinkForSessionMock.mockResolvedValue({
      ok: false,
      error: {
        type: 'ORGANIZATION_USER_NOT_PENDING_ACTIVATION',
      },
    })

    const app = createRouteTestApp(
      '/organizations',
      registerCreateOrganizationUserActivationLinkRoute
    )
    const response = await app.request(
      '/api/organizations/11111111-1111-4111-8111-111111111111/users/22222222-2222-4222-8222-222222222222/activation-link',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'okarin_session=session-token',
        },
      }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'ORGANIZATION_USER_NOT_PENDING_ACTIVATION',
      error_message: 'organization user is not pending activation',
    })
  })
})
