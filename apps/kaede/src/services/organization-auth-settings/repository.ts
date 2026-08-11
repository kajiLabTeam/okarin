import { sql } from 'kysely'
import type { Insertable, Updateable } from 'kysely'
import type { AuditEvents, OrganizationAuthSettings } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

type OrganizationAuthSettingsUpdate = Pick<
  Updateable<OrganizationAuthSettings>,
  | 'local_auth_enabled'
  | 'oidc_auth_enabled'
  | 'membership_grant_ttl_seconds'
  | 'reauthentication_interval_seconds'
>

export const findOrganizationAuthSettings = async (
  organizationId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_auth_settings')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .executeTakeFirst()

export const findOrganizationAuthSettingsForUpdate = async (
  organizationId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_auth_settings')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .forUpdate()
    .executeTakeFirst()

export const findActiveOwnerMembership = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organization_memberships')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('status', '=', 'active')
    .executeTakeFirst()

export const findActiveOwnerMembershipForUpdate = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor
) =>
  executor
    .selectFrom('organization_memberships')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('status', '=', 'active')
    .forUpdate()
    .executeTakeFirst()

export const countEnabledOidcProviders = async (
  organizationId: string,
  executor: DbExecutor
): Promise<number> => {
  const result = await executor
    .selectFrom('organization_oidc_providers')
    .select(sql<number>`count(*)::integer`.as('count'))
    .where('organization_id', '=', organizationId)
    .where('enabled', '=', true)
    .executeTakeFirstOrThrow()
  return result.count
}

export const updateOrganizationAuthSettings = async (
  organizationId: string,
  settings: OrganizationAuthSettingsUpdate,
  executor: DbExecutor
) =>
  executor
    .updateTable('organization_auth_settings')
    .set({ ...settings, policy_version: sql`policy_version + 1` })
    .where('organization_id', '=', organizationId)
    .returningAll()
    .executeTakeFirstOrThrow()

export const insertOrganizationAuthSettingsAuditEvent = async (
  event: Insertable<AuditEvents>,
  executor: DbExecutor
) => {
  await executor.insertInto('audit_events').values(event).execute()
}
