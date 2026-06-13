import { describe, expect, it } from 'vitest'
import type { UserRequestActor } from '../middleware/request-actor-context.js'
import { requireRecordingAccess } from './authorization.js'

const organizationId = '99999999-9999-4999-8999-999999999999'
const otherOrganizationId = '88888888-8888-4888-8888-888888888888'
const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'

const userActor = (overrides: Partial<UserRequestActor> = {}): UserRequestActor => ({
  type: 'user',
  user_id: userId,
  email: 'user@example.test',
  global_role: 'none',
  password_must_change: false,
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Test Organization',
      role: 'member',
    },
  ],
  ...overrides,
})

describe('requireRecordingAccess', () => {
  it('service client は organization / owner 制限を受けない', () => {
    expect(
      requireRecordingAccess(
        { type: 'service_client', name: 'shared_token' },
        {
          organization_id: otherOrganizationId,
          pedestrian_user_id: otherUserId,
        }
      )
    ).toEqual({ ok: true })
  })

  it('admin は任意 organization の recording を操作できる', () => {
    expect(
      requireRecordingAccess(
        userActor({
          global_role: 'admin',
          memberships: [],
        }),
        {
          organization_id: otherOrganizationId,
          pedestrian_user_id: otherUserId,
        }
      )
    ).toEqual({ ok: true })
  })

  it('manager は所属 organization の recording を操作できる', () => {
    expect(
      requireRecordingAccess(
        userActor({
          memberships: [
            {
              organization_id: organizationId,
              organization_name: 'Test Organization',
              role: 'manager',
            },
          ],
        }),
        {
          organization_id: organizationId,
          pedestrian_user_id: otherUserId,
        }
      )
    ).toEqual({ ok: true })
  })

  it('manager は別 organization の recording を操作できない', () => {
    expect(
      requireRecordingAccess(
        userActor({
          memberships: [
            {
              organization_id: organizationId,
              organization_name: 'Test Organization',
              role: 'manager',
            },
          ],
        }),
        {
          organization_id: otherOrganizationId,
          pedestrian_user_id: otherUserId,
        }
      )
    ).toEqual({
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    })
  })

  it('member は自分に紐づく pedestrian の recording を操作できる', () => {
    expect(
      requireRecordingAccess(userActor(), {
        organization_id: organizationId,
        pedestrian_user_id: userId,
      })
    ).toEqual({ ok: true })
  })

  it('member は他 user に紐づく pedestrian の recording を操作できない', () => {
    expect(
      requireRecordingAccess(userActor(), {
        organization_id: organizationId,
        pedestrian_user_id: otherUserId,
      })
    ).toEqual({
      ok: false,
      error: { type: 'AUTH_ORGANIZATION_FORBIDDEN' },
    })
  })
})
