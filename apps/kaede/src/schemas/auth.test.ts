import { describe, expect, it } from 'vitest'
import { authMeResponseSchema } from './auth.js'

describe('authMeResponseSchema', () => {
  it('Membership直下にallowed_auth_methodsを持つ再認証待ちレスポンスを受理する', () => {
    expect(
      authMeResponseSchema.safeParse({
        session_auth_method: 'oidc',
        user: {
          user_id: 'f5fe0359-75c5-4676-b0f3-8986319e18b2',
          email: 'user@example.com',
          display_name: 'User',
          global_role: 'none',
          status: 'active',
          account_state: 'active',
          password_changed_at: null,
          memberships: [
            {
              membership_id: '6dc417b9-932d-47e4-a8eb-1e0f651bca28',
              organization_id: '80f796d9-8fd3-49da-a4e5-efb34123263f',
              organization_name: 'Organization',
              organization_slug: 'organization',
              role: 'owner',
              status: 'active',
              allowed_auth_methods: ['local', 'oidc'],
              grant_state: {
                status: 'reauthentication_required',
                reason: 'grant_missing',
                auth_method: null,
                authenticated_at: null,
                reauthentication_required_at: null,
                expires_at: null,
                effective_expires_at: null,
              },
            },
          ],
        },
      }).success
    ).toBe(true)
  })
})
