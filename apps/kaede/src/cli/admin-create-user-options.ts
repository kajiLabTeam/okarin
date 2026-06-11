export interface AdminCreateUserCliOptions {
  email: string
  displayName: string
  password: string | undefined
  resetPassword: boolean
  help: boolean
}

export type ParseAdminCreateUserCliArgsResult =
  | {
      ok: true
      value: AdminCreateUserCliOptions
    }
  | {
      ok: false
      error: string
    }

const defaultDisplayName = 'Admin'

const readOptionValue = (args: string[], index: number, name: string) => {
  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    return {
      ok: false as const,
      error: `${name} requires a value`,
    }
  }

  return {
    ok: true as const,
    value,
    nextIndex: index + 1,
  }
}

export const parseAdminCreateUserCliArgs = (
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): ParseAdminCreateUserCliArgsResult => {
  let email: string | undefined
  let displayName: string | undefined
  let password: string | undefined
  let resetPassword = false
  let help = false

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]

    if (arg === '--reset-password') {
      resetPassword = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }

    const separatorIndex = arg.indexOf('=')
    const name = separatorIndex >= 0 ? arg.slice(0, separatorIndex) : arg
    const inlineValue = separatorIndex >= 0 ? arg.slice(separatorIndex + 1) : undefined
    const readValue = () => {
      if (inlineValue !== undefined) {
        return {
          ok: true as const,
          value: inlineValue,
          nextIndex: index,
        }
      }

      return readOptionValue(args, index, name)
    }

    switch (name) {
      case '--email': {
        const result = readValue()
        if (!result.ok) {
          return result
        }
        email = result.value
        index = result.nextIndex
        break
      }
      case '--display-name': {
        const result = readValue()
        if (!result.ok) {
          return result
        }
        displayName = result.value
        index = result.nextIndex
        break
      }
      case '--password': {
        const result = readValue()
        if (!result.ok) {
          return result
        }
        password = result.value
        index = result.nextIndex
        break
      }
      default:
        return {
          ok: false,
          error: `unknown option: ${arg}`,
        }
    }
  }

  if (help) {
    return {
      ok: true,
      value: {
        email: '',
        displayName: '',
        password: '',
        resetPassword: false,
        help: true,
      },
    }
  }

  const resolvedEmail = (email ?? env.ADMIN_EMAIL)?.trim()
  const resolvedDisplayName = (displayName ?? defaultDisplayName).trim()
  const resolvedPassword = password ?? env.ADMIN_PASSWORD

  if (!resolvedEmail) {
    return {
      ok: false,
      error: '--email or ADMIN_EMAIL is required',
    }
  }

  if (!resolvedDisplayName) {
    return {
      ok: false,
      error: '--display-name must not be empty',
    }
  }

  return {
    ok: true,
    value: {
      email: resolvedEmail,
      displayName: resolvedDisplayName,
      password: resolvedPassword,
      resetPassword,
      help: false,
    },
  }
}
