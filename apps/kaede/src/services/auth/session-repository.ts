import type { Insertable, Kysely, Selectable, Transaction } from 'kysely'
import { db } from '../db/index.js'
import type { DB, Sessions } from '../db/index.js'
import { generateSessionToken, hashSessionToken } from './session-token.js'

type DbExecutor = Kysely<DB> | Transaction<DB>

export type Session = Selectable<Sessions>

const defaultSessionTtlMs = 7 * 24 * 60 * 60 * 1000

export interface CreateSessionParams {
  userId: string
  now?: Date
  ttlMs?: number
}

export interface CreateSessionResult {
  token: string
  session: Session
}

export type FindValidSessionResult =
  | {
      ok: true
      session: Session
    }
  | {
      ok: false
      error: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
    }

export const createSession = async (
  { userId, now = new Date(), ttlMs = defaultSessionTtlMs }: CreateSessionParams,
  executor: DbExecutor = db
): Promise<CreateSessionResult> => {
  const token = generateSessionToken()
  const sessionHash = hashSessionToken(token)
  const expiresAt = new Date(now.getTime() + ttlMs)

  const values: Insertable<Sessions> = {
    user_id: userId,
    session_hash: sessionHash,
    expires_at: expiresAt,
    revoked_at: null,
    last_seen_at: null,
  }

  const session = await executor
    .insertInto('sessions')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow()

  return {
    token,
    session,
  }
}

export const findSessionByToken = async (
  token: string,
  executor: DbExecutor = db
): Promise<Session | undefined> => {
  if (token.trim().length === 0) {
    return undefined
  }

  const sessionHash = hashSessionToken(token)

  return executor
    .selectFrom('sessions')
    .selectAll()
    .where('session_hash', '=', sessionHash)
    .executeTakeFirst()
}

export const findValidSessionByToken = async (
  token: string,
  now: Date = new Date(),
  executor: DbExecutor = db
): Promise<FindValidSessionResult> => {
  const session = await findSessionByToken(token, executor)

  if (!session) {
    return {
      ok: false,
      error: 'SESSION_NOT_FOUND',
    }
  }

  if (session.revoked_at) {
    return {
      ok: false,
      error: 'SESSION_REVOKED',
    }
  }

  if (session.expires_at <= now) {
    return {
      ok: false,
      error: 'SESSION_EXPIRED',
    }
  }

  return {
    ok: true,
    session,
  }
}

export const revokeSessionByToken = async (
  token: string,
  revokedAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<Session | undefined> => {
  if (token.trim().length === 0) {
    return undefined
  }

  const sessionHash = hashSessionToken(token)

  return executor
    .updateTable('sessions')
    .set({
      revoked_at: revokedAt,
    })
    .where('session_hash', '=', sessionHash)
    .returningAll()
    .executeTakeFirst()
}

export const updateSessionLastSeen = async (
  sessionId: string,
  lastSeenAt: Date = new Date(),
  executor: DbExecutor = db
): Promise<Session | undefined> => {
  return executor
    .updateTable('sessions')
    .set({
      last_seen_at: lastSeenAt,
    })
    .where('id', '=', sessionId)
    .returningAll()
    .executeTakeFirst()
}
