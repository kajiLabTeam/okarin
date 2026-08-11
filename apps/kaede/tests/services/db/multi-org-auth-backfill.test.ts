import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import {
  backfillMultiOrgAuthCore,
  backfillMultiOrgAuthCredentials,
  canonicalGoogleIssuer,
  getMultiOrgAuthPreflightReport,
  validateMultiOrgAuthExpandConstraints,
  verifyMultiOrgAuthCoreBackfill,
} from '../../../src/services/migrations/multi-org-auth-backfill.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash = '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$legacy-password-hash'

const createLegacyUserAndMembership = async (suffix: string) => {
  const user = await db
    .insertInto('users')
    .values({
      display_name: `User ${suffix}`,
      email: `${suffix}@example.com`,
      global_role: 'none',
      password_hash: passwordHash,
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const organization = await db
    .insertInto('organizations')
    .values({ name: `Organization ${suffix}` })
    .returningAll()
    .executeTakeFirstOrThrow()
  const membership = await db
    .insertInto('organization_memberships')
    .values({ organization_id: organization.id, role: 'owner', user_id: user.id })
    .returningAll()
    .executeTakeFirstOrThrow()

  await sql`
    UPDATE organization_memberships
    SET id = NULL, status = NULL, joined_at = NULL
    WHERE organization_id = ${organization.id} AND user_id = ${user.id}
  `.execute(db)
  await sql`UPDATE organizations SET status = NULL WHERE id = ${organization.id}`.execute(db)

  return { membership, organization, user }
}

describe('multi organization auth backfill', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('backfills the safe core fields in batches and is idempotent', async () => {
    const { organization, user } = await createLegacyUserAndMembership('core')
    const pedestrian = await db
      .insertInto('pedestrians')
      .values({
        display_name: 'Organization Persona',
        organization_id: organization.id,
        user_id: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('organization_invites')
      .values({
        created_by_user_id: user.id,
        email: 'invitee@example.com',
        expires_at: new Date('2026-08-20T00:00:00.000Z'),
        organization_id: organization.id,
        role: 'member',
        token_hash: 'legacy-token',
      })
      .execute()

    const first = await backfillMultiOrgAuthCore(1, db)
    const second = await backfillMultiOrgAuthCore(1, db)
    const verification = await verifyMultiOrgAuthCoreBackfill(db)

    expect(first).toMatchObject({
      contact_emails: 1,
      invite_creators: 1,
      memberships: 1,
      member_profiles: 1,
      organizations: 1,
      pedestrian_memberships: 1,
      user_profiles: 1,
    })
    expect(Object.values(second).every((count) => count === 0)).toBe(true)
    expect(Object.values(verification).every((count) => count === 0)).toBe(true)

    const migratedPedestrian = await db
      .selectFrom('pedestrians')
      .select('membership_id')
      .where('id', '=', pedestrian.id)
      .executeTakeFirstOrThrow()
    if (!migratedPedestrian.membership_id) throw new Error('membership was not backfilled')
    const memberProfile = await db
      .selectFrom('organization_member_profiles')
      .selectAll()
      .where('membership_id', '=', migratedPedestrian.membership_id)
      .executeTakeFirstOrThrow()
    expect(memberProfile.display_name).toBe('Organization Persona')
    expect(memberProfile.height_meters).toBeNull()
    expect(memberProfile.stride_length_meters).toBeNull()
  })

  it('normalizes meter and centimeter measurements and reports their classifications', async () => {
    const { organization, user } = await createLegacyUserAndMembership('measurements')
    await db
      .insertInto('pedestrians')
      .values({
        display_name: 'Measured User',
        height: 170,
        organization_id: organization.id,
        stride_length: 0.7,
        user_id: user.id,
      })
      .execute()

    const report = await getMultiOrgAuthPreflightReport(db)
    expect(report.measurements).toEqual({ already_m: 1, converted_cm: 1, invalid: 0 })

    const result = await backfillMultiOrgAuthCore(10, db)
    const profile = await db
      .selectFrom('organization_member_profiles')
      .select(['height_meters', 'stride_length_meters'])
      .executeTakeFirstOrThrow()
    expect(profile).toEqual({ height_meters: '1.700', stride_length_meters: '0.700' })
    expect(result.measurement_values_already_m).toBe(1)
    expect(result.measurement_values_converted_cm).toBe(1)
  })

  it('blocks values that cannot be represented safely after normalization', async () => {
    const { organization, user } = await createLegacyUserAndMembership('invalid-measurement')
    await db
      .insertInto('pedestrians')
      .values({
        display_name: 'Invalid Measurement',
        height: 0.0001,
        organization_id: organization.id,
        stride_length: 301,
        user_id: user.id,
      })
      .execute()

    const report = await getMultiOrgAuthPreflightReport(db)
    expect(report.measurements.invalid).toBe(2)
    await expect(backfillMultiOrgAuthCore(10, db)).rejects.toThrow(
      'PEDESTRIAN_MEASUREMENT_OUT_OF_RANGE'
    )
  })

  it('returns an exact issue count with at most twenty samples', async () => {
    const { organization } = await createLegacyUserAndMembership('bounded-samples')
    await db
      .insertInto('pedestrians')
      .values(
        Array.from({ length: 25 }, (_, index) => ({
          display_name: `Invalid ${index}`,
          height: 301,
          organization_id: organization.id,
        }))
      )
      .execute()

    const report = await getMultiOrgAuthPreflightReport(db)
    const issue = report.issues.find(
      (candidate) => candidate.code === 'PEDESTRIAN_MEASUREMENT_OUT_OF_RANGE'
    )
    expect(issue?.count).toBe(25)
    expect(issue?.samples).toHaveLength(20)
  })

  it('stops core backfill before writing when a blocking legacy issue exists', async () => {
    const { organization, user } = await createLegacyUserAndMembership('legacy-blocker')
    await db
      .insertInto('organization_invites')
      .values({
        created_by_user_id: user.id,
        email: 'legacy-multi-use@example.com',
        expires_at: new Date('2026-08-20T00:00:00.000Z'),
        max_uses: 2,
        organization_id: organization.id,
        role: 'member',
        token_hash: 'legacy-multi-use-token',
      })
      .execute()

    await expect(backfillMultiOrgAuthCore(10, db)).rejects.toThrow('LEGACY_MULTI_USE_INVITE')
    const unchanged = await db
      .selectFrom('organization_memberships')
      .select(['id', 'joined_at', 'status'])
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(unchanged).toEqual({ id: null, joined_at: null, status: null })
  })

  it('stops auth backfill on normalized login email collision', async () => {
    const first = await createLegacyUserAndMembership('collision-first')
    const secondUser = await db
      .insertInto('users')
      .values({
        display_name: 'Collision Second',
        email: 'COLLISION-FIRST@example.com',
        global_role: 'none',
        password_hash: passwordHash,
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('organization_memberships')
      .values({
        organization_id: first.organization.id,
        role: 'member',
        user_id: secondUser.id,
      })
      .execute()
    await db
      .insertInto('organization_auth_settings')
      .values({
        local_auth_enabled: true,
        membership_grant_ttl_seconds: 3600,
        oidc_auth_enabled: false,
        organization_id: first.organization.id,
        reauthentication_interval_seconds: 1800,
      })
      .execute()
    await backfillMultiOrgAuthCore(10, db)

    await expect(backfillMultiOrgAuthCredentials(10, db)).rejects.toThrow(
      'LOCAL_LOGIN_EMAIL_COLLISION'
    )
    expect(await db.selectFrom('organization_local_credentials').selectAll().execute()).toEqual([])
  })

  it('backfills local credentials and canonical Google identities only after explicit policy/provider setup', async () => {
    const { organization, user } = await createLegacyUserAndMembership('auth')
    await backfillMultiOrgAuthCore(10, db)
    await db
      .insertInto('organization_auth_settings')
      .values({
        local_auth_enabled: true,
        membership_grant_ttl_seconds: 3600,
        oidc_auth_enabled: true,
        organization_id: organization.id,
        reauthentication_interval_seconds: 1800,
      })
      .execute()
    await db
      .insertInto('organization_oidc_providers')
      .values({
        client_id: 'legacy-google-client',
        issuer: canonicalGoogleIssuer,
        name: 'Google',
        organization_id: organization.id,
        scopes: ['openid'],
      })
      .execute()
    await db
      .insertInto('auth_identities')
      .values({
        email: user.email,
        email_verified: true,
        provider: 'google',
        provider_subject: 'legacy-google-subject',
        user_id: user.id,
      })
      .execute()

    const first = await backfillMultiOrgAuthCredentials(1, db)
    const second = await backfillMultiOrgAuthCredentials(1, db)

    expect(first).toMatchObject({
      auth_settings_unchanged: 1,
      local_credentials: 1,
      oidc_identities: 1,
      oidc_links: 1,
    })
    expect(second).toMatchObject({
      auth_settings_unchanged: 1,
      local_credentials: 0,
      oidc_identities: 0,
      oidc_links: 0,
    })
    await expect(
      db
        .selectFrom('oidc_identities')
        .select(['issuer', 'subject', 'user_id'])
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({
      issuer: canonicalGoogleIssuer,
      subject: 'legacy-google-subject',
      user_id: user.id,
    })
  })

  it('validates expand constraints and promotes required columns only after core verification', async () => {
    await db
      .transaction()
      .execute(async (trx) => {
        await createLegacyUserAndMembership('validate')
        await backfillMultiOrgAuthCore(10, trx)
        await validateMultiOrgAuthExpandConstraints(trx)

        const columns = await sql<{ attname: string; attnotnull: boolean }>`
          SELECT attribute.attname, attribute.attnotnull
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'organization_memberships'::regclass
            AND attribute.attname IN ('id', 'status', 'joined_at')
          ORDER BY attribute.attname
        `.execute(trx)
        expect(columns.rows).toEqual([
          { attname: 'id', attnotnull: true },
          { attname: 'joined_at', attnotnull: true },
          { attname: 'status', attnotnull: true },
        ])

        throw new Error('rollback constraint promotion test')
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== 'rollback constraint promotion test') {
          throw error
        }
      })
  })
})
