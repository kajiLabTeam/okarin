import { sql } from 'kysely'
import type { Kysely, RawBuilder } from 'kysely'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const canonicalGoogleIssuer = 'https://accounts.google.com'

export type PreflightScope = 'core' | 'auth' | 'measurements' | 'legacy'

export interface PreflightIssue {
  blocking: boolean
  code: string
  count: number
  description: string
  scope: PreflightScope
  samples: string[]
}

export interface PreflightReport {
  blocking: boolean
  issues: PreflightIssue[]
  measurements: MeasurementClassification
}

export interface MeasurementClassification {
  valid_meters: number
  invalid: number
}

export interface BackfillResult {
  auth_settings_unchanged: number
  contact_emails: number
  invite_creators: number
  local_credentials: number
  measurement_values_copied_meters: number
  memberships: number
  member_profiles: number
  oidc_identities: number
  oidc_links: number
  organizations: number
  pedestrian_memberships: number
  user_profiles: number
}

export interface OneShotCutoverResult {
  already_completed: boolean
  auth: BackfillResult
  bootstrapped_auth_settings: number
  bootstrapped_oidc_providers: number
  core: BackfillResult
  revoked_sessions: number
  validated: true
}

export interface LegacyAuthPolicyBootstrap {
  google_client_id: string
  local_auth_enabled: boolean
  oidc_auth_enabled: boolean
}

const cutoverMigrationName = 'multi-organization-auth-v1'

const emptyResult = (): BackfillResult => ({
  auth_settings_unchanged: 0,
  contact_emails: 0,
  invite_creators: 0,
  local_credentials: 0,
  measurement_values_copied_meters: 0,
  memberships: 0,
  member_profiles: 0,
  oidc_identities: 0,
  oidc_links: 0,
  organizations: 0,
  pedestrian_memberships: 0,
  user_profiles: 0,
})

const getIssue = async (
  executor: DbExecutor,
  issue: Omit<PreflightIssue, 'count' | 'samples'>,
  query: RawBuilder<{ sample: string }>
): Promise<PreflightIssue | undefined> => {
  const result = await sql<{ sample: string; total_count: number }>`
    SELECT sample, (count(*) OVER ())::integer AS total_count
    FROM (${query}) AS issue
    LIMIT 20
  `.execute(executor)
  if (result.rows.length === 0) return undefined

  return {
    ...issue,
    count: result.rows[0]?.total_count ?? 0,
    samples: result.rows.map((row) => row.sample),
  }
}

export const getMultiOrgAuthPreflightReport = async (
  executor: DbExecutor = db
): Promise<PreflightReport> => {
  const [candidates, measurementRows] = await Promise.all([
    Promise.all([
      getIssue(
        executor,
        {
          blocking: true,
          code: 'LOCAL_LOGIN_EMAIL_COLLISION',
          description:
            'The same normalized legacy login email belongs to multiple users in one organization.',
          scope: 'auth',
        },
        sql<{ sample: string }>`
        SELECT organization_id::text || ':' || lower(btrim(u.email)) AS sample
        FROM organization_memberships AS m
        JOIN users AS u ON u.id = m.user_id
        WHERE u.password_hash IS NOT NULL
          AND COALESCE(m.status, 'active') IN ('active', 'suspended')
        GROUP BY organization_id, lower(btrim(u.email))
        HAVING count(*) > 1
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'MISSING_ORGANIZATION_AUTH_POLICY',
          description:
            'Organization authentication policy is an operator decision and cannot be inferred from global runtime flags.',
          scope: 'auth',
        },
        sql<{ sample: string }>`
        SELECT o.id::text AS sample
        FROM organizations AS o
        LEFT JOIN organization_auth_settings AS settings
          ON settings.organization_id = o.id
        WHERE settings.organization_id IS NULL
        ORDER BY o.id
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'OIDC_PROVIDER_MAPPING_MISSING_OR_AMBIGUOUS',
          description:
            'An OIDC-enabled organization with a legacy Google user must have exactly one enabled canonical Google provider.',
          scope: 'auth',
        },
        sql<{ sample: string }>`
        SELECT DISTINCT m.organization_id::text AS sample
        FROM organization_memberships AS m
        JOIN auth_identities AS legacy
          ON legacy.user_id = m.user_id
         AND legacy.provider = 'google'
        JOIN organization_auth_settings AS settings
          ON settings.organization_id = m.organization_id
         AND settings.oidc_auth_enabled
        LEFT JOIN organization_oidc_providers AS provider
          ON provider.organization_id = m.organization_id
         AND provider.enabled
         AND provider.issuer = ${canonicalGoogleIssuer}
        WHERE COALESCE(m.status, 'active') IN ('active', 'suspended')
        GROUP BY m.organization_id, m.user_id
        HAVING count(provider.id) <> 1
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'OIDC_IDENTITY_OWNER_CONFLICT',
          description: 'A canonical issuer and subject pair resolves to more than one user.',
          scope: 'auth',
        },
        sql<{ sample: string }>`
        WITH identities AS (
          SELECT ${canonicalGoogleIssuer}::text AS issuer, provider_subject AS subject, user_id
          FROM auth_identities
          WHERE provider = 'google'
          UNION ALL
          SELECT issuer, subject, user_id
          FROM oidc_identities
        )
        SELECT issuer || ':' || subject AS sample
        FROM identities
        GROUP BY issuer, subject
        HAVING count(DISTINCT user_id) > 1
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'PEDESTRIAN_MEMBERSHIP_NOT_FOUND',
          description: 'A pedestrian user and organization do not resolve to a membership.',
          scope: 'core',
        },
        sql<{ sample: string }>`
        SELECT p.id::text AS sample
        FROM pedestrians AS p
        LEFT JOIN organization_memberships AS m
          ON m.organization_id = p.organization_id
         AND m.user_id = p.user_id
         AND COALESCE(m.status, 'active') IN ('active', 'suspended')
        WHERE p.user_id IS NOT NULL
          AND m.user_id IS NULL
        ORDER BY p.id
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'PEDESTRIAN_MEASUREMENT_OUT_OF_RANGE',
          description: 'Legacy measurements must be in meters, greater than 0, and at most 3.',
          scope: 'measurements',
        },
        sql<{ sample: string }>`
        SELECT p.id::text || ':height=' || p.height::text AS sample
        FROM pedestrians AS p
        WHERE p.height IS NOT NULL
          AND (
            NOT (p.height > 0 AND p.height <= 3)
            OR round(p.height::numeric, 3) <= 0
          )
        UNION ALL
        SELECT p.id::text || ':stride_length=' || p.stride_length::text AS sample
        FROM pedestrians AS p
        WHERE p.stride_length IS NOT NULL
          AND (
            NOT (p.stride_length > 0 AND p.stride_length <= 3)
            OR round(p.stride_length::numeric, 3) <= 0
          )
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'INVITE_CREATOR_MEMBERSHIP_NOT_FOUND',
          description:
            'A legacy invite creator does not have a current membership in the organization.',
          scope: 'core',
        },
        sql<{ sample: string }>`
        SELECT invite.id::text AS sample
        FROM organization_invites AS invite
        LEFT JOIN organization_memberships AS m
          ON m.organization_id = invite.organization_id
         AND m.user_id = invite.created_by_user_id
         AND COALESCE(m.status, 'active') IN ('active', 'suspended')
        WHERE invite.created_by_membership_id IS NULL
          AND m.user_id IS NULL
        ORDER BY invite.id
      `
      ),
      getIssue(
        executor,
        {
          blocking: true,
          code: 'LEGACY_MULTI_USE_INVITE',
          description:
            'Multi-use or already-used legacy invites require an operator migration decision.',
          scope: 'legacy',
        },
        sql<{ sample: string }>`
        SELECT id::text AS sample
        FROM organization_invites
        WHERE max_uses <> 1 OR used_count <> 0
        ORDER BY id
      `
      ),
      getIssue(
        executor,
        {
          blocking: false,
          code: 'PENDING_ACTIVATION_USER',
          description: 'Pending activation users must be handled by the cutover plan.',
          scope: 'legacy',
        },
        sql<{ sample: string }>`
        SELECT id::text AS sample
        FROM users
        WHERE status = 'pending_activation'
        ORDER BY id
      `
      ),
    ]),
    sql<MeasurementClassification>`
      SELECT
        (
          count(*) FILTER (WHERE height > 0 AND height <= 3 AND round(height::numeric, 3) > 0)
          + count(*) FILTER (
              WHERE stride_length > 0
                AND stride_length <= 3
                AND round(stride_length::numeric, 3) > 0
            )
        )::integer AS valid_meters,
        (
          count(*) FILTER (
              WHERE height IS NOT NULL
                AND (
                  NOT (height > 0 AND height <= 3)
                  OR round(height::numeric, 3) <= 0
                )
            )
          + count(*) FILTER (
              WHERE stride_length IS NOT NULL
                AND (
                  NOT (stride_length > 0 AND stride_length <= 3)
                  OR round(stride_length::numeric, 3) <= 0
                )
            )
        )::integer AS invalid
      FROM pedestrians
    `.execute(executor),
  ])

  const issues = candidates.filter((issue): issue is PreflightIssue => issue !== undefined)
  return {
    blocking: issues.some((issue) => issue.blocking),
    issues,
    measurements: measurementRows.rows[0] ?? { valid_meters: 0, invalid: 0 },
  }
}

const runBatches = async (runBatch: () => Promise<number>): Promise<number> => {
  let total = 0
  for (;;) {
    const updated = await runBatch()
    total += updated
    if (updated === 0) return total
  }
}

export const backfillMultiOrgAuthCore = async (
  batchSize: number,
  executor: DbExecutor = db
): Promise<BackfillResult> => {
  const result = emptyResult()
  const preflight = await getMultiOrgAuthPreflightReport(executor)
  const blockers = preflight.issues.filter(
    (issue) =>
      issue.blocking &&
      (issue.scope === 'core' || issue.scope === 'measurements' || issue.scope === 'legacy')
  )
  if (blockers.length > 0) {
    throw new Error(`core backfill blocked: ${blockers.map((issue) => issue.code).join(', ')}`)
  }

  result.organizations = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      WITH target AS (
        SELECT id FROM organizations WHERE status IS NULL ORDER BY id LIMIT ${batchSize}
      )
      UPDATE organizations AS o
      SET status = 'active'
      FROM target
      WHERE o.id = target.id
      RETURNING o.id
    `.execute(executor)
    return rows.rows.length
  })

  result.memberships = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      WITH target AS (
        SELECT organization_id, user_id
        FROM organization_memberships
        WHERE id IS NULL OR status IS NULL OR joined_at IS NULL
        ORDER BY organization_id, user_id
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE organization_memberships AS m
      SET
        id = COALESCE(m.id, gen_random_uuid()),
        status = COALESCE(m.status, 'active'),
        joined_at = COALESCE(m.joined_at, m.created_at)
      FROM target
      WHERE m.organization_id = target.organization_id
        AND m.user_id = target.user_id
      RETURNING m.id
    `.execute(executor)
    return rows.rows.length
  })

  result.contact_emails = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      WITH target AS (
        SELECT id FROM users WHERE contact_email IS NULL ORDER BY id LIMIT ${batchSize}
      )
      UPDATE users AS u
      SET
        contact_email = u.email,
        normalized_contact_email = lower(btrim(u.email))
      FROM target
      WHERE u.id = target.id
      RETURNING u.id
    `.execute(executor)
    return rows.rows.length
  })

  result.user_profiles = await runBatches(async () => {
    const rows = await sql<{ user_id: string }>`
      INSERT INTO user_profiles (user_id, display_name)
      SELECT u.id, u.display_name
      FROM users AS u
      LEFT JOIN user_profiles AS profile ON profile.user_id = u.id
      WHERE profile.user_id IS NULL
      ORDER BY u.id
      LIMIT ${batchSize}
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    `.execute(executor)
    return rows.rows.length
  })

  result.pedestrian_memberships = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      WITH target AS (
        SELECT p.id, m.id AS membership_id
        FROM pedestrians AS p
        JOIN organization_memberships AS m
          ON m.organization_id = p.organization_id
         AND m.user_id = p.user_id
         AND m.status IN ('active', 'suspended')
        WHERE p.membership_id IS NULL
        ORDER BY p.id
        LIMIT ${batchSize}
      )
      UPDATE pedestrians AS p
      SET membership_id = target.membership_id
      FROM target
      WHERE p.id = target.id
      RETURNING p.id
    `.execute(executor)
    return rows.rows.length
  })

  result.member_profiles = await runBatches(async () => {
    const rows = await sql<{ membership_id: string }>`
      INSERT INTO organization_member_profiles (membership_id, display_name)
      SELECT
        m.id,
        CASE
          WHEN p.display_name IS DISTINCT FROM u.display_name THEN p.display_name
          ELSE NULL
        END
      FROM organization_memberships AS m
      JOIN users AS u ON u.id = m.user_id
      LEFT JOIN pedestrians AS p ON p.membership_id = m.id
      LEFT JOIN organization_member_profiles AS profile ON profile.membership_id = m.id
      WHERE m.id IS NOT NULL
        AND profile.membership_id IS NULL
      ORDER BY m.id
      LIMIT ${batchSize}
      ON CONFLICT (membership_id) DO NOTHING
      RETURNING membership_id
    `.execute(executor)
    return rows.rows.length
  })

  for (;;) {
    const rows = await sql<{
      height_copied_meters: boolean
      stride_copied_meters: boolean
    }>`
      WITH target AS (
        SELECT
          p.membership_id,
          p.height,
          p.stride_length,
          profile.height_meters IS NULL AND p.height IS NOT NULL AS height_needs_backfill,
          profile.stride_length_meters IS NULL AND p.stride_length IS NOT NULL
            AS stride_needs_backfill
        FROM pedestrians AS p
        JOIN organization_member_profiles AS profile
          ON profile.membership_id = p.membership_id
        WHERE
          (profile.height_meters IS NULL AND p.height IS NOT NULL)
          OR (profile.stride_length_meters IS NULL AND p.stride_length IS NOT NULL)
        ORDER BY p.membership_id
        LIMIT ${batchSize}
        FOR UPDATE OF p SKIP LOCKED
      )
      UPDATE organization_member_profiles AS profile
      SET
        height_meters = CASE
          WHEN profile.height_meters IS NOT NULL OR target.height IS NULL
            THEN profile.height_meters
          ELSE round(target.height::numeric, 3)
        END,
        stride_length_meters = CASE
          WHEN profile.stride_length_meters IS NOT NULL OR target.stride_length IS NULL
            THEN profile.stride_length_meters
          ELSE round(target.stride_length::numeric, 3)
        END
      FROM target
      WHERE profile.membership_id = target.membership_id
      RETURNING
        target.height_needs_backfill AS height_copied_meters,
        target.stride_needs_backfill AS stride_copied_meters
    `.execute(executor)

    if (rows.rows.length === 0) break
    for (const row of rows.rows) {
      if (row.height_copied_meters) result.measurement_values_copied_meters += 1
      if (row.stride_copied_meters) result.measurement_values_copied_meters += 1
    }
  }

  result.invite_creators = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      WITH target AS (
        SELECT invite.id, m.id AS membership_id
        FROM organization_invites AS invite
        JOIN organization_memberships AS m
          ON m.organization_id = invite.organization_id
         AND m.user_id = invite.created_by_user_id
         AND m.status IN ('active', 'suspended')
        WHERE invite.created_by_membership_id IS NULL
        ORDER BY invite.id
        LIMIT ${batchSize}
      )
      UPDATE organization_invites AS invite
      SET created_by_membership_id = target.membership_id
      FROM target
      WHERE invite.id = target.id
      RETURNING invite.id
    `.execute(executor)
    return rows.rows.length
  })

  return result
}

export const backfillMultiOrgAuthCredentials = async (
  batchSize: number,
  executor: DbExecutor = db
): Promise<BackfillResult> => {
  const result = emptyResult()
  const coreVerification = await verifyMultiOrgAuthCoreBackfill(executor)
  if (Object.values(coreVerification).some((count) => count > 0)) {
    throw new Error('authentication backfill requires completed core backfill')
  }
  const report = await getMultiOrgAuthPreflightReport(executor)
  const blockers = report.issues.filter((issue) => issue.blocking && issue.scope === 'auth')
  if (blockers.length > 0) {
    throw new Error(
      `authentication backfill blocked: ${blockers.map((issue) => issue.code).join(', ')}`
    )
  }

  result.auth_settings_unchanged = await sql<{ count: number }>`
    SELECT count(*)::integer AS count FROM organization_auth_settings
  `
    .execute(executor)
    .then((rows) => rows.rows[0]?.count ?? 0)

  result.local_credentials = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      INSERT INTO organization_local_credentials (
        membership_id,
        organization_id,
        login_email,
        normalized_login_email,
        password_hash,
        password_changed_at,
        failed_login_attempts,
        locked_until
      )
      SELECT
        m.id,
        m.organization_id,
        u.email,
        lower(btrim(u.email)),
        u.password_hash,
        COALESCE(u.password_changed_at, u.created_at),
        u.failed_login_attempts,
        u.locked_until
      FROM organization_memberships AS m
      JOIN users AS u ON u.id = m.user_id
      JOIN organization_auth_settings AS settings
        ON settings.organization_id = m.organization_id
       AND settings.local_auth_enabled
      LEFT JOIN organization_local_credentials AS credential
        ON credential.membership_id = m.id
      WHERE m.id IS NOT NULL
        AND m.status IN ('active', 'suspended')
        AND u.password_hash IS NOT NULL
        AND credential.id IS NULL
      ORDER BY m.id
      LIMIT ${batchSize}
      ON CONFLICT (membership_id) DO NOTHING
      RETURNING id
    `.execute(executor)
    return rows.rows.length
  })

  result.oidc_identities = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      INSERT INTO oidc_identities (
        user_id,
        issuer,
        subject,
        last_claimed_email,
        last_claimed_email_verified
      )
      SELECT
        legacy.user_id,
        ${canonicalGoogleIssuer},
        legacy.provider_subject,
        legacy.email,
        legacy.email_verified
      FROM auth_identities AS legacy
      LEFT JOIN oidc_identities AS identity
        ON identity.issuer = ${canonicalGoogleIssuer}
       AND identity.subject = legacy.provider_subject
      WHERE legacy.provider = 'google'
        AND identity.id IS NULL
      ORDER BY legacy.id
      LIMIT ${batchSize}
      ON CONFLICT (issuer, subject) DO NOTHING
      RETURNING id
    `.execute(executor)
    return rows.rows.length
  })

  result.oidc_links = await runBatches(async () => {
    const rows = await sql<{ id: string }>`
      INSERT INTO organization_member_oidc_identities (
        membership_id,
        organization_id,
        user_id,
        organization_oidc_provider_id,
        oidc_identity_id
      )
      SELECT
        m.id,
        m.organization_id,
        m.user_id,
        provider.id,
        identity.id
      FROM organization_memberships AS m
      JOIN organization_auth_settings AS settings
        ON settings.organization_id = m.organization_id
       AND settings.oidc_auth_enabled
      JOIN oidc_identities AS identity
        ON identity.user_id = m.user_id
       AND identity.issuer = ${canonicalGoogleIssuer}
      JOIN organization_oidc_providers AS provider
        ON provider.organization_id = m.organization_id
       AND provider.enabled
       AND provider.issuer = ${canonicalGoogleIssuer}
      LEFT JOIN organization_member_oidc_identities AS link
        ON link.membership_id = m.id
       AND link.organization_oidc_provider_id = provider.id
       AND link.oidc_identity_id = identity.id
      WHERE m.id IS NOT NULL
        AND m.status IN ('active', 'suspended')
        AND link.id IS NULL
      ORDER BY m.id
      LIMIT ${batchSize}
      ON CONFLICT (
        membership_id,
        organization_oidc_provider_id,
        oidc_identity_id
      ) DO NOTHING
      RETURNING id
    `.execute(executor)
    return rows.rows.length
  })

  return result
}

export interface VerificationResult {
  pending_contact_emails: number
  pending_invite_creators: number
  pending_member_profiles: number
  pending_memberships: number
  pending_organization_statuses: number
  pending_pedestrian_memberships: number
  pending_profile_measurements: number
  pending_user_profiles: number
}

export const verifyMultiOrgAuthCoreBackfill = async (
  executor: DbExecutor = db
): Promise<VerificationResult> => {
  const rows = await sql<VerificationResult>`
    SELECT
      (SELECT count(*) FROM organizations WHERE status IS NULL)::integer
        AS pending_organization_statuses,
      (SELECT count(*) FROM organization_memberships
        WHERE id IS NULL OR status IS NULL OR joined_at IS NULL)::integer
        AS pending_memberships,
      (SELECT count(*) FROM users WHERE contact_email IS NULL)::integer
        AS pending_contact_emails,
      (SELECT count(*) FROM users AS u LEFT JOIN user_profiles AS p ON p.user_id = u.id
        WHERE p.user_id IS NULL)::integer AS pending_user_profiles,
      (SELECT count(*) FROM pedestrians
        WHERE user_id IS NOT NULL AND membership_id IS NULL)::integer
        AS pending_pedestrian_memberships,
      (SELECT count(*) FROM organization_memberships AS m
        LEFT JOIN organization_member_profiles AS profile ON profile.membership_id = m.id
        WHERE m.id IS NOT NULL AND profile.membership_id IS NULL)::integer
        AS pending_member_profiles,
      (SELECT count(*) FROM pedestrians AS p
        JOIN organization_member_profiles AS profile ON profile.membership_id = p.membership_id
        WHERE (p.height IS NOT NULL AND profile.height_meters IS NULL)
           OR (p.stride_length IS NOT NULL AND profile.stride_length_meters IS NULL))::integer
        AS pending_profile_measurements,
      (SELECT count(*) FROM organization_invites
        WHERE created_by_membership_id IS NULL)::integer AS pending_invite_creators
  `.execute(executor)
  return (
    rows.rows[0] ?? {
      pending_contact_emails: 0,
      pending_invite_creators: 0,
      pending_member_profiles: 0,
      pending_memberships: 0,
      pending_organization_statuses: 0,
      pending_pedestrian_memberships: 0,
      pending_profile_measurements: 0,
      pending_user_profiles: 0,
    }
  )
}

export const validateMultiOrgAuthExpandConstraints = async (
  executor: DbExecutor = db
): Promise<void> => {
  const verification = await verifyMultiOrgAuthCoreBackfill(executor)
  if (Object.values(verification).some((count) => count > 0)) {
    throw new Error(`constraint validation blocked: ${JSON.stringify(verification)}`)
  }

  await sql
    .raw(
      `
    SET LOCAL lock_timeout = '5s';

    ALTER TABLE users VALIDATE CONSTRAINT users_contact_email_state_chk;
    ALTER TABLE organizations VALIDATE CONSTRAINT organizations_status_chk;
    ALTER TABLE organization_memberships
      VALIDATE CONSTRAINT organization_memberships_status_chk;
    ALTER TABLE organization_memberships
      VALIDATE CONSTRAINT organization_memberships_left_at_chk;
    ALTER TABLE organization_member_profiles
      VALIDATE CONSTRAINT organization_member_profiles_height_meter_bounds_chk;
    ALTER TABLE organization_member_profiles
      VALIDATE CONSTRAINT organization_member_profiles_stride_meter_bounds_chk;
    ALTER TABLE pedestrians
      VALIDATE CONSTRAINT pedestrians_membership_organization_fkey;
    ALTER TABLE pedestrians
      VALIDATE CONSTRAINT pedestrians_height_meter_bounds_chk;
    ALTER TABLE pedestrians
      VALIDATE CONSTRAINT pedestrians_stride_meter_bounds_chk;
    ALTER TABLE organization_invites
      VALIDATE CONSTRAINT organization_invites_creator_org_fkey;
    ALTER TABLE organization_invites
      VALIDATE CONSTRAINT organization_invites_redeemed_membership_org_fkey;
    ALTER TABLE organization_invites
      VALIDATE CONSTRAINT organization_invites_redemption_state_chk;
    ALTER TABLE organization_invites
      VALIDATE CONSTRAINT organization_invites_revoked_redeemed_chk;
    ALTER TABLE organization_invites
      VALIDATE CONSTRAINT organization_invites_role_chk;

    ALTER TABLE organizations
      ADD CONSTRAINT organizations_status_not_null_backfill_chk
      CHECK (status IS NOT NULL) NOT VALID;
    ALTER TABLE organization_memberships
      ADD CONSTRAINT organization_memberships_id_not_null_backfill_chk
      CHECK (id IS NOT NULL) NOT VALID;
    ALTER TABLE organization_memberships
      ADD CONSTRAINT organization_memberships_status_not_null_backfill_chk
      CHECK (status IS NOT NULL) NOT VALID;
    ALTER TABLE organization_memberships
      ADD CONSTRAINT organization_memberships_joined_at_not_null_backfill_chk
      CHECK (joined_at IS NOT NULL) NOT VALID;

    ALTER TABLE organizations
      VALIDATE CONSTRAINT organizations_status_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      VALIDATE CONSTRAINT organization_memberships_id_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      VALIDATE CONSTRAINT organization_memberships_status_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      VALIDATE CONSTRAINT organization_memberships_joined_at_not_null_backfill_chk;

    ALTER TABLE organizations ALTER COLUMN status SET NOT NULL;
    ALTER TABLE organization_memberships ALTER COLUMN id SET NOT NULL;
    ALTER TABLE organization_memberships ALTER COLUMN status SET NOT NULL;
    ALTER TABLE organization_memberships ALTER COLUMN joined_at SET NOT NULL;

    ALTER TABLE organizations
      DROP CONSTRAINT organizations_status_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      DROP CONSTRAINT organization_memberships_id_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      DROP CONSTRAINT organization_memberships_status_not_null_backfill_chk;
    ALTER TABLE organization_memberships
      DROP CONSTRAINT organization_memberships_joined_at_not_null_backfill_chk;
  `
    )
    .execute(executor)
}

/**
 * Migrates all legacy authentication data during a single maintenance window.
 *
 * The application must remain stopped until this transaction and the following
 * membership primary-key/contract migrations have completed. A failed run rolls
 * back every data write and session revocation performed here; the application
 * must never restart against a partially migrated database.
 */
export const executeOneShotMultiOrgAuthCutover = async (
  batchSize: number,
  database: Kysely<DB> = db,
  bootstrap?: LegacyAuthPolicyBootstrap
): Promise<OneShotCutoverResult> =>
  database.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${cutoverMigrationName}))`.execute(trx)

    const completed = await sql<{ completed: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM application_data_migrations WHERE name = ${cutoverMigrationName}
      ) AS completed
    `.execute(trx)
    if (completed.rows[0]?.completed) {
      return {
        already_completed: true,
        auth: emptyResult(),
        bootstrapped_auth_settings: 0,
        bootstrapped_oidc_providers: 0,
        core: emptyResult(),
        revoked_sessions: 0,
        validated: true,
      }
    }

    let bootstrappedAuthSettings = 0
    let bootstrappedOidcProviders = 0
    if (bootstrap) {
      if (!bootstrap.local_auth_enabled && !bootstrap.oidc_auth_enabled) {
        throw new Error('one-shot cutover requires at least one enabled authentication method')
      }

      const settings = await sql<{ organization_id: string }>`
        INSERT INTO organization_auth_settings (
          organization_id,
          local_auth_enabled,
          oidc_auth_enabled,
          membership_grant_ttl_seconds,
          reauthentication_interval_seconds
        )
        SELECT id, ${bootstrap.local_auth_enabled}, ${bootstrap.oidc_auth_enabled}, 28800, 14400
        FROM organizations
        ON CONFLICT (organization_id) DO NOTHING
        RETURNING organization_id
      `.execute(trx)
      bootstrappedAuthSettings = settings.rows.length

      if (bootstrap.oidc_auth_enabled) {
        if (!bootstrap.google_client_id) {
          throw new Error('one-shot OIDC cutover requires the configured Google client id')
        }
        const providers = await sql<{ id: string }>`
          INSERT INTO organization_oidc_providers (
            organization_id,
            name,
            issuer,
            client_id,
            client_secret_ref,
            scopes,
            allowed_hosted_domains,
            enabled
          )
          SELECT
            settings.organization_id,
            'Google',
            ${canonicalGoogleIssuer},
            ${bootstrap.google_client_id},
            NULL,
            ARRAY['openid', 'email', 'profile']::text[],
            NULL,
            true
          FROM organization_auth_settings AS settings
          WHERE settings.oidc_auth_enabled
            AND NOT EXISTS (
              SELECT 1
              FROM organization_oidc_providers AS provider
              WHERE provider.organization_id = settings.organization_id
                AND provider.issuer = ${canonicalGoogleIssuer}
                AND provider.enabled
            )
          RETURNING id
        `.execute(trx)
        bootstrappedOidcProviders = providers.rows.length
      }
    }

    const preflight = await getMultiOrgAuthPreflightReport(trx)
    if (preflight.blocking) {
      throw new Error(
        `one-shot cutover blocked: ${preflight.issues
          .filter((issue) => issue.blocking)
          .map((issue) => issue.code)
          .join(', ')}`
      )
    }

    const core = await backfillMultiOrgAuthCore(batchSize, trx)
    const auth = await backfillMultiOrgAuthCredentials(batchSize, trx)
    const verification = await verifyMultiOrgAuthCoreBackfill(trx)
    if (Object.values(verification).some((count) => count > 0)) {
      throw new Error(`one-shot cutover verification failed: ${JSON.stringify(verification)}`)
    }

    // A second pass must be a no-op. This detects incomplete batch predicates
    // before the old application/data contract is removed.
    const authVerification = await backfillMultiOrgAuthCredentials(batchSize, trx)
    if (
      authVerification.local_credentials > 0 ||
      authVerification.oidc_identities > 0 ||
      authVerification.oidc_links > 0
    ) {
      throw new Error(`one-shot auth verification failed: ${JSON.stringify(authVerification)}`)
    }

    await validateMultiOrgAuthExpandConstraints(trx)

    const revokedSessions = await sql<{ id: string }>`
      UPDATE sessions
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE revoked_at IS NULL
      RETURNING id
    `.execute(trx)

    const cutoverDetails = JSON.stringify({
      revoked_sessions: revokedSessions.rows.length,
      bootstrapped_auth_settings: bootstrappedAuthSettings,
      bootstrapped_oidc_providers: bootstrappedOidcProviders,
    })

    await sql`
      INSERT INTO application_data_migrations (name, details)
      VALUES (${cutoverMigrationName}, ${cutoverDetails}::jsonb)
    `.execute(trx)

    return {
      already_completed: false,
      auth,
      bootstrapped_auth_settings: bootstrappedAuthSettings,
      bootstrapped_oidc_providers: bootstrappedOidcProviders,
      core,
      revoked_sessions: revokedSessions.rows.length,
      validated: true,
    }
  })
