import { sql } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from '../../../src/services/db/client.js'

const db = createDb()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadExpandUpSql = async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../db/migrations/20260811010000_add_multi_org_membership_columns.sql'
  )
  const migration = await readFile(migrationPath, 'utf8')
  const upSql = migration.split('-- migrate:down')[0]?.replace('-- migrate:up', '').trim()

  if (!upSql) {
    throw new Error('multi-organization expand migration up SQL was not found')
  }

  return upSql
}

const loadInviteExpandDownSql = async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../db/migrations/20260811010500_expand_organization_invites.sql'
  )
  const migration = await readFile(migrationPath, 'utf8')
  const downSql = migration.split('-- migrate:down')[1]?.trim()

  if (!downSql) {
    throw new Error('organization invite expand migration down SQL was not found')
  }

  return downSql
}

describe('multi-organization auth expand migration', () => {
  afterAll(async () => {
    await db.destroy()
  })

  it('既存Membershipをbackfillせず、新規insertにだけdefaultを適用する', async () => {
    const upSql = await loadExpandUpSql()

    await db
      .transaction()
      .execute(async (trx) => {
        await sql.raw('CREATE SCHEMA multi_org_expand_compat').execute(trx)
        await sql.raw('SET LOCAL search_path TO multi_org_expand_compat, public').execute(trx)
        await sql
          .raw(
            `
          CREATE TABLE users (
            id uuid PRIMARY KEY,
            email text NOT NULL,
            display_name text NOT NULL
          );
          CREATE TABLE organizations (
            id uuid PRIMARY KEY,
            name text NOT NULL
          );
          CREATE TABLE organization_memberships (
            organization_id uuid NOT NULL,
            user_id uuid NOT NULL,
            role text NOT NULL,
            PRIMARY KEY (organization_id, user_id)
          );
          CREATE TABLE sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL,
            session_hash text NOT NULL,
            expires_at timestamptz NOT NULL,
            revoked_at timestamptz
          );
          INSERT INTO users (id, email, display_name)
          VALUES
            ('20000000-0000-0000-0000-000000000001', 'existing@example.com', 'Existing'),
            ('20000000-0000-0000-0000-000000000002', 'new@example.com', 'New');
          INSERT INTO organizations (id, name)
          VALUES ('10000000-0000-0000-0000-000000000001', 'Existing Organization');
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES (
            '10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001',
            'member'
          );
        `
          )
          .execute(trx)

        await sql.raw(upSql).execute(trx)

        await sql
          .raw(
            `
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES (
            '10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000002',
            'member'
          );
        `
          )
          .execute(trx)

        const rows = await sql<{
          user_id: string
          id_is_null: boolean
          status: string | null
          joined_at_is_null: boolean
        }>`
          SELECT
            user_id,
            id IS NULL AS id_is_null,
            status,
            joined_at IS NULL AS joined_at_is_null
          FROM organization_memberships
          ORDER BY user_id
        `.execute(trx)

        expect(rows.rows).toEqual([
          {
            user_id: '20000000-0000-0000-0000-000000000001',
            id_is_null: true,
            status: null,
            joined_at_is_null: true,
          },
          {
            user_id: '20000000-0000-0000-0000-000000000002',
            id_is_null: false,
            status: 'active',
            joined_at_is_null: false,
          },
        ])

        throw new Error('rollback multi-organization expand compatibility test')
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'rollback multi-organization expand compatibility test'
        ) {
          throw error
        }
      })
  })

  it('manager Inviteが存在する場合はrole制約をmemberへ戻さず安全に停止する', async () => {
    const downSql = await loadInviteExpandDownSql()

    await expect(
      db.transaction().execute(async (trx) => {
        const user = await trx
          .insertInto('users')
          .values({
            email: 'invite-down@example.com',
            display_name: 'Invite Down',
            password_hash: 'hash',
            global_role: 'none',
            status: 'active',
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        const organization = await trx
          .insertInto('organizations')
          .values({ name: 'Invite Down Organization' })
          .returning('id')
          .executeTakeFirstOrThrow()

        await trx
          .insertInto('organization_invites')
          .values({
            organization_id: organization.id,
            token_hash: 'invite-down-manager-token',
            email: 'invitee@example.com',
            role: 'manager',
            expires_at: new Date('2026-08-18T00:00:00.000Z'),
            created_by_user_id: user.id,
          })
          .execute()

        await sql.raw(downSql).execute(trx)
      })
    ).rejects.toThrow(
      'cannot rollback organization invite role expansion while non-member invites exist'
    )
  })
})
