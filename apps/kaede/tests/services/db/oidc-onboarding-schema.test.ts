import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const createUser = async (email: string) => {
  return db
    .insertInto('users')
    .values({
      email,
      display_name: email,
      password_hash: passwordHash,
      global_role: 'none',
      is_active: true,
      password_must_change: false,
      password_changed_at: new Date('2026-06-16T00:00:00.000Z'),
      temporary_password_expires_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

const createOrganization = async (name = 'OIDC Test Organization') => {
  return db.insertInto('organizations').values({ name }).returningAll().executeTakeFirstOrThrow()
}

describe('OIDC onboarding schema', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('organization slug は省略時に有効な一意値を生成する', async () => {
    const first = await createOrganization('First Organization')
    const second = await createOrganization('Second Organization')

    expect(first.slug).toMatch(/^org-[a-z0-9]{32}$/)
    expect(second.slug).toMatch(/^org-[a-z0-9]{32}$/)
    expect(second.slug).not.toBe(first.slug)
  })

  it('organization slug は形式と予約語を制約する', async () => {
    await expect(
      db.insertInto('organizations').values({ name: 'Invalid Slug', slug: 'Invalid' }).execute()
    ).rejects.toThrow()

    await expect(
      db.insertInto('organizations').values({ name: 'Reserved Slug', slug: 'api' }).execute()
    ).rejects.toThrow()
  })

  it('Google identity は provider subject と user ごとに一意にする', async () => {
    const user = await createUser('identity@example.com')
    const otherUser = await createUser('other-identity@example.com')

    await db
      .insertInto('auth_identities')
      .values({
        user_id: user.id,
        provider: 'google',
        provider_subject: 'google-subject-1',
        email: user.email,
        email_verified: true,
        hosted_domain: null,
      })
      .execute()

    await expect(
      db
        .insertInto('auth_identities')
        .values({
          user_id: otherUser.id,
          provider: 'google',
          provider_subject: 'google-subject-1',
          email: otherUser.email,
          email_verified: true,
          hosted_domain: null,
        })
        .execute()
    ).rejects.toThrow()

    await expect(
      db
        .insertInto('auth_identities')
        .values({
          user_id: user.id,
          provider: 'google',
          provider_subject: 'google-subject-2',
          email: user.email,
          email_verified: true,
          hosted_domain: null,
        })
        .execute()
    ).rejects.toThrow()
  })

  it('organization 作成申請は user ごとに pending を 1 件だけ許可する', async () => {
    const user = await createUser('requester@example.com')

    await db
      .insertInto('organization_creation_requests')
      .values({
        requester_user_id: user.id,
        requested_organization_name: 'Requested Organization',
        requested_slug: 'requested-org',
      })
      .execute()

    await expect(
      db
        .insertInto('organization_creation_requests')
        .values({
          requester_user_id: user.id,
          requested_organization_name: 'Another Requested Organization',
          requested_slug: 'another-requested-org',
        })
        .execute()
    ).rejects.toThrow()
  })

  it('organization invite は member role と usage bounds を制約する', async () => {
    const user = await createUser('invite-creator@example.com')
    const organization = await createOrganization()

    await expect(
      db
        .insertInto('organization_invites')
        .values({
          organization_id: organization.id,
          token_hash: 'invite-token-hash',
          email: 'invitee@example.com',
          role: 'manager',
          max_uses: 1,
          used_count: 0,
          expires_at: new Date('2026-06-17T00:00:00.000Z'),
          revoked_at: null,
          created_by_user_id: user.id,
        })
        .execute()
    ).rejects.toThrow()

    await expect(
      db
        .insertInto('organization_invites')
        .values({
          organization_id: organization.id,
          token_hash: 'used-too-much-token-hash',
          email: 'invitee@example.com',
          role: 'member',
          max_uses: 1,
          used_count: 2,
          expires_at: new Date('2026-06-17T00:00:00.000Z'),
          revoked_at: null,
          created_by_user_id: user.id,
        })
        .execute()
    ).rejects.toThrow()
  })
})
