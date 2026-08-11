import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicOrganizationAuthMethods } from './index.js'

const { findRowsMock } = vi.hoisted(() => ({ findRowsMock: vi.fn() }))

vi.mock('../../services/organization-auth-methods/index.js', () => ({
  findPublicOrganizationAuthMethodRows: findRowsMock,
}))

describe('getPublicOrganizationAuthMethods', () => {
  beforeEach(() => vi.clearAllMocks())

  it('OIDC無効時はprovider rowがあっても公開しない', async () => {
    findRowsMock.mockResolvedValue([
      {
        local_auth_enabled: true,
        oidc_auth_enabled: false,
        provider_id: '11111111-1111-4111-8111-111111111111',
        provider_display_name: 'Disabled by policy',
      },
    ])

    await expect(getPublicOrganizationAuthMethods('example-org')).resolves.toEqual({
      local_auth_enabled: true,
      allowed_auth_methods: ['local'],
      oidc_providers: [],
    })
  })

  it('Organizationが利用不可なら存在理由を区別しない空responseを返す', async () => {
    findRowsMock.mockResolvedValue([])

    await expect(getPublicOrganizationAuthMethods('unknown-org')).resolves.toEqual({
      local_auth_enabled: false,
      allowed_auth_methods: [],
      oidc_providers: [],
    })
  })
})
