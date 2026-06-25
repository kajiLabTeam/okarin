import { getOidcRuntimeConfig } from '../../config/runtime.js'
import type { BuildingResponse } from '../../schemas/buildings.js'
import type { FloorResponse } from '../../schemas/floors.js'
import type {
  ApproveOrganizationCreationRequestRequest,
  CreateOrganizationMembershipRequest,
  CreateOrganizationCreationRequestRequest,
  CreateOrganizationRequest,
  CreateOrganizationUserRequest,
  OrganizationCreationRequestResponse,
  OrganizationResponse,
  OrganizationUserResponse,
  RejectOrganizationCreationRequestRequest,
} from '../../schemas/organizations.js'
import type { RecordingDetailResponse } from '../../schemas/recordings.js'
import { hashPassword } from '../../services/auth/password.js'
import { listBuildings as listBuildingRows } from '../../services/buildings/index.js'
import { db } from '../../services/db/index.js'
import type { DbExecutor } from '../../services/executor.js'
import { listFloors as listFloorRows } from '../../services/floors/index.js'
import {
  findOrganizationBySlug,
  findOrganizationCreationRequestById,
  findOrganizationCreationRequestByIdForUpdate,
  findPendingOrganizationCreationRequestByRequester,
  findOrganizationById,
  insertOrganization,
  insertOrganizationCreationRequest,
  listOrganizationCreationRequests,
  listOrganizationCreationRequestsByRequester,
  listOrganizations,
  updateOrganizationCreationRequest,
} from '../../services/organizations/index.js'
import type {
  Organization,
  OrganizationCreationRequest,
} from '../../services/organizations/index.js'
import { insertPedestrian } from '../../services/pedestrians/index.js'
import { listRecordingsByOrganizationId } from '../../services/recordings/index.js'
import {
  findOrganizationMembership,
  findOrganizationUserById,
  findUserByEmail,
  findUserById,
  insertOrganizationMembership,
  insertUser,
  listOrganizationUsers,
  listUserOrganizationMemberships,
  upsertOrganizationMembership,
} from '../../services/users/index.js'
import type { OrganizationUserRow } from '../../services/users/index.js'
import { requireActiveSessionUser } from '../auth/index.js'
import { toBuildingResponse } from '../buildings/building-response.js'
import { toFloorResponse } from '../floors/floor-response.js'
import { toRecordingDetailResponse } from '../recordings/recording-response.js'

export type OrganizationError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'AUTH_FORBIDDEN' }
  | { type: 'ORGANIZATION_NOT_FOUND' }
  | { type: 'ORGANIZATION_CREATION_REQUESTS_DISABLED' }
  | { type: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND' }
  | { type: 'ORGANIZATION_CREATION_REQUEST_NOT_PENDING' }
  | { type: 'ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING' }
  | { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' }
  | { type: 'ORGANIZATION_SLUG_ALREADY_EXISTS' }
  | { type: 'USER_NOT_FOUND' }
  | { type: 'USER_ALREADY_EXISTS' }

export type OrganizationResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: OrganizationError
    }

const toOrganizationResponse = (organization: Organization): OrganizationResponse => ({
  organization_id: organization.id,
  name: organization.name,
  created_at: organization.created_at.toISOString(),
  updated_at: organization.updated_at.toISOString(),
})

const toOrganizationCreationRequestResponse = (
  request: OrganizationCreationRequest
): OrganizationCreationRequestResponse => ({
  request_id: request.id,
  requester_user_id: request.requester_user_id,
  requested_organization_name: request.requested_organization_name,
  requested_slug: request.requested_slug,
  status: request.status as 'pending' | 'approved' | 'rejected',
  reviewed_by_user_id: request.reviewed_by_user_id,
  reviewed_at: request.reviewed_at?.toISOString() ?? null,
  rejected_reason: request.rejected_reason,
  created_organization_id: request.created_organization_id,
  created_at: request.created_at.toISOString(),
  updated_at: request.updated_at.toISOString(),
})

const mapAuthError = (error: Exclude<OrganizationError, { type: 'AUTH_FORBIDDEN' }>) => error
const temporaryPasswordTtlMs = 24 * 60 * 60 * 1000

const normalizeAttributes = (
  attributes: unknown
): NonNullable<OrganizationUserResponse['pedestrian']>['attributes'] => {
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as NonNullable<OrganizationUserResponse['pedestrian']>['attributes']
  }

  return {}
}

const requirePedestrianOrganizationId = (
  pedestrianId: string,
  organizationId: string | null
): string => {
  if (!organizationId) {
    throw new Error(`pedestrian ${pedestrianId} does not have organization_id`)
  }

  return organizationId
}

const toOrganizationUserResponse = (row: OrganizationUserRow): OrganizationUserResponse => ({
  user_id: row.user_id,
  email: row.email,
  display_name: row.display_name,
  is_active: row.is_active,
  role: row.role as 'member' | 'manager' | 'owner',
  password_must_change: row.password_must_change,
  password_changed_at: row.password_changed_at?.toISOString() ?? null,
  temporary_password_expires_at: row.temporary_password_expires_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
  pedestrian:
    row.pedestrian_id && row.pedestrian_created_at && row.pedestrian_updated_at
      ? {
          pedestrian_id: row.pedestrian_id,
          organization_id: requirePedestrianOrganizationId(
            row.pedestrian_id,
            row.pedestrian_organization_id
          ),
          display_name: row.pedestrian_display_name ?? '',
          height: row.pedestrian_height,
          stride_length: row.pedestrian_stride_length,
          attributes: normalizeAttributes(row.pedestrian_attributes),
          created_at: row.pedestrian_created_at.toISOString(),
          updated_at: row.pedestrian_updated_at.toISOString(),
        }
      : null,
})

const runInTransaction = async <T>(
  executor: DbExecutor | undefined,
  callback: (trx: DbExecutor) => Promise<T>
): Promise<T> => {
  const baseExecutor = executor ?? db

  if ('transaction' in baseExecutor) {
    return baseExecutor.transaction().execute((trx) => callback(trx))
  }

  return callback(baseExecutor)
}

const requireAdmin = async (
  sessionToken: string | undefined,
  executor?: DbExecutor
): Promise<OrganizationResult<{ userId: string }>> => {
  const actor = await requireActiveSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return {
      ok: false,
      error: mapAuthError(actor.error),
    }
  }

  if (actor.value.global_role !== 'admin') {
    return {
      ok: false,
      error: { type: 'AUTH_FORBIDDEN' },
    }
  }

  return {
    ok: true,
    value: {
      userId: actor.value.id,
    },
  }
}

const requireSessionUser = async (
  sessionToken: string | undefined,
  executor?: DbExecutor
): Promise<OrganizationResult<{ userId: string; globalRole: 'none' | 'admin' }>> => {
  const actor = await requireActiveSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return {
      ok: false,
      error: mapAuthError(actor.error),
    }
  }

  return {
    ok: true,
    value: {
      userId: actor.value.id,
      globalRole: actor.value.global_role as 'none' | 'admin',
    },
  }
}

const requireOrganizationManagerOrAdmin = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<
  OrganizationResult<{
    userId: string
    globalRole: 'none' | 'admin'
    membershipRole: 'manager' | 'owner' | null
  }>
> => {
  const actor = await requireActiveSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return {
      ok: false,
      error: mapAuthError(actor.error),
    }
  }

  const organization = await findOrganizationById(organizationId, executor)

  if (!organization) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_NOT_FOUND' },
    }
  }

  if (actor.value.global_role === 'admin') {
    return {
      ok: true,
      value: {
        userId: actor.value.id,
        globalRole: 'admin',
        membershipRole: null,
      },
    }
  }

  const membership = await findOrganizationMembership(organizationId, actor.value.id, executor)

  if (membership?.role !== 'manager' && membership?.role !== 'owner') {
    return {
      ok: false,
      error: { type: 'AUTH_FORBIDDEN' },
    }
  }

  return {
    ok: true,
    value: {
      userId: actor.value.id,
      globalRole: 'none',
      membershipRole: membership.role,
    },
  }
}

export const listOrganizationsForSession = async (
  sessionToken: string | undefined,
  executor?: DbExecutor
): Promise<OrganizationResult<{ organizations: OrganizationResponse[] }>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const organizations = await listOrganizations(executor)

  return {
    ok: true,
    value: {
      organizations: organizations.map(toOrganizationResponse),
    },
  }
}

export const getOrganizationForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationResponse>> => {
  const actor = await requireActiveSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return {
      ok: false,
      error: mapAuthError(actor.error),
    }
  }

  const organization = await findOrganizationById(organizationId, executor)

  if (!organization) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_NOT_FOUND' },
    }
  }

  if (actor.value.global_role !== 'admin') {
    const membership = await findOrganizationMembership(organizationId, actor.value.id, executor)

    if (membership?.role !== 'manager' && membership?.role !== 'owner') {
      return {
        ok: false,
        error: { type: 'AUTH_FORBIDDEN' },
      }
    }
  }

  return {
    ok: true,
    value: toOrganizationResponse(organization),
  }
}

export const listOrganizationRecordingsForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<{ recordings: RecordingDetailResponse[] }>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  const recordings = await listRecordingsByOrganizationId(organizationId, executor)

  return {
    ok: true,
    value: {
      recordings: recordings.map(toRecordingDetailResponse),
    },
  }
}

export const listOrganizationBuildingsForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<{ buildings: BuildingResponse[] }>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  const buildings = await listBuildingRows({
    organizationIds: [organizationId],
  })

  return {
    ok: true,
    value: {
      buildings: buildings.map(toBuildingResponse),
    },
  }
}

export const listOrganizationFloorsForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<{ floors: FloorResponse[] }>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  const floors = await listFloorRows({
    organizationIds: [organizationId],
  })

  return {
    ok: true,
    value: {
      floors: floors.map(toFloorResponse),
    },
  }
}

export const createOrganizationForSession = async (
  sessionToken: string | undefined,
  payload: CreateOrganizationRequest,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationResponse>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const organization = await insertOrganization(
    {
      name: payload.name.trim(),
    },
    executor
  )

  return {
    ok: true,
    value: toOrganizationResponse(organization),
  }
}

export const createOrganizationCreationRequestForSession = async (
  sessionToken: string | undefined,
  payload: CreateOrganizationCreationRequestRequest,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationCreationRequestResponse>> => {
  if (!getOidcRuntimeConfig().organizationCreationRequestsEnabled) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUESTS_DISABLED' },
    }
  }

  const actor = await requireSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return actor
  }

  if (actor.value.globalRole === 'admin') {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
    }
  }

  const memberships = await listUserOrganizationMemberships(actor.value.userId, executor)

  if (memberships.length > 0) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
    }
  }

  const pendingRequest = await findPendingOrganizationCreationRequestByRequester(
    actor.value.userId,
    executor
  )

  if (pendingRequest) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING' },
    }
  }

  const request = await insertOrganizationCreationRequest(
    {
      requester_user_id: actor.value.userId,
      requested_organization_name: payload.organization_name.trim(),
      requested_slug: payload.requested_slug ?? null,
    },
    executor
  )

  return {
    ok: true,
    value: toOrganizationCreationRequestResponse(request),
  }
}

export const listMyOrganizationCreationRequestsForSession = async (
  sessionToken: string | undefined,
  executor?: DbExecutor
): Promise<OrganizationResult<{ requests: OrganizationCreationRequestResponse[] }>> => {
  const actor = await requireSessionUser(sessionToken, executor)

  if (!actor.ok) {
    return actor
  }

  const requests = await listOrganizationCreationRequestsByRequester(actor.value.userId, executor)

  return {
    ok: true,
    value: {
      requests: requests.map(toOrganizationCreationRequestResponse),
    },
  }
}

export const listOrganizationCreationRequestsForAdminSession = async (
  sessionToken: string | undefined,
  executor?: DbExecutor
): Promise<OrganizationResult<{ requests: OrganizationCreationRequestResponse[] }>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const requests = await listOrganizationCreationRequests(executor)

  return {
    ok: true,
    value: {
      requests: requests.map(toOrganizationCreationRequestResponse),
    },
  }
}

export const getOrganizationCreationRequestForAdminSession = async (
  sessionToken: string | undefined,
  requestId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationCreationRequestResponse>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const request = await findOrganizationCreationRequestById(requestId, executor)

  if (!request) {
    return {
      ok: false,
      error: { type: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND' },
    }
  }

  return {
    ok: true,
    value: toOrganizationCreationRequestResponse(request),
  }
}

export const approveOrganizationCreationRequestForAdminSession = async (
  sessionToken: string | undefined,
  requestId: string,
  payload: ApproveOrganizationCreationRequestRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationCreationRequestResponse>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const result = await runInTransaction(executor, async (trx) => {
    const request = await findOrganizationCreationRequestByIdForUpdate(requestId, trx)

    if (!request) {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    if (request.status !== 'pending') {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_NOT_PENDING' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    const requester = await findUserById(request.requester_user_id, trx)

    if (!requester || !requester.is_active || requester.global_role === 'admin') {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    const memberships = await listUserOrganizationMemberships(requester.id, trx)

    if (memberships.length > 0) {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    const slug = payload.slug.trim()
    const existingOrganization = await findOrganizationBySlug(slug, trx)

    if (existingOrganization) {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_SLUG_ALREADY_EXISTS' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    const organization = await insertOrganization(
      {
        name: request.requested_organization_name.trim(),
        slug,
      },
      trx
    )

    await insertOrganizationMembership(
      {
        organization_id: organization.id,
        user_id: requester.id,
        role: 'owner',
      },
      trx
    )

    const updatedRequest = await updateOrganizationCreationRequest(
      request.id,
      {
        status: 'approved',
        reviewed_by_user_id: admin.value.userId,
        reviewed_at: now,
        created_organization_id: organization.id,
      },
      trx
    )

    return {
      ok: true,
      value: toOrganizationCreationRequestResponse(updatedRequest),
    } satisfies OrganizationResult<OrganizationCreationRequestResponse>
  })

  return result
}

export const rejectOrganizationCreationRequestForAdminSession = async (
  sessionToken: string | undefined,
  requestId: string,
  payload: RejectOrganizationCreationRequestRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationCreationRequestResponse>> => {
  const admin = await requireAdmin(sessionToken, executor)

  if (!admin.ok) {
    return admin
  }

  const result = await runInTransaction(executor, async (trx) => {
    const request = await findOrganizationCreationRequestByIdForUpdate(requestId, trx)

    if (!request) {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_NOT_FOUND' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    if (request.status !== 'pending') {
      return {
        ok: false,
        error: { type: 'ORGANIZATION_CREATION_REQUEST_NOT_PENDING' },
      } satisfies OrganizationResult<OrganizationCreationRequestResponse>
    }

    const updatedRequest = await updateOrganizationCreationRequest(
      request.id,
      {
        status: 'rejected',
        reviewed_by_user_id: admin.value.userId,
        reviewed_at: now,
        rejected_reason: payload.reason.trim(),
      },
      trx
    )

    return {
      ok: true,
      value: toOrganizationCreationRequestResponse(updatedRequest),
    } satisfies OrganizationResult<OrganizationCreationRequestResponse>
  })

  return result
}

export const listOrganizationUsersForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<{ users: OrganizationUserResponse[] }>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  const users = await listOrganizationUsers(organizationId, executor)

  return {
    ok: true,
    value: {
      users: users.map(toOrganizationUserResponse),
    },
  }
}

export const getOrganizationUserForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  userId: string,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationUserResponse>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  const user = await findOrganizationUserById(organizationId, userId, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'USER_NOT_FOUND' },
    }
  }

  return {
    ok: true,
    value: toOrganizationUserResponse(user),
  }
}

export const createOrganizationUserForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  payload: CreateOrganizationUserRequest,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationUserResponse>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  if (actor.value.globalRole !== 'admin' && payload.role !== 'member') {
    return {
      ok: false,
      error: { type: 'AUTH_FORBIDDEN' },
    }
  }

  const email = payload.email.trim()
  const existingUser = await findUserByEmail(email, executor)

  if (existingUser) {
    return {
      ok: false,
      error: { type: 'USER_ALREADY_EXISTS' },
    }
  }

  const displayName = payload.display_name.trim()
  const passwordHash = await hashPassword(payload.temporary_password)
  const temporaryPasswordExpiresAt = new Date(now.getTime() + temporaryPasswordTtlMs)

  const createdUser = await runInTransaction(executor, async (trx) => {
    const user = await insertUser(
      {
        email,
        display_name: displayName,
        password_hash: passwordHash,
        global_role: 'none',
        is_active: true,
        password_must_change: true,
        password_changed_at: null,
        temporary_password_expires_at: temporaryPasswordExpiresAt,
      },
      trx
    )

    await insertOrganizationMembership(
      {
        organization_id: organizationId,
        user_id: user.id,
        role: payload.role,
      },
      trx
    )

    if (payload.create_pedestrian && payload.pedestrian) {
      await insertPedestrian(
        {
          organization_id: organizationId,
          display_name: payload.pedestrian.display_name.trim(),
          height: payload.pedestrian.height ?? null,
          stride_length: payload.pedestrian.stride_length ?? null,
          attributes: payload.pedestrian.attributes ?? {},
          user_id: user.id,
        },
        trx
      )
    }

    return user
  })

  const createdOrganizationUser: OrganizationUserRow | undefined = await findOrganizationUserById(
    organizationId,
    createdUser.id,
    executor
  )

  if (!createdOrganizationUser) {
    throw new Error('created organization user not found')
  }

  return {
    ok: true,
    value: toOrganizationUserResponse(createdOrganizationUser),
  }
}

export const createOrUpdateOrganizationMembershipForSession = async (
  sessionToken: string | undefined,
  organizationId: string,
  payload: CreateOrganizationMembershipRequest,
  executor?: DbExecutor
): Promise<OrganizationResult<OrganizationUserResponse>> => {
  const actor = await requireOrganizationManagerOrAdmin(sessionToken, organizationId, executor)

  if (!actor.ok) {
    return actor
  }

  if (actor.value.globalRole !== 'admin' && payload.role !== 'member') {
    return {
      ok: false,
      error: { type: 'AUTH_FORBIDDEN' },
    }
  }

  const user = await findUserById(payload.user_id, executor)

  if (!user) {
    return {
      ok: false,
      error: { type: 'USER_NOT_FOUND' },
    }
  }

  await upsertOrganizationMembership(
    {
      organization_id: organizationId,
      user_id: payload.user_id,
      role: payload.role,
    },
    executor
  )

  const organizationUser = await findOrganizationUserById(organizationId, payload.user_id, executor)

  if (!organizationUser) {
    throw new Error('organization user not found after membership upsert')
  }

  return {
    ok: true,
    value: toOrganizationUserResponse(organizationUser),
  }
}
