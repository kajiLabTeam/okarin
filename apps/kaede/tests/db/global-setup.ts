import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { applySchema } from '../support/db-schema.js'

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
