import type { Insertable, Selectable, Updateable } from 'kysely'
import type { Users } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type User = Selectable<Users>
export type NewUser = Insertable<Users>
export type UserUpdate = Updateable<Users>

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
