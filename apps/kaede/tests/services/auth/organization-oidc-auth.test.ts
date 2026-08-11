import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashActivationToken } from '../../../src/services/auth/activation-token.js'
import { createSession } from '../../../src/services/auth/session-repository.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  completeOrganizationOidc,
  isOrganizationOidcTransactionState,
} from '../../../src/usecases/organization-oidc-auth/callback.js'
import {
  createOrganizationOidcProvider,
  getOrganizationOidcProviders,
} from '../../../src/usecases/organization-oidc-auth/providers.js'
import { startOrganizationOidc } from '../../../src/usecases/organization-oidc-auth/start.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const now = new Date('2026-08-11T10:00:00.000Z')
const configuredClientId = 'google-client-id'
const transactionSecret = 'test-oidc-transaction-secret'

const createUser = async (email: string) =>
  db
    .insertInto('users')
    .values({
      email,
      contact_email: email,
      normalized_contact_email: email.toLowerCase(),
      display_name: email,
      password_hash: null,
      global_role: 'none',
      status: 'active',
      password_changed_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

const createFixture = async ({
  allowedHostedDomains = null,
}: { allowedHostedDomains?: string[] | null } = {}) => {
  const user = await createUser('oidc-user@example.test')
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'OIDC Organization', slug: 'oidc-organization' })
    .returningAll()
    .executeTakeFirstOrThrow()
  await db
    .insertInto('organization_auth_settings')
    .values({
      organization_id: organization.id,
      local_auth_enabled: false,
      oidc_auth_enabled: true,
      membership_grant_ttl_seconds: 28_800,
      reauthentication_interval_seconds: 14_400,
    })
    .execute()
  const membership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
    .returningAll()
    .executeTakeFirstOrThrow()
  if (!membership.id) throw new Error('membership id is required')
  const provider = await db
    .insertInto('organization_oidc_providers')
    .values({
      organization_id: organization.id,
      name: 'Google',
      issuer: 'https://accounts.google.com',
      client_id: configuredClientId,
      client_secret_ref: null,
      scopes: ['openid', 'email', 'profile'],
      allowed_hosted_domains: allowedHostedDomains,
      enabled: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return { membership: { ...membership, id: membership.id }, organization, provider, user }
}

const linkIdentity = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  subject = 'google-subject'
) => {
  const identity = await db
    .insertInto('oidc_identities')
    .values({
      user_id: fixture.user.id,
      issuer: 'https://accounts.google.com',
      subject,
      last_claimed_email: fixture.user.email,
      last_claimed_email_verified: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const link = await db
    .insertInto('organization_member_oidc_identities')
    .values({
      membership_id: fixture.membership.id,
      organization_id: fixture.organization.id,
      user_id: fixture.user.id,
      organization_oidc_provider_id: fixture.provider.id,
      oidc_identity_id: identity.id,
      revoked_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return { identity, link }
}

const startLogin = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  sessionToken?: string
) => {
  const result = await startOrganizationOidc(
    fixture.organization.slug,
    fixture.provider.id,
    sessionToken,
    { intent: 'login', return_to: '/orgs/oidc-organization' },
    {
      client: {
        createAuthorizationUrl: ({ state }) =>
          `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
      },
      configuredClientId,
      transactionSecret,
      now,
      executor: db,
    }
  )
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.type)
  const state = new URL(result.value.authorization_url).searchParams.get('state')
  if (!state) throw new Error('state is required')
  return state
}

const callbackClient = ({
  hostedDomain = null,
  subject = 'google-subject',
}: {
  hostedDomain?: string | null
  subject?: string
} = {}) => ({
  exchangeCodeForIdToken: () => Promise.resolve('id-token'),
  verifyIdToken: () =>
    Promise.resolve({
      issuer: 'accounts.google.com',
      sub: subject,
      email: 'oidc-user@example.test',
      emailVerified: true,
      name: 'OIDC User',
      hostedDomain,
    }),
})

describe('organization OIDC authentication', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('canonical issuerのIdentity LinkからSessionと対象Membership Grantを作る', async () => {
    const fixture = await createFixture()
    const { link } = await linkIdentity(fixture)
    const state = await startLogin(fixture)

    const result = await completeOrganizationOidc('authorization-code', state, {
      client: callbackClient(),
      configuredClientId,
      transactionSecret,
      now,
      executor: db,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionToken).toBeDefined()
    const grant = await db
      .selectFrom('session_membership_authentications')
      .selectAll()
      .where('membership_id', '=', fixture.membership.id)
      .executeTakeFirstOrThrow()
    expect(grant).toMatchObject({
      auth_method: 'oidc',
      member_oidc_identity_id: link.id,
      policy_version: '1',
      user_id: fixture.user.id,
    })
    expect(grant.expires_at).toEqual(new Date('2026-08-11T18:00:00.000Z'))
  })

  it('state transactionを先に原子的に消費しcallbackの再利用を拒否する', async () => {
    const fixture = await createFixture()
    await linkIdentity(fixture)
    const state = await startLogin(fixture)
    const options = {
      client: callbackClient(),
      configuredClientId,
      transactionSecret,
      now,
      executor: db,
    }

    await expect(
      completeOrganizationOidc('authorization-code', state, options)
    ).resolves.toMatchObject({ ok: true })
    await expect(completeOrganizationOidc('authorization-code', state, options)).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_TRANSACTION_INVALID' },
    })
    await expect(isOrganizationOidcTransactionState(state, db)).resolves.toBe(true)
  })

  it('IdP error callbackでもstate transactionを消費する', async () => {
    const fixture = await createFixture()
    await linkIdentity(fixture)
    const state = await startLogin(fixture)
    const options = {
      client: callbackClient(),
      configuredClientId,
      transactionSecret,
      now,
      executor: db,
    }

    await expect(completeOrganizationOidc(undefined, state, options)).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_PROVIDER_ERROR' },
      return_to: '/orgs/oidc-organization',
    })
    await expect(completeOrganizationOidc('authorization-code', state, options)).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_TRANSACTION_INVALID' },
    })
  })

  it('既存Session UserとOIDC Identity Userが異なる場合はGrantを作らない', async () => {
    const fixture = await createFixture()
    await linkIdentity(fixture)
    const otherUser = await createUser('other-user@example.test')
    const session = await createSession({ userId: otherUser.id, now }, db)
    const state = await startLogin(fixture, session.token)

    const result = await completeOrganizationOidc('authorization-code', state, {
      client: callbackClient(),
      configuredClientId,
      transactionSecret,
      sessionToken: session.token,
      now,
      executor: db,
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'AUTH_IDENTITY_USER_MISMATCH' },
      return_to: '/orgs/oidc-organization',
    })
    await expect(
      db.selectFrom('session_membership_authentications').selectAll().execute()
    ).resolves.toEqual([])
  })

  it('allowed_hosted_domains設定時はID tokenのhd一致を要求する', async () => {
    const fixture = await createFixture({ allowedHostedDomains: ['company-a.example'] })
    await linkIdentity(fixture)
    const state = await startLogin(fixture)

    const result = await completeOrganizationOidc('authorization-code', state, {
      client: callbackClient({ hostedDomain: null }),
      configuredClientId,
      transactionSecret,
      now,
      executor: db,
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'OIDC_HOSTED_DOMAIN_NOT_ALLOWED' },
      return_to: '/orgs/oidc-organization',
    })
  })

  it('active ownerだけがProviderを作成できissuer/domainを正規化してpolicyを更新する', async () => {
    const fixture = await createFixture()
    await db
      .deleteFrom('organization_oidc_providers')
      .where('id', '=', fixture.provider.id)
      .execute()

    const forbidden = await getOrganizationOidcProviders(
      fixture.organization.id,
      fixture.user.id,
      db
    )
    expect(forbidden).toEqual({ ok: false, error: { type: 'AUTH_FORBIDDEN' } })

    await db
      .updateTable('organization_memberships')
      .set({ role: 'owner' })
      .where('id', '=', fixture.membership.id)
      .execute()
    const result = await createOrganizationOidcProvider(
      fixture.organization.id,
      fixture.user.id,
      {
        display_name: 'Google Workspace',
        issuer: 'accounts.google.com',
        client_id: configuredClientId,
        allowed_hosted_domains: [' Company-A.Example ', 'company-a.example'],
        enabled: true,
      },
      configuredClientId,
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      issuer: 'https://accounts.google.com',
      allowed_hosted_domains: ['company-a.example'],
      enabled: true,
    })
    const settings = await db
      .selectFrom('organization_auth_settings')
      .select('policy_version')
      .where('organization_id', '=', fixture.organization.id)
      .executeTakeFirstOrThrow()
    expect(settings.policy_version).toBe('2')
  })

  it('accept_inviteはverified claimsを注入されたcompletionへ渡しstateを再利用させない', async () => {
    const fixture = await createFixture()
    const inviteToken = 'single-use-invite-token'
    const invite = await db
      .insertInto('organization_invites')
      .values({
        organization_id: fixture.organization.id,
        created_by_user_id: fixture.user.id,
        created_by_membership_id: fixture.membership.id,
        email: 'legacy-unused@example.test',
        token_hash: hashActivationToken(inviteToken),
        role: 'member',
        expires_at: new Date('2026-08-12T10:00:00.000Z'),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    let state = ''
    const start = await startOrganizationOidc(
      fixture.organization.slug,
      fixture.provider.id,
      undefined,
      {
        intent: 'accept_invite',
        invite_token: inviteToken,
        return_to: '/invites/complete',
      },
      {
        client: {
          createAuthorizationUrl: (params) => {
            state = params.state
            return `https://accounts.google.com/o/oauth2/v2/auth?state=${params.state}`
          },
        },
        configuredClientId,
        transactionSecret,
        now,
        executor: db,
      }
    )
    expect(start.ok).toBe(true)
    const completeInvite = vi.fn().mockResolvedValue({
      ok: true,
      value: { return_to: '/invites/complete' },
    })
    const options = {
      client: callbackClient({ hostedDomain: 'company-a.example' }),
      configuredClientId,
      transactionSecret,
      completeInvite,
      now,
      executor: db,
    }

    await expect(completeOrganizationOidc('authorization-code', state, options)).resolves.toEqual({
      ok: true,
      value: { return_to: '/invites/complete' },
    })
    expect(completeInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteId: invite.id,
        organizationId: fixture.organization.id,
        providerId: fixture.provider.id,
        transactionSessionId: null,
        claims: expect.objectContaining({
          issuer: 'https://accounts.google.com',
          sub: 'google-subject',
          hostedDomain: 'company-a.example',
        }),
      })
    )

    await expect(completeOrganizationOidc('authorization-code', state, options)).resolves.toEqual({
      ok: false,
      error: { type: 'OIDC_TRANSACTION_INVALID' },
    })
    expect(completeInvite).toHaveBeenCalledTimes(1)
  })
})
