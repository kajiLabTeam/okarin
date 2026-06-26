import type { Selectable, Updateable } from 'kysely'
import type { UserActivationTokens } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type UserActivationToken = Selectable<UserActivationTokens>
export type UserActivationTokenUpdate = Updateable<UserActivationTokens>

export interface ActivationTokenContext {
  token_id: string
  user_id: string
  organization_id: string
  token_hash: string
  expires_at: Date
  used_at: Date | null
  revoked_at: Date | null
  created_at: Date
  user_email: string
  user_display_name: string
  user_password_hash: string | null
  user_status: string
  organization_name: string
}

export const findActivationTokenContextByHash = async (
  tokenHash: string,
  executor: DbExecutor = db
): Promise<ActivationTokenContext | undefined> => {
  return executor
    .selectFrom('user_activation_tokens as token')
    .innerJoin('users as user', 'user.id', 'token.user_id')
    .innerJoin('organizations as organization', 'organization.id', 'token.organization_id')
    .select([
      'token.id as token_id',
      'token.user_id as user_id',
      'token.organization_id as organization_id',
      'token.token_hash as token_hash',
      'token.expires_at as expires_at',
      'token.used_at as used_at',
      'token.revoked_at as revoked_at',
      'token.created_at as created_at',
      'user.email as user_email',
      'user.display_name as user_display_name',
      'user.password_hash as user_password_hash',
      'user.status as user_status',
      'organization.name as organization_name',
    ])
    .where('token.token_hash', '=', tokenHash)
    .executeTakeFirst()
}

export const markActivationTokenUsed = async (
  tokenId: string,
  now: Date,
  executor: DbExecutor = db
): Promise<UserActivationToken | undefined> => {
  return executor
    .updateTable('user_activation_tokens')
    .set({
      used_at: now,
    })
    .where('id', '=', tokenId)
    .where('used_at', 'is', null)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .returningAll()
    .executeTakeFirst()
}
