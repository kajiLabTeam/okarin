import { sql } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from '../../../src/services/db/client.js'
import type { DbExecutor } from '../../../src/services/executor.js'

const db = createDb()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const loadOwnerRoleDownSql = async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../db/migrations/20260616090000_add_owner_membership_role.sql'
  )
  const migration = await readFile(migrationPath, 'utf8')
  const downSql = migration.split('-- migrate:down')[1]?.trim()

  if (!downSql) {
    throw new Error('migration down SQL was not found')
  }

  return downSql
}

const insertOrganizationAndUser = async (trx: DbExecutor) => {
  const organization = await trx
    .insertInto('organizations')
    .values({ name: 'Owner Role Migration Organization' })
    .returning(['id'])
    .executeTakeFirstOrThrow()
  const user = await trx
    .insertInto('users')
    .values({
      email: 'owner-role-migration@example.com',
      display_name: 'Owner Role Migration',
      password_hash: passwordHash,
      global_role: 'none',
      status: 'active',
      password_changed_at: new Date('2026-06-16T00:00:00.000Z'),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return { organization, user }
}

describe('organization membership role migration', () => {
  afterAll(async () => {
    await db.destroy()
  })

  it('up migration 後は owner role を保存できる', async () => {
    await db
      .transaction()
      .execute(async (trx) => {
        const { organization, user } = await insertOrganizationAndUser(trx)

        await expect(
          trx
            .insertInto('organization_memberships')
            .values({
              organization_id: organization.id,
              user_id: user.id,
              role: 'owner',
            })
            .execute()
        ).resolves.toBeDefined()

        throw new Error('rollback owner role up migration test transaction')
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'rollback owner role up migration test transaction'
        ) {
          throw error
        }
      })
  })

  it('down migration 適用中は owner role を拒否する', async () => {
    const downSql = await loadOwnerRoleDownSql()

    await db
      .transaction()
      .execute(async (trx) => {
        await sql.raw(downSql).execute(trx)
        const { organization, user } = await insertOrganizationAndUser(trx)

        await expect(
          trx
            .insertInto('organization_memberships')
            .values({
              organization_id: organization.id,
              user_id: user.id,
              role: 'owner',
            })
            .execute()
        ).rejects.toThrow()

        throw new Error('rollback owner role down migration test transaction')
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'rollback owner role down migration test transaction'
        ) {
          throw error
        }
      })
  })
})
