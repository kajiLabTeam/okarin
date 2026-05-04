import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from './generated.js'

const getDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }

  return databaseUrl
}

const createDialect = () =>
  new PostgresDialect({
    pool: new Pool({
      connectionString: getDatabaseUrl(),
    }),
  })

export const createDb = () => new Kysely<DB>({ dialect: createDialect() })

export const db = createDb()
