import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../../src/services/db/client.js'
import { getPublicOrganizationAuthMethods } from '../../../src/usecases/organization-auth-methods/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

describe('organization auth methods discovery', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('有効な認証方式とenabled OIDC providerの公開情報だけを返す', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Discovery Organization', slug: 'discovery-organization' })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('organization_auth_settings')
      .values({
        organization_id: organization.id,
        local_auth_enabled: true,
        oidc_auth_enabled: true,
        membership_grant_ttl_seconds: 28_800,
        reauthentication_interval_seconds: 14_400,
      })
      .execute()
    const [enabledProvider] = await db
      .insertInto('organization_oidc_providers')
      .values([
        {
          organization_id: organization.id,
          name: 'Enabled Provider',
          issuer: 'https://enabled.example.test',
          client_id: 'enabled-client',
          client_secret_ref: 'secret/enabled',
          scopes: ['openid', 'email'],
          enabled: true,
        },
        {
          organization_id: organization.id,
          name: 'Disabled Provider',
          issuer: 'https://disabled.example.test',
          client_id: 'disabled-client',
          client_secret_ref: 'secret/disabled',
          scopes: ['openid'],
          enabled: false,
        },
      ])
      .returningAll()
      .execute()

    await expect(getPublicOrganizationAuthMethods(organization.slug, db)).resolves.toStrictEqual({
      local_auth_enabled: true,
      allowed_auth_methods: ['local', 'oidc'],
      oidc_providers: [{ id: enabledProvider.id, display_name: 'Enabled Provider' }],
    })
  })

  it('存在しないslug・inactive組織・設定欠落を同じ最小レスポンスにする', async () => {
    const [inactiveOrganization, missingSettingsOrganization] = await db
      .insertInto('organizations')
      .values([
        { name: 'Inactive Organization', slug: 'inactive-organization', status: 'suspended' },
        { name: 'Missing Settings Organization', slug: 'missing-settings-organization' },
      ])
      .returningAll()
      .execute()
    await db
      .insertInto('organization_auth_settings')
      .values({
        organization_id: inactiveOrganization.id,
        local_auth_enabled: true,
        oidc_auth_enabled: false,
        membership_grant_ttl_seconds: 28_800,
        reauthentication_interval_seconds: 14_400,
      })
      .execute()

    const unavailable = {
      local_auth_enabled: false,
      allowed_auth_methods: [],
      oidc_providers: [],
    }
    await expect(getPublicOrganizationAuthMethods('unknown', db)).resolves.toStrictEqual(
      unavailable
    )
    await expect(
      getPublicOrganizationAuthMethods(inactiveOrganization.slug, db)
    ).resolves.toStrictEqual(unavailable)
    await expect(
      getPublicOrganizationAuthMethods(missingSettingsOrganization.slug, db)
    ).resolves.toStrictEqual(unavailable)
  })
})
