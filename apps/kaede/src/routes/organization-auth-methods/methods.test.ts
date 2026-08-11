import { OpenAPIHono } from '@hono/zod-openapi'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerOrganizationAuthMethodsRoute } from './methods.js'

const { getPublicOrganizationAuthMethodsMock } = vi.hoisted(() => ({
  getPublicOrganizationAuthMethodsMock: vi.fn(),
}))

vi.mock('../../usecases/organization-auth-methods/index.js', () => ({
  getPublicOrganizationAuthMethods: getPublicOrganizationAuthMethodsMock,
}))

const createApp = () => {
  const app = new OpenAPIHono()
  const routes = new OpenAPIHono()
  registerOrganizationAuthMethodsRoute(routes)
  app.route('/api/organizations', routes)
  return app
}

describe('GET /api/organizations/:organizationSlug/auth/methods', () => {
  beforeEach(() => vi.clearAllMocks())

  it('secretやOrganization metadataを含めずLocal可否と有効OIDC providerだけを返す', async () => {
    getPublicOrganizationAuthMethodsMock.mockResolvedValue({
      local_auth_enabled: true,
      allowed_auth_methods: ['local', 'oidc'],
      oidc_providers: [
        { id: '11111111-1111-4111-8111-111111111111', display_name: 'Google Workspace' },
      ],
    })

    const response = await createApp().request('/api/organizations/example-org/auth/methods')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      local_auth_enabled: true,
      allowed_auth_methods: ['local', 'oidc'],
      oidc_providers: [
        { id: '11111111-1111-4111-8111-111111111111', display_name: 'Google Workspace' },
      ],
    })
    expect(getPublicOrganizationAuthMethodsMock).toHaveBeenCalledWith('example-org')
  })

  it('不存在・停止Organizationにも同じ空responseを返してslug enumerationを抑える', async () => {
    getPublicOrganizationAuthMethodsMock.mockResolvedValue({
      local_auth_enabled: false,
      allowed_auth_methods: [],
      oidc_providers: [],
    })

    const response = await createApp().request('/api/organizations/unknown-org/auth/methods')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      local_auth_enabled: false,
      allowed_auth_methods: [],
      oidc_providers: [],
    })
  })
})
