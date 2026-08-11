import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { DbExecutor } from '../../services/executor.js'

const mocks = vi.hoisted(() => ({
  findMemberProfileContextById: vi.fn(),
  findMemberProfileContextByUser: vi.fn(),
  findUserProfileContext: vi.fn(),
  insertAuditEvent: vi.fn(),
  upsertOrganizationMemberProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
}))

vi.mock('../../services/profiles/index.js', () => mocks)
vi.mock('../../services/db/index.js', () => ({ db: {} }))

import {
  getMyOrganizationMemberProfile,
  getMyUserProfile,
  updateMyOrganizationMemberProfile,
  updateOrganizationMemberProfile,
} from './index.js'

const executor = {} as DbExecutor
const organizationId = '11111111-1111-4111-8111-111111111111'
const actorMembershipId = '22222222-2222-4222-8222-222222222222'
const targetMembershipId = '33333333-3333-4333-8333-333333333333'
const actorUserId = '44444444-4444-4444-8444-444444444444'
const targetUserId = '55555555-5555-4555-8555-555555555555'

const userActor = (
  role: 'member' | 'manager' | 'owner' = 'member',
  globalRole: 'none' | 'admin' = 'none'
): RequestActor => ({
  type: 'user',
  user_id: actorUserId,
  email: 'actor@example.com',
  global_role: globalRole,
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Example',
      role,
    },
  ],
})

const memberContext = ({
  membershipId = targetMembershipId,
  userId = targetUserId,
  role = 'member',
  status = 'active',
  overrideDisplayName = null,
}: {
  membershipId?: string | null
  userId?: string
  role?: string
  status?: string | null
  overrideDisplayName?: string | null
} = {}) => ({
  membership_id: membershipId,
  organization_id: organizationId,
  membership_user_id: userId,
  role,
  status,
  user_id: userId,
  display_name: 'Global Name',
  locale: 'ja-JP',
  timezone: 'Asia/Tokyo',
  profile_updated_at: new Date('2026-08-11T00:00:00.000Z'),
  override_display_name: overrideDisplayName,
  height_meters: '1.705',
  stride_length_meters: '0.720',
  member_profile_updated_at: new Date('2026-08-11T00:00:00.000Z'),
})

describe('profile usecases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('移行済みUser Profileを返す', async () => {
    mocks.findUserProfileContext.mockResolvedValue({
      user_id: actorUserId,
      display_name: 'Global Name',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
      profile_updated_at: new Date('2026-08-11T00:00:00.000Z'),
    })

    await expect(getMyUserProfile(userActor(), executor)).resolves.toEqual({
      ok: true,
      value: {
        user_id: actorUserId,
        display_name: 'Global Name',
        locale: 'ja-JP',
        timezone: 'Asia/Tokyo',
        updated_at: '2026-08-11T00:00:00.000Z',
      },
    })
  })

  it('Organization overrideがNULLなら共通display nameを実効値にする', async () => {
    mocks.findMemberProfileContextByUser.mockResolvedValue(
      memberContext({ membershipId: actorMembershipId, userId: actorUserId })
    )

    const result = await getMyOrganizationMemberProfile(userActor(), organizationId, executor)

    expect(result).toMatchObject({
      ok: true,
      value: {
        global: { display_name: 'Global Name' },
        override: { display_name: null, height_meters: 1.705, stride_length_meters: 0.72 },
        effective: { display_name: 'Global Name', display_name_source: 'global' },
      },
    })
  })

  it('本人更新はoverrideを解除でき、Audit Eventを作成しない', async () => {
    const current = memberContext({
      membershipId: actorMembershipId,
      userId: actorUserId,
      overrideDisplayName: 'Override Name',
    })
    mocks.findMemberProfileContextByUser.mockResolvedValue(current)
    mocks.findMemberProfileContextById.mockResolvedValue({
      ...current,
      override_display_name: null,
    })
    mocks.upsertOrganizationMemberProfile.mockResolvedValue({})

    const result = await updateMyOrganizationMemberProfile(
      userActor(),
      organizationId,
      { display_name: null },
      executor
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        effective: { display_name: 'Global Name', display_name_source: 'global' },
        update_context: { kind: 'self' },
      },
    })
    expect(mocks.insertAuditEvent).not.toHaveBeenCalled()
  })

  it('active managerは同じOrganizationのmember Profileを変更しAuditへ記録する', async () => {
    const target = memberContext()
    const actorMembership = memberContext({
      membershipId: actorMembershipId,
      userId: actorUserId,
      role: 'manager',
    })
    mocks.findMemberProfileContextById
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ ...target, override_display_name: 'Managed Name' })
    mocks.findMemberProfileContextByUser.mockResolvedValue(actorMembership)
    mocks.upsertOrganizationMemberProfile.mockResolvedValue({})

    const result = await updateOrganizationMemberProfile(
      userActor('manager'),
      organizationId,
      targetMembershipId,
      { display_name: 'Managed Name' },
      executor
    )

    expect(result).toMatchObject({
      ok: true,
      value: { update_context: { kind: 'forced', actor_role: 'manager' } },
    })
    expect(mocks.insertAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: actorUserId,
        actor_membership_id: actorMembershipId,
        organization_id: organizationId,
        target_type: 'member_profile',
        target_id: targetMembershipId,
        changed_fields: ['display_name'],
      }),
      executor
    )
  })

  it('managerはmanager/owner Profileを変更できない', async () => {
    mocks.findMemberProfileContextById.mockResolvedValue(memberContext({ role: 'manager' }))
    mocks.findMemberProfileContextByUser.mockResolvedValue(
      memberContext({
        membershipId: actorMembershipId,
        userId: actorUserId,
        role: 'manager',
      })
    )

    await expect(
      updateOrganizationMemberProfile(
        userActor('manager'),
        organizationId,
        targetMembershipId,
        { display_name: 'Denied' },
        executor
      )
    ).resolves.toEqual({ ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } })
    expect(mocks.upsertOrganizationMemberProfile).not.toHaveBeenCalled()
    expect(mocks.insertAuditEvent).not.toHaveBeenCalled()
  })

  it('inactive actor Membershipでは第三者Profileを変更できない', async () => {
    mocks.findMemberProfileContextById.mockResolvedValue(memberContext())
    mocks.findMemberProfileContextByUser.mockResolvedValue(
      memberContext({
        membershipId: actorMembershipId,
        userId: actorUserId,
        role: 'owner',
        status: 'suspended',
      })
    )

    const result = await updateOrganizationMemberProfile(
      userActor('owner'),
      organizationId,
      targetMembershipId,
      { height_meters: 1.8 },
      executor
    )

    expect(result).toEqual({ ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } })
  })

  it('ownerはowner Profileを変更できる', async () => {
    const target = memberContext({ role: 'owner' })
    mocks.findMemberProfileContextById
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ ...target, height_meters: '1.800' })
    mocks.findMemberProfileContextByUser.mockResolvedValue(
      memberContext({
        membershipId: actorMembershipId,
        userId: actorUserId,
        role: 'owner',
      })
    )
    mocks.upsertOrganizationMemberProfile.mockResolvedValue({})

    const result = await updateOrganizationMemberProfile(
      userActor('owner'),
      organizationId,
      targetMembershipId,
      { height_meters: 1.8 },
      executor
    )

    expect(result).toMatchObject({
      ok: true,
      value: { update_context: { kind: 'forced', actor_role: 'owner' } },
    })
  })
})
