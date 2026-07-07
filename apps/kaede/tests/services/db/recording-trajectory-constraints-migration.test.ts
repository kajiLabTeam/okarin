import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from '../../../src/services/db/client.js'
import { insertTrajectory } from '../../../src/services/trajectories/index.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadMigrationSql = async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../db/migrations/20260708010000_add_recording_and_trajectory_constraints.sql'
  )
  const migration = await readFile(migrationPath, 'utf8')
  const [upSection = '', downSql = ''] = migration.split('-- migrate:down')
  const upSql = upSection.split('-- migrate:up')[1]?.trim()

  if (!upSql || !downSql.trim()) {
    throw new Error('migration up/down SQL was not found')
  }

  return { upSql, downSql: downSql.trim() }
}

describe('recording/trajectory constraints migration', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('legacy table が空なら down/up を往復できる', async () => {
    const { upSql, downSql } = await loadMigrationSql()

    await db
      .transaction()
      .execute(async (trx) => {
        await sql.raw(downSql).execute(trx)
        await sql.raw(upSql).execute(trx)

        const legacyTable = await sql<{ table_name: string | null }>`
          SELECT to_regclass('public.trajectory_constraints')::text AS table_name
        `.execute(trx)
        expect(legacyTable.rows[0]?.table_name).toBeNull()

        throw new Error('rollback constraints migration round trip')
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'rollback constraints migration round trip'
        ) {
          throw error
        }
      })
  })

  it('legacy table にデータがあれば up migration を拒否する', async () => {
    const { floor, organization, recording } = await createRecordingFixture(db)
    const trajectory = await insertTrajectory(
      {
        recording_id: recording.id,
        floor_id: floor.id,
        organization_id: organization.id,
        status: 'accepted',
        constraints: [],
      },
      db
    )
    const { upSql, downSql } = await loadMigrationSql()

    await expect(
      db.transaction().execute(async (trx) => {
        await sql.raw(downSql).execute(trx)
        await sql`
          INSERT INTO trajectory_constraints
            (trajectory_id, seq, point_type, x, y)
          VALUES
            (${trajectory.id}, 0, 'start', 0, 0)
        `.execute(trx)
        await sql.raw(upSql).execute(trx)
      })
    ).rejects.toThrow('trajectory_constraints is not empty')
  })

  it('constraints へ JSON object を保存できない', async () => {
    const fixture = await createRecordingFixture(db)

    await expect(
      db
        .updateTable('recordings')
        .set({ constraints: {} })
        .where('id', '=', fixture.recording.id)
        .execute()
    ).rejects.toThrow()
  })
})
