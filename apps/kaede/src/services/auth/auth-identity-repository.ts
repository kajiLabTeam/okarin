import type { Insertable, Selectable } from 'kysely'
import type { AuthIdentities } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type AuthIdentity = Selectable<AuthIdentities>
export type NewAuthIdentity = Insertable<AuthIdentities>

export const findGoogleIdentityBySubject = async (
  providerSubject: string,
  executor: DbExecutor = db
): Promise<AuthIdentity | undefined> => {
  return executor
    .selectFrom('auth_identities')
    .selectAll()
    .where('provider', '=', 'google')
    .where('provider_subject', '=', providerSubject)
    .executeTakeFirst()
}

export const findGoogleIdentityByUserId = async (
  userId: string,
  executor: DbExecutor = db
): Promise<AuthIdentity | undefined> => {
  return executor
    .selectFrom('auth_identities')
    .selectAll()
    .where('provider', '=', 'google')
    .where('user_id', '=', userId)
    .executeTakeFirst()
}

export const insertAuthIdentity = async (
  identity: NewAuthIdentity,
  executor: DbExecutor = db
): Promise<AuthIdentity> => {
  return executor
    .insertInto('auth_identities')
    .values(identity)
    .returningAll()
    .executeTakeFirstOrThrow()
}
