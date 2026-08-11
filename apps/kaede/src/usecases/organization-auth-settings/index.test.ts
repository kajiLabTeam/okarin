import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { DbExecutor } from '../../services/executor.js'

const mocks = vi.hoisted(() => ({
  countEnabledOidcProviders: vi.fn(),
  findActiveOwnerMembership: vi.fn(),
  findActiveOwnerMembershipForUpdate: vi.fn(),
  findOrganizationAuthSettings: vi.fn(),
  findOrganizationAuthSettingsForUpdate: vi.fn(),
  insertOrganizationAuthSettingsAuditEvent: vi.fn(),
  updateOrganizationAuthSettings: vi.fn(),
}))

vi.mock('../../services/organization-auth-settings/index.js', () => mocks)
vi.mock('../../services/db/index.js', () => ({ db: {} }))

import { getOrganizationAuthSettings, patchOrganizationAuthSettings } from './index.js'

const executor = {} as DbExecutor
const organizationId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const membershipId = '33333333-3333-4333-8333-333333333333'
const createdAt = new Date('2026-08-11T00:00:00.000Z')
const updatedAt = new Date('2026-08-11T01:00:00.000Z')

const actor: RequestActor = {
  type: 'user',
  user_id: userId,
  email: 'owner@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Example', role: 'owner' }],
}

const settings = {
  organization_id: organizationId,
  local_auth_enabled: true,
  oidc_auth_enabled: false,
  policy_version: '1',
  membership_grant_ttl_seconds: 28_800,
  reauthentication_interval_seconds: 14_400,
  created_at: createdAt,
  updated_at: createdAt,
}

describe('organization auth settings usecases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findActiveOwnerMembership.mockResolvedValue({ id: membershipId })
    mocks.findActiveOwnerMembershipForUpdate.mockResolvedValue({ id: membershipId })
    mocks.findOrganizationAuthSettings.mockResolvedValue(settings)
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue(settings)
    mocks.countEnabledOidcProviders.mockResolvedValue(1)
    mocks.updateOrganizationAuthSettings.mockImplementation((_organizationId, next) =>
      Promise.resolve({
        ...settings,
        ...next,
        policy_version: '2',
        updated_at: updatedAt,
      })
    )
  })

  it('active ownerへ認証設定を返す', async () => {
    await expect(getOrganizationAuthSettings(actor, organizationId, executor)).resolves.toEqual({
      ok: true,
      value: {
        organization_id: organizationId,
        local_auth_enabled: true,
        oidc_auth_enabled: false,
        policy_version: 1,
        membership_grant_ttl_seconds: 28_800,
        reauthentication_interval_seconds: 14_400,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      },
    })
  })

  it('active ownerでなければ取得を拒否する', async () => {
    mocks.findActiveOwnerMembership.mockResolvedValue(undefined)

    await expect(getOrganizationAuthSettings(actor, organizationId, executor)).resolves.toEqual({
      ok: false,
      error: { type: 'AUTH_DASHBOARD_FORBIDDEN' },
    })
    expect(mocks.findOrganizationAuthSettings).not.toHaveBeenCalled()
  })

  it('実質変更時だけpolicy versionを1増加させAuditを記録する', async () => {
    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { membership_grant_ttl_seconds: 36_000, reauthentication_interval_seconds: 18_000 },
      executor
    )

    expect(result).toMatchObject({ ok: true, value: { policy_version: 2 } })
    expect(mocks.updateOrganizationAuthSettings).toHaveBeenCalledOnce()
    expect(mocks.updateOrganizationAuthSettings).toHaveBeenCalledWith(
      organizationId,
      {
        local_auth_enabled: true,
        oidc_auth_enabled: false,
        membership_grant_ttl_seconds: 36_000,
        reauthentication_interval_seconds: 18_000,
      },
      executor
    )
    expect(mocks.insertOrganizationAuthSettingsAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: userId,
        actor_membership_id: membershipId,
        organization_id: organizationId,
        target_type: 'organization_auth_settings',
        target_id: organizationId,
        action: 'update',
        changed_fields: ['membership_grant_ttl_seconds', 'reauthentication_interval_seconds'],
        before_values: {
          membership_grant_ttl_seconds: 28_800,
          reauthentication_interval_seconds: 14_400,
          policy_version: 1,
        },
        after_values: {
          membership_grant_ttl_seconds: 36_000,
          reauthentication_interval_seconds: 18_000,
          policy_version: 2,
        },
      }),
      executor
    )
  })

  it('同じ値へのPATCHではversion更新もAuditも行わない', async () => {
    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { local_auth_enabled: true },
      executor
    )

    expect(result).toMatchObject({ ok: true, value: { policy_version: 1 } })
    expect(mocks.updateOrganizationAuthSettings).not.toHaveBeenCalled()
    expect(mocks.insertOrganizationAuthSettingsAuditEvent).not.toHaveBeenCalled()
  })

  it('すべての認証方式を無効にできない', async () => {
    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { local_auth_enabled: false },
      executor
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_AUTH_SETTINGS_INVALID' },
    })
    expect(mocks.updateOrganizationAuthSettings).not.toHaveBeenCalled()
  })

  it('再認証期間がGrant TTLを超える設定を拒否する', async () => {
    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { reauthentication_interval_seconds: 28_801 },
      executor
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_AUTH_SETTINGS_INVALID' },
    })
  })

  it('OIDCを有効化するときはenabled Providerを要求する', async () => {
    mocks.countEnabledOidcProviders.mockResolvedValue(0)

    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { oidc_auth_enabled: true },
      executor
    )

    expect(result).toEqual({ ok: false, error: { type: 'OIDC_PROVIDER_REQUIRED' } })
    expect(mocks.updateOrganizationAuthSettings).not.toHaveBeenCalled()
  })

  it('transaction内の再確認でactive ownerでなければ更新を拒否する', async () => {
    mocks.findActiveOwnerMembershipForUpdate.mockResolvedValue(undefined)

    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { membership_grant_ttl_seconds: 36_000 },
      executor
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } })
    expect(mocks.updateOrganizationAuthSettings).not.toHaveBeenCalled()
  })

  it('認証設定行がなければ404用errorを返す', async () => {
    mocks.findOrganizationAuthSettingsForUpdate.mockResolvedValue(undefined)

    const result = await patchOrganizationAuthSettings(
      actor,
      organizationId,
      { membership_grant_ttl_seconds: 36_000 },
      executor
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_AUTH_SETTINGS_NOT_FOUND' },
    })
    expect(mocks.updateOrganizationAuthSettings).not.toHaveBeenCalled()
  })
})
