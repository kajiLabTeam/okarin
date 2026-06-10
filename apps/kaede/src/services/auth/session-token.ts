import { createHash, randomBytes } from 'node:crypto'

const sessionTokenBytes = 32

export const generateSessionToken = (): string => {
  return randomBytes(sessionTokenBytes).toString('base64url')
}

export const hashSessionToken = (token: string): string => {
  if (token.trim().length === 0) {
    throw new Error('session token must not be empty')
  }

  return createHash('sha256').update(token).digest('base64url')
}
