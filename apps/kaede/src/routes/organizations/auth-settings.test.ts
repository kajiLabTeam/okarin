import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'

const mocks = vi.hoisted(() => ({
  getOrganizationAuthSettings: vi.fn(),
  patchOrganizationAuthSettings: vi.fn(),
}))

vi.mock('../../usecases/organization-auth-settings/index.js', () => mocks)

import { registerOrganizationAuthSettingsRoutes } from './auth-settings.js'

const organizationId = '11111111-1111-4111-8111-111111111111'
const response = {
  organization_id: organizationId,
  local_auth_enabled: true,
  oidc_auth_enabled: false,
  policy_version: 1,
  membership_grant_ttl_seconds: 28_800,
  reauthentication_interval_seconds: 14_400,
  created_at: '2026-08-11T00:00:00.000Z',
  updated_at: '2026-08-11T00:00:00.000Z',
}
const actor: RequestActor = {
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Example', role: 'owner' }],
}

const app = createRouteTestApp('/organizations', registerOrganizationAuthSettingsRoutes, { actor })

describe('organization auth settings routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GETでowner向け認証設定を返す', async () => {
    mocks.getOrganizationAuthSettings.mockResolvedValue({ ok: true, value: response })

    const result = await app.request(`/api/organizations/${organizationId}/auth-settings`)

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual(response)
    expect(mocks.getOrganizationAuthSettings).toHaveBeenCalledWith(actor, organizationId)
  })

  it('PATCHで部分更新requestをusecaseへ渡す', async () => {
    mocks.patchOrganizationAuthSettings.mockResolvedValue({
      ok: true,
      value: { ...response, policy_version: 2, membership_grant_ttl_seconds: 36_000 },
    })

    const result = await app.request(`/api/organizations/${organizationId}/auth-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ membership_grant_ttl_seconds: 36_000 }),
    })

    expect(result.status).toBe(200)
    expect(mocks.patchOrganizationAuthSettings).toHaveBeenCalledWith(actor, organizationId, {
      membership_grant_ttl_seconds: 36_000,
    })
  })

  it('OIDC Provider不足をtyped 422 errorで返す', async () => {
    mocks.patchOrganizationAuthSettings.mockResolvedValue({
      ok: false,
      error: { type: 'OIDC_PROVIDER_REQUIRED' },
    })

    const result = await app.request(`/api/organizations/${organizationId}/auth-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oidc_auth_enabled: true }),
    })

    expect(result.status).toBe(422)
    await expect(result.json()).resolves.toEqual({
      error_code: 'OIDC_PROVIDER_REQUIRED',
      error_message: 'an enabled OIDC provider is required before enabling OIDC',
    })
  })

  it('active ownerでなければtyped 403 errorを返す', async () => {
    mocks.getOrganizationAuthSettings.mockResolvedValue({
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    })

    const result = await app.request(`/api/organizations/${organizationId}/auth-settings`)

    expect(result.status).toBe(403)
    await expect(result.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'active owner permission is required',
    })
  })

  it('空PATCHを400で拒否してusecaseを呼ばない', async () => {
    const result = await app.request(`/api/organizations/${organizationId}/auth-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(result.status).toBe(400)
    expect(mocks.patchOrganizationAuthSettings).not.toHaveBeenCalled()
  })
})
