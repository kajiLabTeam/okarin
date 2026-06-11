import { pathToFileURL } from 'node:url'
import { db } from '../services/db/index.js'
import { createAdminUser } from '../usecases/create-admin-user.js'
import { parseAdminCreateUserCliArgs } from './admin-create-user-options.js'

const formatError = (type: string) => {
  switch (type) {
    case 'ADMIN_USER_ALREADY_EXISTS':
      return 'admin user already exists. Use --reset-password to reset the password.'
    case 'EMAIL_ALREADY_USED_BY_NON_ADMIN':
      return 'email is already used by a non-admin user.'
    default:
      return type
  }
}

export const runAdminCreateUserCli = async (
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  stdout: Pick<NodeJS.WriteStream, 'write'> = process.stdout,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> => {
  const options = parseAdminCreateUserCliArgs(args, env)

  if (!options.ok) {
    stderr.write(`${options.error}\n`)
    return 1
  }

  try {
    const result = await createAdminUser(options.value)

    if (!result.ok) {
      stderr.write(`${formatError(result.error.type)}\n`)
      return 1
    }

    stdout.write(
      [
        `admin user ${result.value.action}`,
        `email: ${result.value.email}`,
        `user_id: ${result.value.userId}`,
        `temporary_password_expires_at: ${result.value.temporaryPasswordExpiresAt.toISOString()}`,
      ].join('\n') + '\n'
    )

    return 0
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAdminCreateUserCli()
}
