import argon2 from 'argon2'

const assertNonEmptyPassword = (password: string) => {
  if (password.trim().length === 0) {
    throw new Error('password must not be empty')
  }
}

export const hashPassword = async (password: string): Promise<string> => {
  assertNonEmptyPassword(password)

  return argon2.hash(password, {
    type: argon2.argon2id,
  })
}

export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  assertNonEmptyPassword(password)

  if (passwordHash.trim().length === 0) {
    return false
  }

  try {
    return await argon2.verify(passwordHash, password)
  } catch {
    return false
  }
}
