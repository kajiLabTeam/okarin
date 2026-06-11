import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely'
import type { Users } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DB } from '../db/index.js'

type DbExecutor = Kysely<DB> | Transaction<DB>

export type User = Selectable<Users>
export type NewUser = Insertable<Users>
export type UserUpdate = Updateable<Users>

export const findUserByEmail = async (
  email: string,
  executor: DbExecutor = db
): Promise<User | undefined> => {
  return executor.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst()
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
