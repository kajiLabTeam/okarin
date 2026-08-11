import type { Insertable, Selectable } from 'kysely'
import type { OrganizationAuthSettings, Organizations } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type Organization = Selectable<Organizations>
export type NewOrganization = Insertable<Organizations>

export const findOrganizationById = async (
  organizationId: string,
  executor: DbExecutor = db
): Promise<Organization | undefined> => {
  return executor
    .selectFrom('organizations')
    .selectAll()
    .where('id', '=', organizationId)
    .executeTakeFirst()
}

export const findOrganizationBySlug = async (
  slug: string,
  executor: DbExecutor = db
): Promise<Organization | undefined> => {
  return executor
    .selectFrom('organizations')
    .selectAll()
    .where('slug', '=', slug)
    .executeTakeFirst()
}

export const insertOrganization = async (
  newOrganization: NewOrganization,
  executor: DbExecutor = db
): Promise<Organization> => {
  return executor
    .insertInto('organizations')
    .values(newOrganization)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertDefaultOrganizationAuthSettings = async (
  organizationId: string,
  executor: DbExecutor = db
): Promise<void> => {
  const settings: Insertable<OrganizationAuthSettings> = {
    organization_id: organizationId,
    local_auth_enabled: true,
    oidc_auth_enabled: false,
    membership_grant_ttl_seconds: 28_800,
    reauthentication_interval_seconds: 14_400,
  }
  await executor.insertInto('organization_auth_settings').values(settings).executeTakeFirstOrThrow()
}

export const listOrganizations = async (executor: DbExecutor = db): Promise<Organization[]> => {
  return executor
    .selectFrom('organizations')
    .selectAll()
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .execute()
}
