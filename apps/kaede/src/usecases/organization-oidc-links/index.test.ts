import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { DbExecutor } from '../../services/executor.js'

const mocks = vi.hoisted(() => ({
  countOtherUsableOidcLinks: vi.fn(),
  findActiveMembership: vi.fn(),
  findActiveMembershipForUpdate: vi.fn(),
  findActiveOrganizationOidcLinkForUpdate: vi.fn(),
  findOrganizationAuthSettingsForUpdate: vi.fn(),
  hasEnabledLocalCredential: vi.fn(),
  insertOidcLinkAuditEvent: vi.fn(),
  insertOidcLinkAuthenticationEvent: vi.fn(),
  listActiveOrganizationOidcLinks: vi.fn(),
  revokeActiveGrantsForOidcLink: vi.fn(),
  revokeOrganizationOidcLink: vi.fn(),
}))

vi.mock('../../services/organization-oidc-links/index.js', () => mocks)
vi.mock('../../services/db/index.js', () => ({ db: {} }))

import { getMyOrganizationOidcLinks, unlinkMyOrganizationOidcIdentity } from './index.js'

const executor = {} as DbExecutor
const organizationId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const membershipId = '33333333-3333-4333-8333-333333333333'
const linkId = '44444444-4444-4444-8444-444444444444'
const providerId = '55555555-5555-4555-8555-555555555555'
const identityId = '66666666-6666-4666-8666-666666666666'
const now = new Date('2026-08-11T12:00:00.000Z')

const actor: RequestActor = {
  type: 'user',
  user_id: userId,
  email: 'member@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Example', role: 'member' }],
}

const membership = { id: membershipId, organization_id: organizationId, user_id: userId }
const link = {
  id: linkId,
  oidc_identity_id: identityId,
  provider_id: providerId,
  provider_enabled: true,
}

describe('organization OIDC link usecases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findActiveMembership.mockResolvedValue(membership)
    mocks.findActiveMembershipForUpdate.mockResolvedValue(membership)
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue({
      local_auth_enabled: true,
      oidc_auth_enabled: true,
    })
    mocks.findActiveOrganizationOidcLinkForUpdate.mockResolvedValue(link)
    mocks.hasEnabledLocalCredential.mockResolvedValue(true)
    mocks.countOtherUsableOidcLinks.mockResolvedValue(0)
    mocks.revokeOrganizationOidcLink.mockResolvedValue({ id: linkId, revoked_at: now })
    mocks.revokeActiveGrantsForOidcLink.mockResolvedValue(2)
    mocks.listActiveOrganizationOidcLinks.mockResolvedValue([
      {
        id: linkId,
        linked_at: new Date('2026-08-10T00:00:00.000Z'),
        provider_id: providerId,
        provider_name: 'Google',
        provider_enabled: true,
      },
    ])
  })

  it('本人Membershipのactive LinkをProvider表示情報だけで返す', async () => {
    await expect(getMyOrganizationOidcLinks(actor, organizationId, executor)).resolves.toEqual({
      ok: true,
      value: {
        links: [
          {
            id: linkId,
            provider: { id: providerId, display_name: 'Google', enabled: true },
            linked_at: '2026-08-10T00:00:00.000Z',
          },
        ],
      },
    })
  })

  it('active MembershipがなければLink一覧を返さない', async () => {
    mocks.findActiveMembership.mockResolvedValue(undefined)

    await expect(getMyOrganizationOidcLinks(actor, organizationId, executor)).resolves.toEqual({
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    })
    expect(mocks.listActiveOrganizationOidcLinks).not.toHaveBeenCalled()
  })

  it('Local Credentialが残る場合はLinkとそのLink由来GrantだけをrevokeしてEventを残す', async () => {
    const result = await unlinkMyOrganizationOidcIdentity(actor, organizationId, linkId, {
      now,
      executor,
    })

    expect(result).toEqual({ ok: true, value: { ok: true } })
    expect(mocks.revokeOrganizationOidcLink).toHaveBeenCalledWith(linkId, now, executor)
    expect(mocks.revokeActiveGrantsForOidcLink).toHaveBeenCalledWith(
      membershipId,
      linkId,
      now,
      executor
    )
    expect(mocks.insertOidcLinkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: userId,
        actor_membership_id: membershipId,
        organization_id: organizationId,
        target_type: 'organization_member_oidc_identity',
        target_id: linkId,
        action: 'unlink',
        changed_fields: ['revoked_at'],
      }),
      executor
    )
    expect(mocks.insertOidcLinkAuthenticationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'oidc_unlink_identity',
        outcome: 'success',
        credential_reference_id: identityId,
      }),
      executor
    )
  })

  it('利用可能な最後の認証手段になるLinkはunlinkできない', async () => {
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue({
      local_auth_enabled: false,
      oidc_auth_enabled: true,
    })
    mocks.hasEnabledLocalCredential.mockResolvedValue(false)
    mocks.countOtherUsableOidcLinks.mockResolvedValue(0)

    const result = await unlinkMyOrganizationOidcIdentity(actor, organizationId, linkId, {
      now,
      executor,
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'OIDC_LINK_LAST_USABLE_AUTH_METHOD' },
    })
    expect(mocks.revokeOrganizationOidcLink).not.toHaveBeenCalled()
    expect(mocks.revokeActiveGrantsForOidcLink).not.toHaveBeenCalled()
    expect(mocks.insertOidcLinkAuditEvent).not.toHaveBeenCalled()
  })

  it('別のenabled OIDC Linkが残ればLocal Credentialなしでもunlinkできる', async () => {
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue({
      local_auth_enabled: false,
      oidc_auth_enabled: true,
    })
    mocks.hasEnabledLocalCredential.mockResolvedValue(false)
    mocks.countOtherUsableOidcLinks.mockResolvedValue(1)

    await expect(
      unlinkMyOrganizationOidcIdentity(actor, organizationId, linkId, { now, executor })
    ).resolves.toEqual({ ok: true, value: { ok: true } })
  })

  it('対象Providerがdisabledなら現在の利用可能手段を減らさないためunlinkできる', async () => {
    mocks.findActiveOrganizationOidcLinkForUpdate.mockResolvedValue({
      ...link,
      provider_enabled: false,
    })
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue({
      local_auth_enabled: false,
      oidc_auth_enabled: true,
    })

    await expect(
      unlinkMyOrganizationOidcIdentity(actor, organizationId, linkId, { now, executor })
    ).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(mocks.hasEnabledLocalCredential).not.toHaveBeenCalled()
    expect(mocks.countOtherUsableOidcLinks).not.toHaveBeenCalled()
  })

  it('本人のactive Linkでなければ404用errorを返す', async () => {
    mocks.findActiveOrganizationOidcLinkForUpdate.mockResolvedValue(undefined)

    await expect(
      unlinkMyOrganizationOidcIdentity(actor, organizationId, linkId, { now, executor })
    ).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_MEMBERSHIP_LINK_NOT_FOUND' },
    })
  })
})
