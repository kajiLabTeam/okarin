import type { Insertable, Selectable } from 'kysely'
import type { Organizations } from '../db/generated.js'
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

export const listOrganizations = async (executor: DbExecutor = db): Promise<Organization[]> => {
  return executor
    .selectFrom('organizations')
    .selectAll()
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .execute()
}
