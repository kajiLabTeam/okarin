import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { getDatabaseRuntimeConfig } from '../../config/runtime.js'
import type { DB } from './generated.js'

const createDialect = () =>
  new PostgresDialect({
    pool: new Pool({
      connectionString: getDatabaseRuntimeConfig().url,
    }),
  })

export const createDb = () => new Kysely<DB>({ dialect: createDialect() })

export const db = createDb()
