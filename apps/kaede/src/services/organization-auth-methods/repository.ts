import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export const findPublicOrganizationAuthMethodRows = async (
  organizationSlug: string,
  executor: DbExecutor = db
) =>
  executor
    .selectFrom('organizations as organization')
    .innerJoin(
      'organization_auth_settings as settings',
      'settings.organization_id',
      'organization.id'
    )
    .leftJoin('organization_oidc_providers as provider', (join) =>
      join
        .onRef('provider.organization_id', '=', 'organization.id')
        .on('provider.enabled', '=', true)
    )
    .select([
      'settings.local_auth_enabled',
      'settings.oidc_auth_enabled',
      'provider.id as provider_id',
      'provider.name as provider_display_name',
    ])
    .where('organization.slug', '=', organizationSlug)
    .where('organization.status', '=', 'active')
    .orderBy('provider.created_at', 'asc')
    .execute()
