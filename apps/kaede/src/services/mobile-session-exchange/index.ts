import { createHash, randomBytes } from 'node:crypto'
import { createPkceCodeChallenge, findValidSessionById } from '../auth/index.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

const CODE_TTL_MS = 60 * 1000

const hashExchangeCode = (code: string) => createHash('sha256').update(code).digest('base64url')

export const issueMobileSessionExchangeCode = async (
  input: {
    oidcTransactionId: string
    sessionId: string
    userId: string
    organizationId: string
    intent: 'login' | 'reauthenticate'
    now: Date
  },
  executor: DbExecutor = db
) => {
  const code = randomBytes(32).toString('base64url')
  await executor
    .insertInto('mobile_session_exchange_codes')
    .values({
      code_hash: hashExchangeCode(code),
      oidc_transaction_id: input.oidcTransactionId,
      session_id: input.sessionId,
      user_id: input.userId,
      organization_id: input.organizationId,
      intent: input.intent,
      expires_at: new Date(input.now.getTime() + CODE_TTL_MS),
      consumed_at: null,
    })
    .executeTakeFirstOrThrow()
  return code
}

export const consumeMobileSessionExchangeCode = async (
  code: string,
  verifier: string,
  now: Date = new Date(),
  executor: DbExecutor = db
) => {
  const row = await executor
    .selectFrom('mobile_session_exchange_codes as exchange')
    .innerJoin(
      'oidc_login_transactions as transaction',
      'transaction.id',
      'exchange.oidc_transaction_id'
    )
    .select([
      'exchange.id',
      'exchange.session_id',
      'exchange.user_id',
      'exchange.expires_at',
      'exchange.consumed_at',
      'transaction.mobile_code_challenge as code_challenge',
      'transaction.mobile_code_challenge_method as code_challenge_method',
    ])
    .where('exchange.code_hash', '=', hashExchangeCode(code))
    .executeTakeFirst()

  if (!row || row.consumed_at || row.expires_at <= now || row.code_challenge_method !== 'S256') {
    return undefined
  }
  if (createPkceCodeChallenge(verifier) !== row.code_challenge) return undefined

  const session = await findValidSessionById(row.session_id, now, executor)
  if (!session) return undefined

  const consumed = await executor
    .updateTable('mobile_session_exchange_codes')
    .set({ consumed_at: now })
    .where('id', '=', row.id)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', now)
    .returning(['id'])
    .executeTakeFirst()
  if (!consumed) return undefined

  return { session: session, userId: row.user_id }
}

export { hashExchangeCode }
