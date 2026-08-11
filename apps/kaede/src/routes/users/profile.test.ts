import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerUserProfileRoutes } from './profile.js'

const mocks = vi.hoisted(() => ({
  getMyUserProfile: vi.fn(),
  updateMyUserProfile: vi.fn(),
}))

vi.mock('../../usecases/profiles/index.js', () => mocks)

const actor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [],
}

const responseProfile = {
  user_id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Alice',
  locale: 'ja-JP',
  timezone: 'Asia/Tokyo',
  updated_at: '2026-08-11T00:00:00.000Z',
}

describe('/api/users/me/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('共通Profileを取得する', async () => {
    mocks.getMyUserProfile.mockResolvedValue({ ok: true, value: responseProfile })
    const app = createRouteTestApp('/users', registerUserProfileRoutes, { actor })

    const response = await app.request('/api/users/me/profile')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(responseProfile)
    expect(mocks.getMyUserProfile).toHaveBeenCalledWith(actor)
  })

  it('指定fieldだけをPATCHへ渡す', async () => {
    mocks.updateMyUserProfile.mockResolvedValue({
      ok: true,
      value: { ...responseProfile, locale: 'en-US' },
    })
    const app = createRouteTestApp('/users', registerUserProfileRoutes, { actor })

    const response = await app.request('/api/users/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en-US' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.updateMyUserProfile).toHaveBeenCalledWith(actor, { locale: 'en-US' })
  })

  it('空PATCHを400で拒否する', async () => {
    const app = createRouteTestApp('/users', registerUserProfileRoutes, { actor })

    const response = await app.request('/api/users/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(mocks.updateMyUserProfile).not.toHaveBeenCalled()
  })
})
