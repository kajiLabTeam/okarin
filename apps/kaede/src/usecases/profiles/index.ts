import type { Kysely } from 'kysely'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import type {
  OrganizationMemberProfileResponse,
  OrganizationMemberProfileUpdateResponse,
  UpdateOrganizationMemberProfileRequest,
  UpdateUserProfileRequest,
  UserProfileResponse,
} from '../../schemas/profiles.js'
import { db } from '../../services/db/index.js'
import type { DB, Json } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import {
  findMemberProfileContextById,
  findMemberProfileContextByUser,
  findUserProfileContext,
  insertAuditEvent,
  upsertOrganizationMemberProfile,
  upsertUserProfile,
} from '../../services/profiles/index.js'
import type { MemberProfileContext, UserProfileContext } from '../../services/profiles/index.js'
import type { AuthorizationError } from '../authorization.js'

export type ProfileError =
  | AuthorizationError
  | { type: 'USER_NOT_FOUND' }
  | { type: 'MEMBERSHIP_NOT_FOUND' }
  | { type: 'MEMBERSHIP_NOT_ACTIVE' }
  | { type: 'MEMBERSHIP_PROFILE_UNAVAILABLE' }

type ProfileResult<T> = { ok: true; value: T } | { ok: false; error: ProfileError }

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const baseExecutor = executor ?? db

  if ('transaction' in baseExecutor) {
    return (baseExecutor as Kysely<DB>).transaction().execute((trx) => callback(trx))
  }

  return callback(baseExecutor)
}

const requireUserActor = (
  actor: RequestActor
):
  | { ok: true; actor: Extract<RequestActor, { type: 'user' }> }
  | { ok: false; error: ProfileError } => {
  if (actor.type === 'service_client') {
    return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } }
  }

  return { ok: true, actor }
}

const toUserProfileResponse = (context: UserProfileContext): UserProfileResponse => ({
  user_id: context.user_id,
  display_name: context.display_name,
  locale: context.locale,
  timezone: context.timezone,
  updated_at: context.profile_updated_at.toISOString(),
})

const toMemberProfileResponse = (
  context: MemberProfileContext
): OrganizationMemberProfileResponse => {
  if (!context.membership_id) {
    throw new Error('membership id is not available')
  }

  const globalDisplayName = context.display_name

  return {
    organization_id: context.organization_id,
    membership_id: context.membership_id,
    global: {
      display_name: globalDisplayName,
    },
    override: {
      display_name: context.override_display_name,
      height_meters: context.height_meters === null ? null : Number(context.height_meters),
      stride_length_meters:
        context.stride_length_meters === null ? null : Number(context.stride_length_meters),
    },
    effective: {
      display_name: context.override_display_name ?? globalDisplayName,
      display_name_source:
        context.override_display_name === null ? 'global' : 'organization_override',
    },
    updated_at: context.member_profile_updated_at?.toISOString() ?? null,
  }
}

const checkActiveMembership = (
  membership: MemberProfileContext | undefined
):
  | { ok: true; membership: MemberProfileContext & { membership_id: string } }
  | {
      ok: false
      error: ProfileError
    } => {
  if (!membership) {
    return { ok: false, error: { type: 'MEMBERSHIP_NOT_FOUND' } }
  }

  if (membership.status !== 'active') {
    return { ok: false, error: { type: 'MEMBERSHIP_NOT_ACTIVE' } }
  }

  if (!membership.membership_id) {
    return { ok: false, error: { type: 'MEMBERSHIP_PROFILE_UNAVAILABLE' } }
  }

  return {
    ok: true,
    membership: membership as MemberProfileContext & { membership_id: string },
  }
}

export const getMyUserProfile = async (
  actor: RequestActor,
  executor?: DbExecutor
): Promise<ProfileResult<UserProfileResponse>> => {
  const authenticated = requireUserActor(actor)
  if (!authenticated.ok) return authenticated

  const profile = await findUserProfileContext(authenticated.actor.user_id, executor)

  if (!profile) {
    return { ok: false, error: { type: 'USER_NOT_FOUND' } }
  }

  return { ok: true, value: toUserProfileResponse(profile) }
}

export const updateMyUserProfile = async (
  actor: RequestActor,
  payload: UpdateUserProfileRequest,
  executor?: DbExecutor
): Promise<ProfileResult<UserProfileResponse>> => {
  const authenticated = requireUserActor(actor)
  if (!authenticated.ok) return authenticated

  return runInTransaction(executor, async (trx) => {
    const current = await findUserProfileContext(authenticated.actor.user_id, trx)
    if (!current) return { ok: false, error: { type: 'USER_NOT_FOUND' } }

    const next = {
      display_name: payload.display_name ?? current.display_name,
      locale: payload.locale ?? current.locale,
      timezone: payload.timezone ?? current.timezone,
    }

    const profile = await upsertUserProfile(
      { user_id: authenticated.actor.user_id, ...next },
      next,
      trx
    )

    return {
      ok: true,
      value: {
        user_id: profile.user_id,
        display_name: profile.display_name,
        locale: profile.locale,
        timezone: profile.timezone,
        updated_at: profile.updated_at.toISOString(),
      },
    }
  })
}

export const getMyOrganizationMemberProfile = async (
  actor: RequestActor,
  organizationId: string,
  executor?: DbExecutor
): Promise<ProfileResult<OrganizationMemberProfileResponse>> => {
  const authenticated = requireUserActor(actor)
  if (!authenticated.ok) return authenticated

  const membership = checkActiveMembership(
    await findMemberProfileContextByUser(organizationId, authenticated.actor.user_id, executor)
  )
  if (!membership.ok) return membership

  return { ok: true, value: toMemberProfileResponse(membership.membership) }
}

const updateMemberProfile = async (
  current: MemberProfileContext & { membership_id: string },
  payload: UpdateOrganizationMemberProfileRequest,
  executor: DbExecutor
) => {
  const next = {
    display_name:
      payload.display_name === undefined ? current.override_display_name : payload.display_name,
    height_meters:
      payload.height_meters === undefined ? current.height_meters : payload.height_meters,
    stride_length_meters:
      payload.stride_length_meters === undefined
        ? current.stride_length_meters
        : payload.stride_length_meters,
  }

  await upsertOrganizationMemberProfile(
    { membership_id: current.membership_id, ...next },
    next,
    executor
  )

  const refreshed = await findMemberProfileContextById(
    current.organization_id,
    current.membership_id,
    executor
  )

  if (!refreshed) throw new Error('updated membership profile was not found')
  return { next, refreshed }
}

export const updateMyOrganizationMemberProfile = async (
  actor: RequestActor,
  organizationId: string,
  payload: UpdateOrganizationMemberProfileRequest,
  executor?: DbExecutor
): Promise<ProfileResult<OrganizationMemberProfileUpdateResponse>> => {
  const authenticated = requireUserActor(actor)
  if (!authenticated.ok) return authenticated

  return runInTransaction(executor, async (trx) => {
    const membership = checkActiveMembership(
      await findMemberProfileContextByUser(organizationId, authenticated.actor.user_id, trx)
    )
    if (!membership.ok) return membership

    const { refreshed } = await updateMemberProfile(membership.membership, payload, trx)
    return {
      ok: true,
      value: { ...toMemberProfileResponse(refreshed), update_context: { kind: 'self' } },
    }
  })
}

const thirdPartyActorRole = (
  actor: Extract<RequestActor, { type: 'user' }>,
  actorMembership: MemberProfileContext | undefined,
  target: MemberProfileContext
): 'manager' | 'owner' | 'global_admin' | undefined => {
  if (actor.global_role === 'admin') return 'global_admin'
  if (actorMembership?.status !== 'active' || !actorMembership.membership_id) return undefined
  if (actorMembership.role === 'owner') return 'owner'
  if (actorMembership.role === 'manager' && target.role === 'member') return 'manager'
  return undefined
}

export const updateOrganizationMemberProfile = async (
  actor: RequestActor,
  organizationId: string,
  membershipId: string,
  payload: UpdateOrganizationMemberProfileRequest,
  executor?: DbExecutor
): Promise<ProfileResult<OrganizationMemberProfileUpdateResponse>> => {
  const authenticated = requireUserActor(actor)
  if (!authenticated.ok) return authenticated

  return runInTransaction(executor, async (trx) => {
    const target = checkActiveMembership(
      await findMemberProfileContextById(organizationId, membershipId, trx)
    )
    if (!target.ok) return target

    const actorMembership = await findMemberProfileContextByUser(
      organizationId,
      authenticated.actor.user_id,
      trx
    )
    const actorRole = thirdPartyActorRole(authenticated.actor, actorMembership, target.membership)

    if (!actorRole) {
      return { ok: false, error: { type: 'AUTH_DASHBOARD_FORBIDDEN' } }
    }

    const before = {
      display_name: target.membership.override_display_name,
      height_meters:
        target.membership.height_meters === null ? null : Number(target.membership.height_meters),
      stride_length_meters:
        target.membership.stride_length_meters === null
          ? null
          : Number(target.membership.stride_length_meters),
    }
    const { next, refreshed } = await updateMemberProfile(target.membership, payload, trx)
    const after = {
      display_name: next.display_name,
      height_meters: next.height_meters === null ? null : Number(next.height_meters),
      stride_length_meters:
        next.stride_length_meters === null ? null : Number(next.stride_length_meters),
    }
    const changedFields = (Object.keys(after) as (keyof typeof after)[]).filter(
      (field) => before[field] !== after[field]
    )

    if (changedFields.length > 0) {
      await insertAuditEvent(
        {
          actor_user_id: authenticated.actor.user_id,
          actor_membership_id: actorMembership?.membership_id ?? null,
          organization_id: organizationId,
          target_type: 'member_profile',
          target_id: membershipId,
          action: 'update',
          changed_fields: changedFields,
          before_values: before as Json,
          after_values: { ...after, actor_role: actorRole } as Json,
        },
        trx
      )
    }

    return {
      ok: true,
      value: {
        ...toMemberProfileResponse(refreshed),
        update_context: { kind: 'forced', actor_role: actorRole },
      },
    }
  })
}
