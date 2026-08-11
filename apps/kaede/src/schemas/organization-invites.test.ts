import { describe, expect, it } from 'vitest'
import { createOrganizationInviteRequestSchema } from './organization-invites.js'

describe('organization invite schemas', () => {
  it('owner roleのInviteを受け付けない', () => {
    expect(createOrganizationInviteRequestSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })

  it.each(['member', 'manager'])('%s roleのInviteを受け付ける', (role) => {
    expect(createOrganizationInviteRequestSchema.safeParse({ role }).success).toBe(true)
  })
})
