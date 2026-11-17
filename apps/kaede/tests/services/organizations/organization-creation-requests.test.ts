import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import { initializeOwnerOidc } from '../../../src/services/organizations/initialize-owner-oidc.js'
import { getPublicOrganizationAuthMethods } from '../../../src/usecases/organization-auth-methods/index.js'
import { completeOrganizationOidc } from '../../../src/usecases/organization-oidc-auth/callback.js'
import { startOrganizationOidc } from '../../../src/usecases/organization-oidc-auth/start.js'
import {
  approveOrganizationCreationRequestForAdminSession,
  createOrganizationCreationRequestForSession,
  listMyOrganizationCreationRequestsForSession,
  rejectOrganizationCreationRequestForAdminSession,
} from '../../../src/usecases/organizations/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
const now = new Date('2026-06-11T00:00:00.000Z')

const createUserWithSession = async (params: { email: string; globalRole?: 'admin' | 'none' }) => {
  const user = await db
    .insertInto('users')
    .values({
      email: params.email,
      display_name: params.email,
      password_hash: passwordHash,
      global_role: params.globalRole ?? 'none',
      status: 'active',
      password_changed_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const session = await createSession({ userId: user.id, now }, db)

  return {
    user,
    sessionToken: session.token,
  }
}

describe('organization creation request usecase', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    process.env.ORGANIZATION_CREATION_REQUESTS_ENABLED = 'true'
    resetRuntimeConfigForTests()
    await resetDatabase(db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetRuntimeConfigForTests()
    vi.useRealTimers()
  })

  afterAll(async () => {
    Reflect.deleteProperty(process.env, 'ORGANIZATION_CREATION_REQUESTS_ENABLED')
    resetRuntimeConfigForTests()
    await db.destroy()
  })

  it('pending user can create and list their organization creation request', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })

    const result = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: ' Example Organization ',
        requested_slug: 'example-org',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        requester_user_id: requester.user.id,
        requested_organization_name: 'Example Organization',
        requested_slug: 'example-org',
        status: 'pending',
      },
    })

    const listResult = await listMyOrganizationCreationRequestsForSession(
      requester.sessionToken,
      db
    )

    expect(listResult).toMatchObject({
      ok: true,
      value: {
        requests: [
          {
            requester_user_id: requester.user.id,
            status: 'pending',
          },
        ],
      },
    })
  })

  it('active member can request a second organization and become its owner on approval', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Existing Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const member = await createUserWithSession({ email: 'member@example.com' })
    await db
      .insertInto('organization_memberships')
      .values({
        organization_id: organization.id,
        user_id: member.user.id,
        role: 'member',
      })
      .execute()

    const result = await createOrganizationCreationRequestForSession(
      member.sessionToken,
      {
        organization_name: 'New Organization',
        requested_slug: 'new-org',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        requester_user_id: member.user.id,
        requested_organization_name: 'New Organization',
        requested_slug: 'new-org',
        status: 'pending',
      },
    })
    if (!result.ok) {
      return
    }

    const duplicate = await createOrganizationCreationRequestForSession(
      member.sessionToken,
      { organization_name: 'Another Organization' },
      db
    )
    expect(duplicate).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING' },
    })

    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const approved = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      result.value.request_id,
      { slug: 'new-org' },
      now,
      db
    )
    expect(approved).toMatchObject({ ok: true, value: { status: 'approved' } })
    if (!approved.ok) {
      return
    }

    const memberships = await db
      .selectFrom('organization_memberships')
      .select(['organization_id', 'role'])
      .where('user_id', '=', member.user.id)
      .execute()
    expect(memberships).toHaveLength(2)
    expect(memberships).toEqual(
      expect.arrayContaining([
        { organization_id: organization.id, role: 'member' },
        { organization_id: approved.value.created_organization_id, role: 'owner' },
      ])
    )

    const nextRequest = await createOrganizationCreationRequestForSession(
      member.sessionToken,
      { organization_name: 'Third Organization' },
      db
    )
    expect(nextRequest).toMatchObject({ ok: true, value: { status: 'pending' } })
  })

  it('platform admin still cannot submit an organization creation request', async () => {
    const admin = await createUserWithSession({ email: 'admin@example.com', globalRole: 'admin' })

    const result = await createOrganizationCreationRequestForSession(
      admin.sessionToken,
      { organization_name: 'New Organization' },
      db
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
    })
  })

  it('only platform admin can approve and a disabled requester cannot be approved', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({ email: 'admin@example.com', globalRole: 'admin' })
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      { organization_name: 'New Organization' },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const unauthorized = await approveOrganizationCreationRequestForAdminSession(
      requester.sessionToken,
      created.value.request_id,
      { slug: 'new-org' },
      now,
      db
    )
    expect(unauthorized).toEqual({ ok: false, error: { type: 'AUTH_FORBIDDEN' } })

    await db
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', requester.user.id)
      .execute()
    const disabled = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      { slug: 'new-org' },
      now,
      db
    )
    expect(disabled).toEqual({
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
    })
    const organizations = await db.selectFrom('organizations').select('id').execute()
    expect(organizations).toHaveLength(0)
  })

  it('platform admin can approve request and create organization with owner membership', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        slug: 'approved-org',
      },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        request_id: created.value.request_id,
        status: 'approved',
        reviewed_by_user_id: admin.user.id,
        reviewed_at: now.toISOString(),
      },
    })
    if (!result.ok) {
      return
    }
    expect(result.value.created_organization_id).toEqual(expect.any(String))

    const organization = await db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', result.value.created_organization_id)
      .executeTakeFirstOrThrow()
    expect(organization).toMatchObject({
      name: 'Example Organization',
      slug: 'approved-org',
    })

    const membership = await db
      .selectFrom('organization_memberships')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', requester.user.id)
      .executeTakeFirstOrThrow()
    expect(membership.role).toBe('owner')
    await expect(
      db
        .selectFrom('organization_auth_settings')
        .select([
          'local_auth_enabled',
          'oidc_auth_enabled',
          'policy_version',
          'membership_grant_ttl_seconds',
          'reauthentication_interval_seconds',
        ])
        .where('organization_id', '=', organization.id)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({
      local_auth_enabled: true,
      oidc_auth_enabled: false,
      policy_version: '1',
      membership_grant_ttl_seconds: 28_800,
      reauthentication_interval_seconds: 14_400,
    })
  })

  const enableOidc = () => {
    vi.stubEnv('OIDC_ENABLED', 'true')
    vi.stubEnv('OIDC_GOOGLE_CLIENT_ID', 'google-client-id')
    vi.stubEnv('OIDC_GOOGLE_CLIENT_SECRET', 'test-google-secret')
    vi.stubEnv('OIDC_GOOGLE_REDIRECT_URI', 'https://api.example.test/api/auth/oidc/google/callback')
    vi.stubEnv('OIDC_STATE_COOKIE_SECRET', 'test-state-secret')
    resetRuntimeConfigForTests()
  }

  const approveGoogleRequester = async (enableBeforeApproval = true, source = 'legacy') => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({ email: 'admin@example.com', globalRole: 'admin' })
    if (source !== 'oidc') {
      await db
        .insertInto('auth_identities')
        .values({
          user_id: requester.user.id,
          provider: 'google',
          provider_subject: 'requester-google-subject',
          email: requester.user.email,
          email_verified: true,
          hosted_domain: 'example.com',
        })
        .execute()
    }
    if (source !== 'legacy') {
      await db
        .insertInto('oidc_identities')
        .values({
          user_id: requester.user.id,
          issuer: 'https://accounts.google.com',
          subject: 'requester-google-subject',
          last_claimed_email: requester.user.email,
          last_claimed_email_verified: true,
        })
        .execute()
    }
    if (enableBeforeApproval) enableOidc()
    const request = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Second Organization',
        requested_slug: 'second-org',
      },
      db
    )
    if (!request.ok) throw new Error(request.error.type)
    const approved = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      request.value.request_id,
      { slug: 'second-org' },
      now,
      db
    )
    if (!approved.ok || !approved.value.created_organization_id) throw new Error('approval failed')
    return { requester, admin, organizationId: approved.value.created_organization_id }
  }

  it.each(['legacy', 'oidc', 'both'])(
    'approval enables Google login for %s identity and the owner can reauthenticate immediately',
    async (source) => {
      const { requester, organizationId } = await approveGoogleRequester(true, source)
      const methods = await getPublicOrganizationAuthMethods('second-org', db)
      expect(methods.allowed_auth_methods).toContain('oidc')
      expect(methods.oidc_providers).toHaveLength(1)
      const provider = await db
        .selectFrom('organization_oidc_providers')
        .selectAll()
        .where('organization_id', '=', organizationId)
        .executeTakeFirstOrThrow()
      expect(provider.allowed_hosted_domains).toBeNull()
      expect(
        await db.selectFrom('session_membership_authentications').select('session_id').execute()
      ).toHaveLength(0)
      const started = await startOrganizationOidc(
        'second-org',
        provider.id,
        requester.sessionToken,
        {
          intent: 'reauthenticate',
          return_to: `/orgs/${organizationId}/dashboard`,
        },
        {
          client: {
            createAuthorizationUrl: ({ state }) =>
              `https://accounts.google.com/auth?state=${state}`,
          },
          configuredClientId: 'google-client-id',
          transactionSecret: 'test-transaction-secret',
          now,
          executor: db,
        }
      )
      if (!started.ok) throw new Error(started.error.type)
      const state = new URL(started.value.authorization_url).searchParams.get('state')
      if (!state) throw new Error('OIDC state missing')
      const completed = await completeOrganizationOidc('authorization-code', state, {
        client: {
          exchangeCodeForIdToken: () => Promise.resolve('id-token'),
          verifyIdToken: () =>
            Promise.resolve({
              issuer: 'accounts.google.com',
              sub: 'requester-google-subject',
              email: requester.user.email,
              emailVerified: true,
              hostedDomain: 'example.com',
              name: 'Requester',
            }),
        },
        configuredClientId: 'google-client-id',
        transactionSecret: 'test-transaction-secret',
        sessionToken: requester.sessionToken,
        now,
        executor: db,
      })
      expect(completed.ok).toBe(true)
      const grant = await db
        .selectFrom('session_membership_authentications')
        .selectAll()
        .where('user_id', '=', requester.user.id)
        .executeTakeFirstOrThrow()
      expect(grant.auth_method).toBe('oidc')
    }
  )

  it('can repair a previously approved organization, with dry run and no repeated changes', async () => {
    vi.stubEnv('OIDC_ENABLED', 'false')
    resetRuntimeConfigForTests()
    const { requester, organizationId } = await approveGoogleRequester(false)
    enableOidc()
    const initialize = (dryRun = false) =>
      db
        .transaction()
        .execute((trx) => initializeOwnerOidc(organizationId, requester.user.id, null, trx, dryRun))
    expect(await initialize(true)).toEqual({ status: 'ready' })
    expect((await getPublicOrganizationAuthMethods('second-org', db)).oidc_providers).toEqual([])
    expect(await initialize()).toMatchObject({ status: 'initialized' })
    expect(await initialize()).toEqual({
      status: 'skipped',
      reason: 'auth_policy_already_configured',
    })
    expect((await getPublicOrganizationAuthMethods('second-org', db)).oidc_providers).toHaveLength(
      1
    )
  })

  it('does not merge Google identities by email or reassign another user identity', async () => {
    vi.stubEnv('OIDC_ENABLED', 'false')
    resetRuntimeConfigForTests()
    const { requester, admin, organizationId } = await approveGoogleRequester(false)
    const other = await createUserWithSession({ email: 'other@example.com' })
    await db
      .insertInto('oidc_identities')
      .values({
        user_id: other.user.id,
        issuer: 'https://accounts.google.com',
        subject: 'requester-google-subject',
        last_claimed_email: requester.user.email,
        last_claimed_email_verified: true,
      })
      .execute()
    enableOidc()
    await expect(
      db
        .transaction()
        .execute((trx) =>
          initializeOwnerOidc(organizationId, requester.user.id, admin.user.id, trx)
        )
    ).rejects.toThrow('belongs to a different user')
    expect((await getPublicOrganizationAuthMethods('second-org', db)).oidc_providers).toEqual([])
    const identity = await db
      .selectFrom('oidc_identities')
      .select('user_id')
      .executeTakeFirstOrThrow()
    expect(identity.user_id).toBe(other.user.id)
  })

  it.each([false, true])(
    'does not initialize without a verified Google identity (unverified: %s)',
    async (unverified) => {
      vi.stubEnv('OIDC_ENABLED', 'false')
      resetRuntimeConfigForTests()
      const { requester, organizationId } = await approveGoogleRequester(false)
      if (unverified) {
        await db
          .updateTable('auth_identities')
          .set({ email_verified: false })
          .where('user_id', '=', requester.user.id)
          .execute()
      } else {
        await db.deleteFrom('auth_identities').where('user_id', '=', requester.user.id).execute()
      }
      enableOidc()
      const result = await db
        .transaction()
        .execute((trx) => initializeOwnerOidc(organizationId, requester.user.id, null, trx))
      expect(result).toEqual({ status: 'skipped', reason: 'requester_has_no_google_identity' })
      expect((await getPublicOrganizationAuthMethods('second-org', db)).oidc_providers).toEqual([])
    }
  )

  it('does not initialize OIDC over owner-configured settings', async () => {
    vi.stubEnv('OIDC_ENABLED', 'false')
    resetRuntimeConfigForTests()
    const { requester, admin, organizationId } = await approveGoogleRequester(false)
    enableOidc()
    await db
      .updateTable('organization_auth_settings')
      .set({ policy_version: '2' })
      .where('organization_id', '=', organizationId)
      .execute()
    const result = await db
      .transaction()
      .execute((trx) => initializeOwnerOidc(organizationId, requester.user.id, admin.user.id, trx))
    expect(result).toEqual({ status: 'skipped', reason: 'auth_policy_already_configured' })
    expect((await getPublicOrganizationAuthMethods('second-org', db)).oidc_providers).toEqual([])
  })

  it('approve rejects duplicate slug', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    await db.insertInto('organizations').values({ name: 'Existing', slug: 'used-slug' }).execute()
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await approveOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        slug: 'used-slug',
      },
      now,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
      },
    })
  })

  it('platform admin can reject pending request', async () => {
    const requester = await createUserWithSession({ email: 'requester@example.com' })
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const created = await createOrganizationCreationRequestForSession(
      requester.sessionToken,
      {
        organization_name: 'Example Organization',
        requested_slug: 'example-org',
      },
      db
    )
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const result = await rejectOrganizationCreationRequestForAdminSession(
      admin.sessionToken,
      created.value.request_id,
      {
        reason: 'not enough detail',
      },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'rejected',
        rejected_reason: 'not enough detail',
        reviewed_by_user_id: admin.user.id,
      },
    })
  })
})
