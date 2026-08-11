import type { Insertable, Selectable, Updateable } from 'kysely'
import type { AuditEvents, OrganizationMemberProfiles, UserProfiles } from '../db/generated.js'
import { db } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

export type UserProfile = Selectable<UserProfiles>
export type UserProfileUpdate = Updateable<UserProfiles>
export type OrganizationMemberProfile = Selectable<OrganizationMemberProfiles>
export type OrganizationMemberProfileUpdate = Updateable<OrganizationMemberProfiles>

export interface UserProfileContext {
  user_id: string
  display_name: string
  locale: string
  timezone: string
  profile_updated_at: Date
}

export interface MemberProfileContext extends UserProfileContext {
  membership_id: string | null
  organization_id: string
  membership_user_id: string
  role: string
  status: string | null
  override_display_name: string | null
  height_meters: string | null
  stride_length_meters: string | null
  member_profile_updated_at: Date | null
}

const userProfileContextQuery = (executor: DbExecutor) =>
  executor
    .selectFrom('users as user')
    .innerJoin('user_profiles as profile', 'profile.user_id', 'user.id')
    .select([
      'user.id as user_id',
      'profile.display_name as display_name',
      'profile.locale as locale',
      'profile.timezone as timezone',
      'profile.updated_at as profile_updated_at',
    ])

export const findUserProfileContext = async (
  userId: string,
  executor: DbExecutor = db
): Promise<UserProfileContext | undefined> => {
  return userProfileContextQuery(executor).where('user.id', '=', userId).executeTakeFirst()
}

const memberProfileContextQuery = (executor: DbExecutor) =>
  executor
    .selectFrom('organization_memberships as membership')
    .innerJoin('users as user', 'user.id', 'membership.user_id')
    .innerJoin('user_profiles as user_profile', 'user_profile.user_id', 'user.id')
    .leftJoin('organization_member_profiles as member_profile', (join) =>
      join.onRef('member_profile.membership_id', '=', 'membership.id')
    )
    .select([
      'membership.id as membership_id',
      'membership.organization_id as organization_id',
      'membership.user_id as membership_user_id',
      'membership.role as role',
      'membership.status as status',
      'user.id as user_id',
      'user_profile.display_name as display_name',
      'user_profile.locale as locale',
      'user_profile.timezone as timezone',
      'user_profile.updated_at as profile_updated_at',
      'member_profile.display_name as override_display_name',
      'member_profile.height_meters as height_meters',
      'member_profile.stride_length_meters as stride_length_meters',
      'member_profile.updated_at as member_profile_updated_at',
    ])

export const findMemberProfileContextByUser = async (
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
): Promise<MemberProfileContext | undefined> => {
  return memberProfileContextQuery(executor)
    .where('membership.organization_id', '=', organizationId)
    .where('membership.user_id', '=', userId)
    .where('membership.status', 'in', ['active', 'suspended'])
    .executeTakeFirst()
}

export const findMemberProfileContextById = async (
  organizationId: string,
  membershipId: string,
  executor: DbExecutor = db
): Promise<MemberProfileContext | undefined> => {
  return memberProfileContextQuery(executor)
    .where('membership.organization_id', '=', organizationId)
    .where('membership.id', '=', membershipId)
    .executeTakeFirst()
}

export const upsertUserProfile = async (
  profile: Insertable<UserProfiles>,
  update: UserProfileUpdate,
  executor: DbExecutor = db
): Promise<UserProfile> => {
  return executor
    .insertInto('user_profiles')
    .values(profile)
    .onConflict((conflict) => conflict.column('user_id').doUpdateSet(update))
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const upsertOrganizationMemberProfile = async (
  profile: Insertable<OrganizationMemberProfiles>,
  update: OrganizationMemberProfileUpdate,
  executor: DbExecutor = db
): Promise<OrganizationMemberProfile> => {
  return executor
    .insertInto('organization_member_profiles')
    .values(profile)
    .onConflict((conflict) => conflict.column('membership_id').doUpdateSet(update))
    .returningAll()
    .executeTakeFirstOrThrow()
}

export const insertAuditEvent = async (
  event: Insertable<AuditEvents>,
  executor: DbExecutor = db
) => {
  await executor.insertInto('audit_events').values(event).execute()
}
