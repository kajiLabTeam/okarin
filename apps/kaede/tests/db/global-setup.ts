import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadSchemaSql = async () => {
  const schemaPath = path.resolve(__dirname, '../../../../db/schema.sql')
  const raw = await readFile(schemaPath, 'utf8')

  const sanitized = raw
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')

  return `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n${sanitized}`
}

const applySchema = async (connectionString: string) => {
  const schemaSql = await loadSchemaSql()
  const client = new Client({ connectionString })

  await client.connect()
  try {
    await client.query(schemaSql)
  } finally {
    await client.end()
  }
}

interface SetupContext {
  provide: (key: 'databaseUrl', value: string) => void
}

export default async function setup({ provide }: SetupContext) {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  try {
    const databaseUrl = container.getConnectionUri()

    await applySchema(databaseUrl)
    provide('databaseUrl', databaseUrl)

    return async () => {
      await container.stop()
    }
  } catch (error) {
    await container.stop()
    throw error
  }
}
