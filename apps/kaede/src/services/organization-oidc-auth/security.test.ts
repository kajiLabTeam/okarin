import { describe, expect, it } from 'vitest'
import {
  canonicalizeOidcIssuer,
  decryptPkceCodeVerifier,
  encryptPkceCodeVerifier,
  isHostedDomainAllowed,
  normalizeHostedDomains,
} from './security.js'

describe('organization OIDC security helpers', () => {
  it('Google issuer aliasesをcanonical issuerへ統一する', () => {
    expect(canonicalizeOidcIssuer('accounts.google.com')).toBe('https://accounts.google.com')
    expect(canonicalizeOidcIssuer('https://accounts.google.com')).toBe(
      'https://accounts.google.com'
    )
    expect(canonicalizeOidcIssuer('https://issuer.example.test')).toBe(
      'https://issuer.example.test'
    )
  })

  it('PKCE verifierを暗号化して復号できる', () => {
    const encrypted = encryptPkceCodeVerifier('code-verifier', 'transaction-secret')

    expect(encrypted).not.toContain('code-verifier')
    expect(decryptPkceCodeVerifier(encrypted, 'transaction-secret')).toBe('code-verifier')
    expect(() => decryptPkceCodeVerifier(encrypted, 'wrong-secret')).toThrow()
  })

  it('Hosted Domain未設定なら個人Googleと任意Workspaceを許可する', () => {
    expect(isHostedDomainAllowed(null, null)).toBe(true)
    expect(isHostedDomainAllowed('other-workspace.example', null)).toBe(true)
  })

  it('Hosted Domain設定時だけhd一致を要求する', () => {
    const allowed = normalizeHostedDomains([' Company-A.Example ', 'company-a.example'])

    expect(allowed).toEqual(['company-a.example'])
    expect(isHostedDomainAllowed('COMPANY-A.EXAMPLE', allowed)).toBe(true)
    expect(isHostedDomainAllowed(null, allowed)).toBe(false)
    expect(isHostedDomainAllowed('company-b.example', allowed)).toBe(false)
  })
})
