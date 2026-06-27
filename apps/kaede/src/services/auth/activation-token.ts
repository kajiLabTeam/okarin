import { createHash, randomBytes } from 'node:crypto'

const activationTokenBytes = 32

export const generateActivationToken = (): string => {
  return randomBytes(activationTokenBytes).toString('base64url')
}

export const hashActivationToken = (token: string): string => {
  if (token.trim().length === 0) {
    throw new Error('activation token must not be empty')
  }

  return createHash('sha256').update(token).digest('base64url')
}
