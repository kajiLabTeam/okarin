const trailingSlashesPattern = /\/+$/

export const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

export const getOptionalEnv = (name: string, fallback: string) => process.env[name] ?? fallback

export const normalizeBaseUrl = (value: string) => value.replace(trailingSlashesPattern, '')

export const parseBooleanEnv = (name: string, fallback: boolean) => {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false
    default:
      throw new Error(`${name} must be a boolean`)
  }
}

export const parsePositiveIntegerEnv = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return parsed
}
