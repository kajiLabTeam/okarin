import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { db } from '../services/db/index.js'
import { createAdminUser } from '../usecases/create-admin-user.js'
import type { CreateAdminUserError } from '../usecases/create-admin-user.js'
import { parseAdminCreateUserCliArgs } from './admin-create-user-options.js'

const formatError = (error: CreateAdminUserError) => {
  switch (error.type) {
    case 'ADMIN_USER_ALREADY_EXISTS':
      return 'admin user already exists. Use --reset-password to reset the password.'
    case 'EMAIL_ALREADY_USED_BY_NON_ADMIN':
      return 'email is already used by a non-admin user.'
    case 'VALIDATION_ERROR':
      return `validation error: ${error.message}`
  }
}

const showUsage = (stdout: Pick<NodeJS.WriteStream, 'write'>) => {
  stdout.write(
    [
      'Usage: node dist/cli/admin-create-user.js [options]',
      '',
      'Options:',
      '  --email <email>          Admin user email (or set ADMIN_EMAIL env)',
      '  --display-name <name>    Admin user display name (default: Admin)',
      '  --password <password>    Admin user password (or omit to prompt)',
      '  --reset-password         Reset password if user already exists',
      '  -h, --help               Show this help message',
    ].join('\n') + '\n'
  )
}

const promptVisiblePassword = async (
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream
): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    return await rl.question('Enter admin password: ')
  } finally {
    rl.close()
  }
}

const promptPassword = async (
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream
): Promise<string> => {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return promptVisiblePassword(stdin, stdout)
  }

  stdout.write('Enter admin password: ')

  return new Promise((resolve, reject) => {
    let password = ''
    const wasRaw = stdin.isRaw

    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode(wasRaw)
      stdin.pause()
    }

    const finish = () => {
      cleanup()
      stdout.write('\n')
      resolve(password)
    }

    const cancel = () => {
      cleanup()
      stdout.write('\n')
      reject(new Error('password input cancelled'))
    }

    const onData = (chunk: Buffer | string) => {
      const input = chunk.toString('utf8')

      for (const char of input) {
        if (char === '\u0003') {
          cancel()
          return
        }

        if (char === '\r' || char === '\n') {
          finish()
          return
        }

        if (char === '\u007f' || char === '\b') {
          password = password.slice(0, -1)
          continue
        }

        if (char >= ' ') {
          password += char
        }
      }
    }

    stdin.resume()
    stdin.setRawMode(true)
    stdin.on('data', onData)
  })
}

export const runAdminCreateUserCli = async (
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  stdout: NodeJS.WriteStream = process.stdout,
  stderr: NodeJS.WriteStream = process.stderr,
  stdin: NodeJS.ReadStream = process.stdin
): Promise<number> => {
  const options = parseAdminCreateUserCliArgs(args, env)

  if (!options.ok) {
    stderr.write(`${options.error}\n`)
    showUsage(stderr)
    return 1
  }

  if (options.value.help) {
    showUsage(stdout)
    return 0
  }

  let { password } = options.value
  if (!password || password.trim().length === 0) {
    password = await promptPassword(stdin, stdout)
  }

  if (!password || password.trim().length === 0) {
    stderr.write('password is required\n')
    return 1
  }

  try {
    const result = await createAdminUser({
      ...options.value,
      password,
    })

    if (!result.ok) {
      stderr.write(`${formatError(result.error)}\n`)
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
