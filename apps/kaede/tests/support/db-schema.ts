import { Client } from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const loadSchemaSql = async () => {
  const schemaPath = path.resolve(__dirname, '../../../../db/schema.sql')
  const raw = await readFile(schemaPath, 'utf8')

  const sanitized = raw
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')

  return `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n${sanitized}`
}

export const applySchema = async (connectionString: string) => {
  const schemaSql = await loadSchemaSql()
  const client = new Client({ connectionString })

  await client.connect()
  try {
    await client.query(schemaSql)

    await client.query('SET search_path TO public;')

    // db/migrations から未適用のマイグレーションを検出して適用する
    const migrationsDir = path.resolve(__dirname, '../../../../db/migrations')
    const files = await readdir(migrationsDir)
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

    const appliedResult = await client.query('SELECT version FROM public.schema_migrations')
    const appliedVersions = new Set(appliedResult.rows.map((r: { version: string }) => r.version))

    for (const file of sqlFiles) {
      const version = file.split('_')[0]
      if (version && version >= '20261006020000' && !appliedVersions.has(version)) {
        const migrationSql = await readFile(path.join(migrationsDir, file), 'utf8')
        const upSql = migrationSql.split('-- migrate:down')[0]?.replace('-- migrate:up', '') ?? ''
        await client.query(upSql)
        await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version])
      }
    }
  } finally {
    await client.end()
  }
}
