import type { OrganizationAuthMethodsResponse } from '../../schemas/organization-auth-methods.js'
import type { DbExecutor } from '../../services/executor.js'
import { findPublicOrganizationAuthMethodRows } from '../../services/organization-auth-methods/index.js'

const unavailableResponse = (): OrganizationAuthMethodsResponse => ({
  local_auth_enabled: false,
  allowed_auth_methods: [],
  oidc_providers: [],
})

export const getPublicOrganizationAuthMethods = async (
  organizationSlug: string,
  executor?: DbExecutor
): Promise<OrganizationAuthMethodsResponse> => {
  const rows = await findPublicOrganizationAuthMethodRows(organizationSlug, executor)
  if (rows.length === 0) return unavailableResponse()
  const first = rows[0]

  const oidcProviders = first.oidc_auth_enabled
    ? rows.flatMap((row) =>
        row.provider_id && row.provider_display_name
          ? [{ id: row.provider_id, display_name: row.provider_display_name }]
          : []
      )
    : []
  const allowedAuthMethods: ('local' | 'oidc')[] = []
  if (first.local_auth_enabled) allowedAuthMethods.push('local')
  if (oidcProviders.length > 0) allowedAuthMethods.push('oidc')

  return {
    local_auth_enabled: first.local_auth_enabled,
    allowed_auth_methods: allowedAuthMethods,
    oidc_providers: oidcProviders,
  }
}
