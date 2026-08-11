import type { RequestActor } from '../../middleware/request-actor-context.js'
import type { UpdateMembershipRequest } from '../../schemas/membership-administration.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  countActiveOwners,
  findCurrentMembershipByUserForUpdate,
  findMembershipByIdForUpdate,
  insertMembershipAdministrationAuditEvent,
  lockOrganizationForMembershipAdministration,
  revokeAllMembershipGrants,
  revokeMembershipAuthenticationSources,
  updateManagedMembership,
} from '../../services/membership-administration/index.js'

export type MembershipAdministrationError =
  | 'AUTH_FORBIDDEN'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_ROLE_FORBIDDEN'
  | 'MEMBERSHIP_LEFT'
  | 'MEMBERSHIP_LAST_OWNER'

const response = (membership: {
  id: string
  organization_id: string
  user_id: string
  role: string
  status: string
  joined_at: Date
  left_at: Date | null
  updated_at: Date
}) => ({
  id: membership.id,
  organization_id: membership.organization_id,
  user_id: membership.user_id,
  role: membership.role as 'member' | 'manager' | 'owner',
  status: membership.status as 'active' | 'suspended' | 'left',
  joined_at: membership.joined_at.toISOString(),
  left_at: membership.left_at?.toISOString() ?? null,
  updated_at: membership.updated_at.toISOString(),
})

export const updateOrganizationMembership = async (
  actor: RequestActor,
  organizationId: string,
  membershipId: string,
  payload: UpdateMembershipRequest,
  now = new Date(),
  executor?: DbExecutor
) => {
  if (actor.type !== 'user') {
    return { ok: false, error: { type: 'AUTH_FORBIDDEN' as const } } as const
  }
  const base = executor ?? db
  const run = async (trx: DbExecutor) => {
    const organization = await lockOrganizationForMembershipAdministration(organizationId, trx)
    if (!organization) {
      return { ok: false, error: { type: 'MEMBERSHIP_NOT_FOUND' as const } } as const
    }
    const actorMembership = await findCurrentMembershipByUserForUpdate(
      organizationId,
      actor.user_id,
      trx
    )
    if (actorMembership?.status !== 'active') {
      return { ok: false, error: { type: 'AUTH_FORBIDDEN' as const } } as const
    }
    const target = await findMembershipByIdForUpdate(organizationId, membershipId, trx)
    if (!target) return { ok: false, error: { type: 'MEMBERSHIP_NOT_FOUND' as const } } as const
    if (target.status === 'left') {
      return { ok: false, error: { type: 'MEMBERSHIP_LEFT' as const } } as const
    }

    const nextRole = payload.role ?? (target.role as 'member' | 'manager' | 'owner')
    const nextStatus = payload.status ?? (target.status as 'active' | 'suspended')
    const managerAllowed =
      actorMembership.role === 'manager' && target.role === 'member' && nextRole === 'member'
    const ownerAllowed = actorMembership.role === 'owner'
    if (!managerAllowed && !ownerAllowed) {
      return { ok: false, error: { type: 'MEMBERSHIP_ROLE_FORBIDDEN' as const } } as const
    }

    const removesActiveOwner =
      target.role === 'owner' &&
      target.status === 'active' &&
      (nextRole !== 'owner' || nextStatus !== 'active')
    if (removesActiveOwner && (await countActiveOwners(organizationId, trx)) <= 1) {
      return { ok: false, error: { type: 'MEMBERSHIP_LAST_OWNER' as const } } as const
    }

    const changedFields = [
      ...(nextRole === target.role ? [] : ['role']),
      ...(nextStatus === target.status ? [] : ['status']),
    ]
    if (changedFields.length === 0) return { ok: true, value: response(target) } as const

    const updated = await updateManagedMembership(
      target.id,
      {
        role: nextRole,
        status: nextStatus,
        left_at: nextStatus === 'left' ? now : null,
        updated_at: now,
      },
      trx
    )
    await revokeAllMembershipGrants(target.id, now, trx)
    if (nextStatus === 'left') {
      await revokeMembershipAuthenticationSources(target.id, now, trx)
    }
    await insertMembershipAdministrationAuditEvent(
      {
        action: 'update',
        actor_user_id: actor.user_id,
        actor_membership_id: actorMembership.id,
        organization_id: organizationId,
        target_type: 'organization_membership',
        target_id: target.id,
        changed_fields: changedFields,
        before_values: { role: target.role, status: target.status },
        after_values: { role: updated.role, status: updated.status },
      },
      trx
    )

    return { ok: true, value: response(updated) } as const
  }
  return 'transaction' in base ? base.transaction().execute(run) : run(base)
}
