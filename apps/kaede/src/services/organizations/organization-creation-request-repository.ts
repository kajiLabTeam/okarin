import type { Insertable, Selectable, Updateable } from 'kysely'
import type { OrganizationCreationRequests } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type OrganizationCreationRequest = Selectable<OrganizationCreationRequests>
export type NewOrganizationCreationRequest = Insertable<OrganizationCreationRequests>
export type OrganizationCreationRequestUpdate = Updateable<OrganizationCreationRequests>

export const insertOrganizationCreationRequest = async (
  request: NewOrganizationCreationRequest,
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest> => {
  return executor
    .insertInto('organization_creation_requests')
    .values(request)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const findOrganizationCreationRequestById = async (
  requestId: string,
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest | undefined> => {
  return executor
    .selectFrom('organization_creation_requests')
    .selectAll()
    .where('id', '=', requestId)
    .executeTakeFirst()
}

export const findOrganizationCreationRequestByIdForUpdate = async (
  requestId: string,
  executor: DbExecutor
): Promise<OrganizationCreationRequest | undefined> => {
  return executor
    .selectFrom('organization_creation_requests')
    .selectAll()
    .where('id', '=', requestId)
    .forUpdate()
    .executeTakeFirst()
}

export const findPendingOrganizationCreationRequestByRequester = async (
  requesterUserId: string,
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest | undefined> => {
  return executor
    .selectFrom('organization_creation_requests')
    .selectAll()
    .where('requester_user_id', '=', requesterUserId)
    .where('status', '=', 'pending')
    .executeTakeFirst()
}

export const listOrganizationCreationRequestsByRequester = async (
  requesterUserId: string,
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest[]> => {
  return executor
    .selectFrom('organization_creation_requests')
    .selectAll()
    .where('requester_user_id', '=', requesterUserId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'asc')
    .execute()
}

export const listOrganizationCreationRequests = async (
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest[]> => {
  return executor
    .selectFrom('organization_creation_requests')
    .selectAll()
    .orderBy('created_at', 'desc')
    .orderBy('id', 'asc')
    .execute()
}

export const updateOrganizationCreationRequest = async (
  requestId: string,
  update: OrganizationCreationRequestUpdate,
  executor: DbExecutor = db
): Promise<OrganizationCreationRequest> => {
  return executor
    .updateTable('organization_creation_requests')
    .set(update)
    .where('id', '=', requestId)
    .returningAll()
    .executeTakeFirstOrThrow()
}
