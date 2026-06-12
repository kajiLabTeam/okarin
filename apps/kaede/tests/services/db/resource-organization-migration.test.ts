import { sql } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from '../../../src/services/db/client.js'

const db = createDb()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const resourceTables = ['buildings', 'floors', 'pedestrians', 'recordings', 'trajectories']

const loadSetOrganizationIdNotNullDownSql = async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../db/migrations/20260610080000_set_resource_organization_id_not_null.sql'
  )
  const migration = await readFile(migrationPath, 'utf8')
  const downSql = migration.split('-- migrate:down')[1]?.trim()

  if (!downSql) {
    throw new Error('migration down SQL was not found')
  }

  return downSql
}

const fetchOrganizationIdNullability = () => {
  return db
    .selectFrom('information_schema.columns')
    .select(['table_name', 'is_nullable'])
    .where('table_schema', '=', 'public')
    .where('table_name', 'in', resourceTables)
    .where('column_name', '=', 'organization_id')
    .orderBy('table_name', 'asc')
    .execute()
}

describe('resource organization migration', () => {
  afterAll(async () => {
    await db.destroy()
  })

  it('down migration は resource organization_id の NOT NULL を解除する', async () => {
    const before = await fetchOrganizationIdNullability()

    expect(before).toHaveLength(resourceTables.length)
    expect(before.every((column) => column.is_nullable === 'NO')).toBe(true)

    const downSql = await loadSetOrganizationIdNotNullDownSql()

    await db
      .transaction()
      .execute(async (trx) => {
        await sql.raw(downSql).execute(trx)

        const afterDown = await trx
          .selectFrom('information_schema.columns')
          .select(['table_name', 'is_nullable'])
          .where('table_schema', '=', 'public')
          .where('table_name', 'in', resourceTables)
          .where('column_name', '=', 'organization_id')
          .orderBy('table_name', 'asc')
          .execute()

        expect(afterDown).toHaveLength(resourceTables.length)
        expect(afterDown.every((column) => column.is_nullable === 'YES')).toBe(true)

        throw new Error('rollback migration nullability test transaction')
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'rollback migration nullability test transaction'
        ) {
          throw error
        }
      })

    const afterRollback = await fetchOrganizationIdNullability()

    expect(afterRollback.every((column) => column.is_nullable === 'NO')).toBe(true)
  })
})
