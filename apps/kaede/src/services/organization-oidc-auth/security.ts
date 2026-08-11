import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const GOOGLE_CANONICAL_ISSUER = 'https://accounts.google.com'
const GOOGLE_ISSUER_ALIASES = new Set(['accounts.google.com', GOOGLE_CANONICAL_ISSUER])

export const canonicalizeOidcIssuer = (issuer: string) =>
  GOOGLE_ISSUER_ALIASES.has(issuer) ? GOOGLE_CANONICAL_ISSUER : issuer

export const isGoogleIssuer = (issuer: string) => GOOGLE_ISSUER_ALIASES.has(issuer)

export const hashOidcState = (state: string) =>
  createHash('sha256').update(state).digest('base64url')

const encryptionKey = (secret: string) => createHash('sha256').update(secret).digest()

export const encryptPkceCodeVerifier = (codeVerifier: string, secret: string) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(codeVerifier, 'utf8'), cipher.final()])

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export const decryptPkceCodeVerifier = (encrypted: string, secret: string) => {
  const payload = Buffer.from(encrypted, 'base64url')
  if (payload.length <= 28) {
    throw new Error('encrypted PKCE verifier is invalid')
  }

  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export const normalizeHostedDomains = (domains: string[] | null | undefined) => {
  if (!domains || domains.length === 0) return null

  const normalized = [...new Set(domains.map((domain) => domain.trim().toLowerCase()))]
  if (normalized.some((domain) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain))) {
    throw new Error('allowed hosted domain is invalid')
  }

  return normalized
}

export const isHostedDomainAllowed = (
  hostedDomain: string | null,
  allowedHostedDomains: string[] | null
) => {
  if (allowedHostedDomains === null) return true
  if (!hostedDomain) return false

  return allowedHostedDomains.includes(hostedDomain.trim().toLowerCase())
}
