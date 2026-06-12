import type { Insertable, Selectable, Updateable } from 'kysely'
import type { OrganizationMemberships, Users } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type User = Selectable<Users>
export type NewUser = Insertable<Users>
export type UserUpdate = Updateable<Users>
export type NewOrganizationMembership = Insertable<OrganizationMemberships>
export type OrganizationMembership = Selectable<OrganizationMemberships>

export interface OrganizationUserRow {
  user_id: string
  email: string
  display_name: string
  global_role: string
  password_must_change: boolean
  password_changed_at: Date | null
  temporary_password_expires_at: Date | null
  created_at: Date
  updated_at: Date
  role: string
  pedestrian_id: string | null
  pedestrian_display_name: string | null
  pedestrian_height: number | null
  pedestrian_stride_length: number | null
  pedestrian_attributes: unknown
  pedestrian_created_at: Date | null
  pedestrian_updated_at: Date | null
}

export const findUserByEmail = async (
  email: string,
  executor: DbExecutor = db
): Promise<User | undefined> => {
  return executor.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst()
}

export const findUserById = async (
  userId: string,
  executor: DbExecutor = db
): Promise<User | undefined> => {
  return executor.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst()
}

export const insertUser = async (newUser: NewUser, executor: DbExecutor = db): Promise<User> => {
  return executor.insertInto('users').values(newUser).returningAll().executeTakeFirstOrThrow()
}

export const updateUser = async (
  userId: string,
  userUpdate: UserUpdate,
  executor: DbExecutor = db
): Promise<User> => {
  return executor
    .updateTable('users')
    .set(userUpdate)
    .where('id', '=', userId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const findOrganizationMembership = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
): Promise<OrganizationMembership | undefined> => {
  return executor
    .selectFrom('organization_memberships')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
}

export const insertOrganizationMembership = async (
  membership: NewOrganizationMembership,
  executor: DbExecutor = db
): Promise<OrganizationMembership> => {
  return executor
    .insertInto('organization_memberships')
    .values(membership)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const upsertOrganizationMembership = async (
  membership: NewOrganizationMembership,
  executor: DbExecutor = db
): Promise<OrganizationMembership> => {
  return executor
    .insertInto('organization_memberships')
    .values(membership)
    .onConflict((oc) =>
      oc.columns(['organization_id', 'user_id']).doUpdateSet({
        role: membership.role,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow()
}

const organizationUsersQuery = (executor: DbExecutor) =>
  executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('users as user', 'user.id', 'membership.user_id')
    .leftJoin('pedestrians as pedestrian', 'pedestrian.user_id', 'user.id')
    .select([
      'user.id as user_id',
      'user.email as email',
      'user.display_name as display_name',
      'user.global_role as global_role',
      'user.password_must_change as password_must_change',
      'user.password_changed_at as password_changed_at',
      'user.temporary_password_expires_at as temporary_password_expires_at',
      'user.created_at as created_at',
      'user.updated_at as updated_at',
      'membership.role as role',
      'pedestrian.id as pedestrian_id',
      'pedestrian.display_name as pedestrian_display_name',
      'pedestrian.height as pedestrian_height',
      'pedestrian.stride_length as pedestrian_stride_length',
      'pedestrian.attributes as pedestrian_attributes',
      'pedestrian.created_at as pedestrian_created_at',
      'pedestrian.updated_at as pedestrian_updated_at',
    ])

export const listOrganizationUsers = async (
  organizationId: string,
  executor: DbExecutor = db
): Promise<OrganizationUserRow[]> => {
  return organizationUsersQuery(executor)
    .where('membership.organization_id', '=', organizationId)
    .orderBy('user.email', 'asc')
    .orderBy('user.id', 'asc')
    .execute()
}

export const findOrganizationUserById = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
): Promise<OrganizationUserRow | undefined> => {
  return organizationUsersQuery(executor)
    .where('membership.organization_id', '=', organizationId)
    .where('user.id', '=', userId)
    .executeTakeFirst()
}

export const listUserOrganizationMemberships = async (
  userId: string,
  executor: DbExecutor = db
) => {
  return executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('organizations as organization', 'organization.id', 'membership.organization_id')
    .select([
      'membership.organization_id as organization_id',
      'organization.name as organization_name',
      'membership.role as role',
    ])
    .where('membership.user_id', '=', userId)
    .orderBy('organization.name', 'asc')
    .execute()
}
