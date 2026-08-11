import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateMembershipGrant } from '../services/organization-authorization/authorization.js'
import { organizationAuthorizationMiddleware } from './organization-authorization.js'
import type { RequestActorHonoEnv } from './request-actor-context.js'

const { findMembershipGrantContextMock } = vi.hoisted(() => ({
  findMembershipGrantContextMock: vi.fn(),
}))

vi.mock('../services/organization-authorization/index.js', () => ({
  findMembershipGrantContext: findMembershipGrantContextMock,
}))

const organizationId = '22222222-2222-4222-8222-222222222222'
const membershipId = '33333333-3333-4333-8333-333333333333'
const userId = '11111111-1111-4111-8111-111111111111'
const now = new Date('2026-08-11T12:00:00.000Z')

const activeContext = {
  organization_id: organizationId,
  membership_id: membershipId,
  membership_role: 'manager',
  membership_status: 'active',
  membership_left_at: null,
  organization_status: 'active',
  local_auth_enabled: true,
  oidc_auth_enabled: true,
  current_policy_version: '2',
  reauthentication_interval_seconds: 7200,
  grant_auth_method: 'local',
  grant_policy_version: '2',
  grant_authenticated_at: new Date('2026-08-11T11:00:00.000Z'),
  grant_expires_at: new Date('2026-08-11T13:00:00.000Z'),
  grant_revoked_at: null,
  local_credential_enabled: true,
  oidc_identity_revoked_at: null,
  oidc_provider_enabled: null,
}

const createApp = (withActor = true) => {
  const app = new Hono<RequestActorHonoEnv>()
  if (withActor) {
    app.use('/api/*', async (c, next) => {
      c.set('requestActor', {
        type: 'user',
        user_id: userId,
        email: 'member@example.com',
        global_role: 'none',
        account_state: 'active',
        memberships: [
          { organization_id: organizationId, organization_name: 'Example', role: 'manager' },
        ],
      })
      c.set('requestSessionId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      await next()
    })
  }
  app.use(
    '/api/organizations/:organizationId/*',
    organizationAuthorizationMiddleware({ now: () => now })
  )
  app.get('/api/organizations/:organizationId', (c) => c.json({ ok: true }))
  app.get('/api/organizations/:organizationId/resource', (c) => c.json({ ok: true }))
  return app
}

describe('evaluateMembershipGrant', () => {
  it.each([
    ['grant_missing', { grant_auth_method: null }],
    ['grant_revoked', { grant_revoked_at: new Date('2026-08-11T11:30:00.000Z') }],
    ['grant_expired', { grant_expires_at: now }],
    ['reauthentication_interval_elapsed', { reauthentication_interval_seconds: 3600 }],
    ['policy_changed', { grant_policy_version: '1' }],
    ['auth_method_not_allowed', { local_auth_enabled: false }],
  ] as const)('%s を安定した再認証理由として返す', (reason, override) => {
    const result = evaluateMembershipGrant({ ...activeContext, ...override }, 'member', now)

    expect(result).toMatchObject({
      ok: false,
      type: 'reauthentication_required',
      membershipId,
      reason,
    })
  })

  it('active grantの確認後にroleを認可する', () => {
    expect(evaluateMembershipGrant(activeContext, 'manager', now)).toMatchObject({
      ok: true,
      membershipId,
      role: 'manager',
    })
    expect(evaluateMembershipGrant(activeContext, 'owner', now)).toEqual({
      ok: false,
      type: 'role_forbidden',
      membershipId,
    })
  })

  it('reauthentication intervalの直前は許可し、境界時刻で再認証を要求する', () => {
    const context = { ...activeContext, reauthentication_interval_seconds: 3600 }

    expect(
      evaluateMembershipGrant(context, 'member', new Date('2026-08-11T11:59:59.999Z'))
    ).toMatchObject({ ok: true })
    expect(evaluateMembershipGrant(context, 'member', now)).toMatchObject({
      ok: false,
      type: 'reauthentication_required',
      reason: 'reauthentication_interval_elapsed',
    })
  })

  it('別userやinactive Membershipをquery結果なし/forbiddenとして扱う', () => {
    expect(evaluateMembershipGrant(undefined, 'member', now)).toEqual({
      ok: false,
      type: 'organization_forbidden',
    })
    expect(
      evaluateMembershipGrant({ ...activeContext, membership_status: 'suspended' }, 'member', now)
    ).toEqual({ ok: false, type: 'organization_forbidden' })
  })
})

describe('organizationAuthorizationMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有効なsessionとMembership grantならorganization routeへ進む', async () => {
    findMembershipGrantContextMock.mockResolvedValue(activeContext)
    const response = await createApp().request(`/api/organizations/${organizationId}/resource`)

    expect(response.status).toBe(200)
    expect(findMembershipGrantContextMock).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId,
      organizationId
    )
  })

  it('organization直下のrouteも認可対象にできる', async () => {
    findMembershipGrantContextMock.mockResolvedValue(activeContext)
    const app = new Hono<RequestActorHonoEnv>()
    app.use('/api/*', async (c, next) => {
      c.set('requestActor', {
        type: 'user',
        user_id: userId,
        email: 'member@example.com',
        global_role: 'none',
        account_state: 'active',
        memberships: [],
      })
      c.set('requestSessionId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      await next()
    })
    app.use(
      '/api/organizations/:organizationId',
      organizationAuthorizationMiddleware({ now: () => now })
    )
    app.get('/api/organizations/:organizationId', (c) => c.json({ ok: true }))

    const response = await app.request(`/api/organizations/${organizationId}`)
    expect(response.status).toBe(200)
    expect(findMembershipGrantContextMock).toHaveBeenCalledOnce()
  })

  it('grant期限切れはglobal sessionを失効させず403と再認証metadataを返す', async () => {
    findMembershipGrantContextMock.mockResolvedValue({ ...activeContext, grant_expires_at: now })
    const response = await createApp().request(`/api/organizations/${organizationId}/resource`)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_MEMBERSHIP_REAUTHENTICATION_REQUIRED',
      error_message: 'organization membership reauthentication required',
      details: {
        organization_id: organizationId,
        membership_id: membershipId,
        reason: 'grant_expired',
        allowed_auth_methods: ['local', 'oidc'],
      },
    })
  })

  it('global session contextがなければ401を返す', async () => {
    const response = await createApp(false).request(`/api/organizations/${organizationId}/resource`)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    })
    expect(findMembershipGrantContextMock).not.toHaveBeenCalled()
  })
})
