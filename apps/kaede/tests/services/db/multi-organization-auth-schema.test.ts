import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const createUser = async (suffix: string) =>
  db
    .insertInto('users')
    .values({
      email: `${suffix}@example.com`,
      contact_email: 'shared-contact@example.com',
      normalized_contact_email: 'shared-contact@example.com',
      display_name: suffix,
      password_hash: passwordHash,
      global_role: 'none',
      status: 'active',
      password_changed_at: new Date('2026-08-11T00:00:00.000Z'),
    })
    .returningAll()
    .executeTakeFirstOrThrow()

const createOrganization = async (suffix: string) =>
  db
    .insertInto('organizations')
    .values({ name: `Organization ${suffix}` })
    .returningAll()
    .executeTakeFirstOrThrow()

const createMembership = async (
  organizationId: string,
  userId: string,
  role: 'member' | 'manager' | 'owner' = 'member'
) => {
  const membership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organizationId, user_id: userId, role })
    .returningAll()
    .executeTakeFirstOrThrow()

  if (!membership.id) {
    throw new Error('new membership must receive an id from the expand-schema default')
  }

  return { ...membership, id: membership.id }
}

describe('multi-organization auth expand schema', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('既存Kaedeと同じinsert payloadを維持し、新規Membershipだけにdefaultを設定する', async () => {
    const user = await db
      .insertInto('users')
      .values({
        email: 'legacy@example.com',
        display_name: 'Legacy User',
        password_hash: passwordHash,
        global_role: 'none',
        status: 'active',
        password_changed_at: new Date('2026-08-11T00:00:00.000Z'),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Legacy Organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    const membership = await db
      .insertInto('organization_memberships')
      .values({ organization_id: organization.id, user_id: user.id, role: 'member' })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      db
        .insertInto('sessions')
        .values({
          user_id: user.id,
          session_hash: 'legacy-session',
          expires_at: new Date('2026-08-12T00:00:00.000Z'),
          auth_method: 'password',
        })
        .execute()
    ).resolves.toBeDefined()

    await expect(
      db
        .insertInto('organization_invites')
        .values({
          organization_id: organization.id,
          token_hash: 'legacy-invite-token',
          email: 'legacy-invitee@example.com',
          role: 'member',
          max_uses: 1,
          used_count: 0,
          expires_at: new Date('2026-08-18T00:00:00.000Z'),
          created_by_user_id: user.id,
        })
        .execute()
    ).resolves.toBeDefined()

    expect(user.contact_email).toBeNull()
    expect(organization.status).toBe('active')
    expect(membership.id).not.toBeNull()
    expect(membership.status).toBe('active')
    expect(membership.joined_at).toBeInstanceOf(Date)
    expect(membership.left_at).toBeNull()
  })

  it('contact email はUser間およびLocal login emailと重複できる', async () => {
    const organization = await createOrganization('contact-email')
    const firstUser = await createUser('contact-first')
    const secondUser = await createUser('contact-second')
    const membership = await createMembership(organization.id, firstUser.id)

    await expect(
      db
        .insertInto('organization_local_credentials')
        .values({
          membership_id: membership.id,
          organization_id: organization.id,
          login_email: 'shared-contact@example.com',
          normalized_login_email: 'shared-contact@example.com',
          password_hash: passwordHash,
        })
        .execute()
    ).resolves.toBeDefined()

    expect(firstUser.contact_email).toBe(secondUser.contact_email)
  })

  it('Local CredentialはMembershipのOrganizationと一致し、有効emailはOrganization内で一意になる', async () => {
    const firstOrganization = await createOrganization('local-first')
    const secondOrganization = await createOrganization('local-second')
    const firstUser = await createUser('local-first')
    const secondUser = await createUser('local-second')
    const firstMembership = await createMembership(firstOrganization.id, firstUser.id)
    const secondMembership = await createMembership(firstOrganization.id, secondUser.id)

    await expect(
      db
        .insertInto('organization_local_credentials')
        .values({
          membership_id: firstMembership.id,
          organization_id: secondOrganization.id,
          login_email: 'local@example.com',
          normalized_login_email: 'local@example.com',
          password_hash: passwordHash,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: firstMembership.id,
        organization_id: firstOrganization.id,
        login_email: 'local@example.com',
        normalized_login_email: 'local@example.com',
        password_hash: passwordHash,
      })
      .execute()

    await expect(
      db
        .insertInto('organization_local_credentials')
        .values({
          membership_id: secondMembership.id,
          organization_id: firstOrganization.id,
          login_email: 'LOCAL@example.com',
          normalized_login_email: 'local@example.com',
          password_hash: passwordHash,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('OIDC LinkはMembership・IdentityのUserとProviderのOrganizationを一致させる', async () => {
    const firstOrganization = await createOrganization('oidc-first')
    const secondOrganization = await createOrganization('oidc-second')
    const firstUser = await createUser('oidc-first')
    const secondUser = await createUser('oidc-second')
    const membership = await createMembership(firstOrganization.id, firstUser.id)
    const firstIdentity = await db
      .insertInto('oidc_identities')
      .values({
        user_id: firstUser.id,
        issuer: 'https://accounts.google.com',
        subject: 'subject-first-user',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const secondIdentity = await db
      .insertInto('oidc_identities')
      .values({
        user_id: secondUser.id,
        issuer: 'https://accounts.google.com',
        subject: 'subject-second-user',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const firstProvider = await db
      .insertInto('organization_oidc_providers')
      .values({
        organization_id: firstOrganization.id,
        name: 'Google First',
        issuer: 'https://accounts.google.com',
        client_id: 'first-client-id',
        scopes: ['openid'],
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const secondProvider = await db
      .insertInto('organization_oidc_providers')
      .values({
        organization_id: secondOrganization.id,
        name: 'Google Second',
        issuer: 'https://accounts.google.com',
        client_id: 'second-client-id',
        scopes: ['openid'],
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      db
        .insertInto('organization_member_oidc_identities')
        .values({
          membership_id: membership.id,
          organization_id: firstOrganization.id,
          user_id: firstUser.id,
          organization_oidc_provider_id: secondProvider.id,
          oidc_identity_id: firstIdentity.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      db
        .insertInto('organization_member_oidc_identities')
        .values({
          membership_id: membership.id,
          organization_id: firstOrganization.id,
          user_id: firstUser.id,
          organization_oidc_provider_id: firstProvider.id,
          oidc_identity_id: secondIdentity.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      db
        .insertInto('organization_member_oidc_identities')
        .values({
          membership_id: membership.id,
          organization_id: firstOrganization.id,
          user_id: firstUser.id,
          organization_oidc_provider_id: firstProvider.id,
          oidc_identity_id: firstIdentity.id,
        })
        .execute()
    ).resolves.toBeDefined()
  })

  it('Session GrantはSession・MembershipのUser一致と認証元の排他を保証する', async () => {
    const organization = await createOrganization('grant')
    const firstUser = await createUser('grant-first')
    const secondUser = await createUser('grant-second')
    const membership = await createMembership(organization.id, firstUser.id)
    const credential = await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: membership.id,
        organization_id: organization.id,
        login_email: 'grant@example.com',
        normalized_login_email: 'grant@example.com',
        password_hash: passwordHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const secondUserSession = await db
      .insertInto('sessions')
      .values({
        user_id: secondUser.id,
        session_hash: 'second-user-session',
        expires_at: new Date('2026-08-13T00:00:00.000Z'),
        auth_method: 'password',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      db
        .insertInto('session_membership_authentications')
        .values({
          session_id: secondUserSession.id,
          membership_id: membership.id,
          user_id: firstUser.id,
          auth_method: 'local',
          policy_version: 1,
          local_credential_id: credential.id,
          authenticated_at: new Date('2026-08-11T00:00:00.000Z'),
          expires_at: new Date('2026-08-12T00:00:00.000Z'),
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    const firstUserSession = await db
      .insertInto('sessions')
      .values({
        user_id: firstUser.id,
        session_hash: 'first-user-session',
        expires_at: new Date('2026-08-13T00:00:00.000Z'),
        auth_method: 'password',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(
      db
        .insertInto('session_membership_authentications')
        .values({
          session_id: firstUserSession.id,
          membership_id: membership.id,
          user_id: firstUser.id,
          auth_method: 'local',
          policy_version: 1,
          local_credential_id: null,
          authenticated_at: new Date('2026-08-11T00:00:00.000Z'),
          expires_at: new Date('2026-08-12T00:00:00.000Z'),
        })
        .execute()
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('Session Grantは別MembershipのLocal/OIDC認証元を参照できない', async () => {
    const firstOrganization = await createOrganization('grant-source-first')
    const secondOrganization = await createOrganization('grant-source-second')
    const user = await createUser('grant-source')
    const firstMembership = await createMembership(firstOrganization.id, user.id)
    const secondMembership = await createMembership(secondOrganization.id, user.id)
    const secondCredential = await db
      .insertInto('organization_local_credentials')
      .values({
        membership_id: secondMembership.id,
        organization_id: secondOrganization.id,
        login_email: 'second-grant@example.com',
        normalized_login_email: 'second-grant@example.com',
        password_hash: passwordHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const identity = await db
      .insertInto('oidc_identities')
      .values({
        user_id: user.id,
        issuer: 'https://accounts.google.com',
        subject: 'grant-source-subject',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const secondProvider = await db
      .insertInto('organization_oidc_providers')
      .values({
        organization_id: secondOrganization.id,
        name: 'Second Google',
        issuer: 'https://accounts.google.com',
        client_id: 'second-grant-client',
        scopes: ['openid'],
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const secondOidcLink = await db
      .insertInto('organization_member_oidc_identities')
      .values({
        membership_id: secondMembership.id,
        organization_id: secondOrganization.id,
        user_id: user.id,
        organization_oidc_provider_id: secondProvider.id,
        oidc_identity_id: identity.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const session = await db
      .insertInto('sessions')
      .values({
        user_id: user.id,
        session_hash: 'grant-source-session',
        expires_at: new Date('2026-08-13T00:00:00.000Z'),
        auth_method: 'password',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const grantBase = {
      session_id: session.id,
      membership_id: firstMembership.id,
      user_id: user.id,
      policy_version: 1,
      authenticated_at: new Date('2026-08-11T00:00:00.000Z'),
      expires_at: new Date('2026-08-12T00:00:00.000Z'),
    }

    await expect(
      db
        .insertInto('session_membership_authentications')
        .values({
          ...grantBase,
          auth_method: 'local',
          local_credential_id: secondCredential.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      db
        .insertInto('session_membership_authentications')
        .values({
          ...grantBase,
          auth_method: 'oidc',
          member_oidc_identity_id: secondOidcLink.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('Membership退出日時と認証Policyの期間をCHECKで保証する', async () => {
    const organization = await createOrganization('checks')
    const user = await createUser('checks')

    await expect(
      db
        .insertInto('organization_memberships')
        .values({
          organization_id: organization.id,
          user_id: user.id,
          role: 'member',
          status: 'left',
          left_at: null,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      db
        .insertInto('organization_auth_settings')
        .values({
          organization_id: organization.id,
          local_auth_enabled: true,
          oidc_auth_enabled: false,
          policy_version: 1,
          membership_grant_ttl_seconds: 300,
          reauthentication_interval_seconds: 301,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      db
        .insertInto('organization_auth_settings')
        .values({
          organization_id: organization.id,
          local_auth_enabled: false,
          oidc_auth_enabled: false,
          policy_version: 1,
          membership_grant_ttl_seconds: 300,
          reauthentication_interval_seconds: 300,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('OIDC ProviderはNULLを含むscope配列をopenidありとして誤認しない', async () => {
    const organization = await createOrganization('provider-scope')

    await expect(
      db
        .insertInto('organization_oidc_providers')
        .values({
          organization_id: organization.id,
          name: 'Invalid Scopes',
          issuer: 'https://accounts.google.com',
          client_id: 'invalid-scopes-client',
          scopes: [],
        })
        .execute()
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      sql`
        INSERT INTO organization_oidc_providers (
          organization_id,
          name,
          issuer,
          client_id,
          scopes
        ) VALUES (
          ${organization.id},
          'Null Scope',
          'https://accounts.google.com',
          'null-scope-client',
          ARRAY[NULL]::text[]
        )
      `.execute(db)
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      db
        .insertInto('organization_oidc_providers')
        .values({
          organization_id: organization.id,
          name: 'Valid Scopes',
          issuer: 'https://accounts.google.com',
          client_id: 'valid-scopes-client',
          scopes: ['email', 'openid'],
        })
        .execute()
    ).resolves.toBeDefined()
  })

  it('PedestrianとInvite redemptionはMembershipのOrganization境界を越えられない', async () => {
    const firstOrganization = await createOrganization('tenant-first')
    const secondOrganization = await createOrganization('tenant-second')
    const user = await createUser('tenant')
    const membership = await createMembership(firstOrganization.id, user.id)

    await expect(
      db
        .insertInto('pedestrians')
        .values({
          display_name: 'Tenant Pedestrian',
          organization_id: secondOrganization.id,
          membership_id: membership.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      db
        .insertInto('organization_invites')
        .values({
          organization_id: secondOrganization.id,
          token_hash: 'redeemed-invite-token',
          email: 'invitee@example.com',
          role: 'member',
          max_uses: 1,
          used_count: 0,
          expires_at: new Date('2026-08-18T00:00:00.000Z'),
          created_by_user_id: user.id,
          redeemed_at: new Date('2026-08-11T00:00:00.000Z'),
          redeemed_membership_id: membership.id,
        })
        .execute()
    ).rejects.toMatchObject({ code: '23503' })
  })
})
