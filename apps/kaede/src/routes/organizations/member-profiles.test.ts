import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerOrganizationMemberProfileRoutes } from './member-profiles.js'

const mocks = vi.hoisted(() => ({
  getMyOrganizationMemberProfile: vi.fn(),
  updateMyOrganizationMemberProfile: vi.fn(),
  updateOrganizationMemberProfile: vi.fn(),
}))

vi.mock('../../usecases/profiles/index.js', () => mocks)

const organizationId = '11111111-1111-4111-8111-111111111111'
const membershipId = '22222222-2222-4222-8222-222222222222'
const actor: RequestActor = {
  type: 'user',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Example', role: 'manager' }],
}

const profile = {
  organization_id: organizationId,
  membership_id: membershipId,
  global: { display_name: 'Alice' },
  override: { display_name: null, height_meters: 1.705, stride_length_meters: 0.72 },
  effective: { display_name: 'Alice', display_name_source: 'global' },
  updated_at: '2026-08-11T00:00:00.000Z',
}

describe('organization member profile routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('本人の共通・override・実効Profileを返す', async () => {
    mocks.getMyOrganizationMemberProfile.mockResolvedValue({ ok: true, value: profile })
    const app = createRouteTestApp('/organizations', registerOrganizationMemberProfileRoutes, {
      actor,
    })

    const response = await app.request(`/api/organizations/${organizationId}/members/me/profile`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(profile)
    expect(mocks.getMyOrganizationMemberProfile).toHaveBeenCalledWith(actor, organizationId)
  })

  it('managerによる第三者更新をmembership IDで処理する', async () => {
    mocks.updateOrganizationMemberProfile.mockResolvedValue({
      ok: true,
      value: {
        ...profile,
        override: { ...profile.override, display_name: 'Managed' },
        effective: { display_name: 'Managed', display_name_source: 'organization_override' },
        update_context: { kind: 'forced', actor_role: 'manager' },
      },
    })
    const app = createRouteTestApp('/organizations', registerOrganizationMemberProfileRoutes, {
      actor,
    })

    const response = await app.request(
      `/api/organizations/${organizationId}/members/${membershipId}/profile`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: 'Managed' }),
      }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateOrganizationMemberProfile).toHaveBeenCalledWith(
      actor,
      organizationId,
      membershipId,
      { display_name: 'Managed' }
    )
  })

  it('height_metersが3mを超えるrequestを400で拒否する', async () => {
    const app = createRouteTestApp('/organizations', registerOrganizationMemberProfileRoutes, {
      actor,
    })

    const response = await app.request(`/api/organizations/${organizationId}/members/me/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ height_meters: 170.5 }),
    })

    expect(response.status).toBe(400)
    expect(mocks.updateMyOrganizationMemberProfile).not.toHaveBeenCalled()
  })
})
