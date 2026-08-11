import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { DbExecutor } from '../../services/executor.js'

const auth = vi.hoisted(() => ({
  createSession: vi.fn(),
  findValidSessionByToken: vi.fn(),
  generateActivationToken: vi.fn(),
  hashActivationToken: vi.fn(),
  hashPassword: vi.fn(),
}))
const invites = vi.hoisted(() => ({
  consumeOrganizationInvite: vi.fn(),
  findActorMembership: vi.fn(),
  findActorMembershipForUpdate: vi.fn(),
  findEnabledLocalCredentialByEmail: vi.fn(),
  findInviteContextByTokenHash: vi.fn(),
  findInviteContextByTokenHashForUpdate: vi.fn(),
  findMembershipStateForInvite: vi.fn(),
  findOrganizationInviteForUpdate: vi.fn(),
  insertOrganizationInvite: vi.fn(),
  insertOrganizationLocalCredential: vi.fn(),
  insertOrganizationMembershipForInvite: vi.fn(),
  listOrganizationInvites: vi.fn(),
  revokeOrganizationInvite: vi.fn(),
}))
const oidc = vi.hoisted(() => ({
  canonicalizeOidcIssuer: vi.fn(),
  findOidcIdentity: vi.fn(),
  findOrganizationOidcProviderContextById: vi.fn(),
  insertOidcIdentity: vi.fn(),
  listOidcProviders: vi.fn(),
  revokeActiveOidcMembershipLink: vi.fn(),
  updateOidcIdentityClaims: vi.fn(),
  upsertOidcMembershipGrant: vi.fn(),
  upsertOidcMembershipLink: vi.fn(),
}))
const local = vi.hoisted(() => ({
  insertAuthenticationEvent: vi.fn(),
  normalizeLocalLoginEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  upsertLocalMembershipGrant: vi.fn(),
}))
const profiles = vi.hoisted(() => ({
  insertAuditEvent: vi.fn(),
  upsertOrganizationMemberProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
}))
const users = vi.hoisted(() => ({ findUserById: vi.fn(), insertUser: vi.fn() }))

vi.mock('../../services/auth/index.js', () => auth)
vi.mock('../../services/organization-invites/index.js', () => invites)
vi.mock('../../services/organization-local-auth/index.js', () => local)
vi.mock('../../services/organization-oidc-auth/index.js', () => oidc)
vi.mock('../../services/profiles/index.js', () => profiles)
vi.mock('../../services/users/index.js', () => users)
vi.mock('../../services/db/index.js', () => ({ db: {} }))

import {
  acceptOrganizationInviteWithLocalCredential,
  issueOrganizationInvite,
  reissueInvite,
  verifyOrganizationInvite,
} from './index.js'

const executor = {} as DbExecutor
const now = new Date('2026-08-11T10:00:00.000Z')
const organizationId = '11111111-1111-4111-8111-111111111111'
const actorUserId = '22222222-2222-4222-8222-222222222222'
const actorMembershipId = '33333333-3333-4333-8333-333333333333'
const inviteId = '44444444-4444-4444-8444-444444444444'

const actor = (role: 'member' | 'manager' | 'owner'): RequestActor => ({
  type: 'user',
  user_id: actorUserId,
  email: 'actor@example.test',
  global_role: 'none',
  account_state: 'active',
  memberships: [{ organization_id: organizationId, organization_name: 'Org', role }],
})

const actorMembership = (role: string) => ({
  id: actorMembershipId,
  organization_id: organizationId,
  user_id: actorUserId,
  role,
  status: 'active',
  joined_at: now,
  left_at: null,
  created_at: now,
  updated_at: now,
})

const inviteContext = (overrides: Record<string, unknown> = {}) => ({
  invite_id: inviteId,
  organization_id: organizationId,
  role: 'member',
  expires_at: new Date('2026-08-18T10:00:00.000Z'),
  revoked_at: null,
  redeemed_at: null,
  organization_name: 'Example',
  organization_slug: 'example',
  organization_status: 'active',
  local_auth_enabled: true,
  oidc_auth_enabled: true,
  policy_version: 1,
  membership_grant_ttl_seconds: 3600,
  ...overrides,
})

describe('organization invite usecases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.generateActivationToken.mockReturnValue('plain-token')
    auth.hashActivationToken.mockImplementation((token: string) => `hash:${token}`)
    auth.hashPassword.mockResolvedValue('password-hash')
    invites.findInviteContextByTokenHash.mockResolvedValue(inviteContext())
    oidc.listOidcProviders.mockResolvedValue([
      { id: '55555555-5555-4555-8555-555555555555', name: 'Google', enabled: true },
      { id: '66666666-6666-4666-8666-666666666666', name: 'Disabled', enabled: false },
    ])
    profiles.insertAuditEvent.mockResolvedValue(undefined)
  })

  it('managerはmember Inviteを発行でき、平文tokenではなくhashだけを保存する', async () => {
    invites.findActorMembershipForUpdate.mockResolvedValue(actorMembership('manager'))
    invites.insertOrganizationInvite.mockImplementation((value: object) =>
      Promise.resolve({ ...value, id: inviteId, created_at: now, updated_at: now })
    )

    const result = await issueOrganizationInvite(
      actor('manager'),
      organizationId,
      { role: 'member' },
      now,
      executor
    )

    expect(result).toEqual({
      ok: true,
      value: { token: 'plain-token', expires_at: '2026-08-18T10:00:00.000Z' },
    })
    expect(invites.insertOrganizationInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        token_hash: 'hash:plain-token',
        max_uses: 1,
        used_count: 0,
        email: 'single-use-invite@invalid.local',
      }),
      executor
    )
    expect(JSON.stringify(invites.insertOrganizationInvite.mock.calls[0]?.[0])).not.toContain(
      '"token":"plain-token"'
    )
  })

  it('managerはmanager Inviteを発行できない', async () => {
    invites.findActorMembershipForUpdate.mockResolvedValue(actorMembership('manager'))
    await expect(
      issueOrganizationInvite(actor('manager'), organizationId, { role: 'manager' }, now, executor)
    ).resolves.toEqual({ ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } })
    expect(invites.insertOrganizationInvite).not.toHaveBeenCalled()
  })

  it('ownerはmanager Inviteを発行できる', async () => {
    invites.findActorMembershipForUpdate.mockResolvedValue(actorMembership('owner'))
    invites.insertOrganizationInvite.mockImplementation((value: object) =>
      Promise.resolve({ ...value, id: inviteId, created_at: now, updated_at: now })
    )
    await expect(
      issueOrganizationInvite(actor('owner'), organizationId, { role: 'manager' }, now, executor)
    ).resolves.toMatchObject({ ok: true })
  })

  it('再発行は旧Inviteをrevokeし、新しいInvite INSERTのtokenだけ返す', async () => {
    invites.findOrganizationInviteForUpdate.mockResolvedValue({ ...inviteContext(), id: inviteId })
    invites.findActorMembershipForUpdate.mockResolvedValue(actorMembership('owner'))
    invites.revokeOrganizationInvite.mockResolvedValue({ id: inviteId })
    const replacementId = '55555555-5555-4555-8555-555555555555'
    invites.insertOrganizationInvite.mockImplementation((value: object) =>
      Promise.resolve({ ...value, id: replacementId, created_at: now, updated_at: now })
    )

    const result = await reissueInvite(actor('owner'), organizationId, inviteId, now, executor)

    expect(result).toMatchObject({ ok: true, value: { token: 'plain-token' } })
    expect(invites.revokeOrganizationInvite).toHaveBeenCalledWith(inviteId, now, executor)
    expect(invites.insertOrganizationInvite).toHaveBeenCalledOnce()
  })

  it('verifyは認証方式だけを返しtoken/hash/IDを露出しない', async () => {
    invites.findInviteContextByTokenHash.mockResolvedValue(inviteContext())
    const result = await verifyOrganizationInvite('plain-token', now, executor)
    expect(result).toEqual({
      ok: true,
      value: {
        organization: { id: organizationId, name: 'Example', slug: 'example' },
        role: 'member',
        expires_at: '2026-08-18T10:00:00.000Z',
        authentication_methods: { local: true, oidc: true },
        oidc_providers: [{ id: '55555555-5555-4555-8555-555555555555', display_name: 'Google' }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('plain-token')
    expect(JSON.stringify(result)).not.toContain(inviteId)
  })

  it('legacy owner Inviteを無効として扱う', async () => {
    invites.findInviteContextByTokenHash.mockResolvedValue(inviteContext({ role: 'owner' }))
    await expect(verifyOrganizationInvite('plain-token', now, executor)).resolves.toEqual({
      ok: false,
      error: { type: 'INVITE_INVALID' },
    })
  })

  it.each([
    ['active', 'INVITE_ALREADY_MEMBER'],
    ['suspended', 'INVITE_MEMBERSHIP_SUSPENDED'],
  ] as const)('%s MembershipはInviteを消費せず先に拒否する', async (status, errorType) => {
    invites.findInviteContextByTokenHashForUpdate.mockResolvedValue(inviteContext())
    auth.findValidSessionByToken.mockResolvedValue({
      ok: true,
      session: { id: 'session-id', user_id: actorUserId, expires_at: new Date('2026-08-12') },
    })
    users.findUserById.mockResolvedValue({ id: actorUserId, status: 'active' })
    invites.findMembershipStateForInvite.mockResolvedValue({ status })

    const result = await acceptOrganizationInviteWithLocalCredential(
      'session-token',
      { token: 'plain-token', login_email: 'member@example.test', password: 'password' },
      {},
      now,
      executor
    )

    expect(result).toEqual({ ok: false, error: { type: errorType } })
    expect(invites.findEnabledLocalCredentialByEmail).not.toHaveBeenCalled()
    expect(invites.consumeOrganizationInvite).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid', undefined, 'INVITE_INVALID'],
    [
      'expired',
      inviteContext({ expires_at: new Date('2026-08-11T09:59:59.000Z') }),
      'INVITE_EXPIRED',
    ],
    ['local disabled', inviteContext({ local_auth_enabled: false }), 'AUTH_METHOD_NOT_ALLOWED'],
  ])('%s InviteはArgon2計算前に拒否する', async (_label, context, errorType) => {
    invites.findInviteContextByTokenHash.mockResolvedValue(context)

    const result = await acceptOrganizationInviteWithLocalCredential(
      undefined,
      {
        token: 'invalid-token',
        login_email: 'member@example.test',
        password: 'password',
        contact_email: 'contact@example.test',
        profile: { display_name: 'Member', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
      },
      {},
      now,
      executor
    )

    expect(result).toEqual({ ok: false, error: { type: errorType } })
    expect(auth.hashPassword).not.toHaveBeenCalled()
    expect(invites.findInviteContextByTokenHashForUpdate).not.toHaveBeenCalled()
  })

  it('新規Local受領はUserからGrantまでを作りInviteを1回だけ消費する', async () => {
    const membershipId = '66666666-6666-4666-8666-666666666666'
    invites.findInviteContextByTokenHashForUpdate.mockResolvedValue(inviteContext())
    invites.findMembershipStateForInvite.mockResolvedValue(undefined)
    invites.findEnabledLocalCredentialByEmail.mockResolvedValue(undefined)
    users.insertUser.mockResolvedValue({})
    profiles.upsertUserProfile.mockResolvedValue({})
    invites.insertOrganizationMembershipForInvite.mockImplementation((value: object) =>
      Promise.resolve({ ...value, id: membershipId, created_at: now, updated_at: now })
    )
    profiles.upsertOrganizationMemberProfile.mockResolvedValue({})
    invites.insertOrganizationLocalCredential.mockResolvedValue({ id: 'credential-id' })
    invites.consumeOrganizationInvite.mockResolvedValue({ id: inviteId })
    auth.createSession.mockResolvedValue({
      token: 'new-session-token',
      session: {
        id: 'session-id',
        user_id: actorUserId,
        expires_at: new Date('2026-08-18T10:00:00.000Z'),
      },
    })
    local.upsertLocalMembershipGrant.mockResolvedValue({
      authenticated_at: now,
      expires_at: new Date('2026-08-11T11:00:00.000Z'),
    })

    const result = await acceptOrganizationInviteWithLocalCredential(
      undefined,
      {
        token: 'plain-token',
        login_email: ' Member@Example.Test ',
        password: 'password',
        contact_email: 'contact@example.test',
        profile: { display_name: 'Member', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
      },
      {},
      now,
      executor
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionToken: 'new-session-token',
        membership: {
          id: membershipId,
          organization_id: organizationId,
          role: 'member',
          status: 'active',
        },
        grant: { auth_method: 'local' },
      },
    })
    expect(invites.insertOrganizationLocalCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_login_email: 'member@example.test',
        password_hash: 'password-hash',
      }),
      executor
    )
    expect(invites.consumeOrganizationInvite).toHaveBeenCalledWith(
      inviteId,
      membershipId,
      now,
      executor
    )
    expect(local.insertAuthenticationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'local_invite_accept', outcome: 'success' }),
      executor
    )
  })
})
