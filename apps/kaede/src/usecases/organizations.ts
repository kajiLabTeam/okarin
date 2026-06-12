import type {
  CreateOrganizationRequest,
  CreateOrganizationUserRequest,
  OrganizationResponse,
  OrganizationUserResponse,
} from '../schemas/organizations.js'
import { hashPassword } from '../services/auth/password.js'
import { db } from '../services/db/index.js'
import type { DbExecutor } from '../services/executor.js'
import {
  findOrganizationById,
  insertOrganization,
  listOrganizations,
} from '../services/organizations/index.js'
import type { Organization } from '../services/organizations/index.js'
import { insertPedestrian } from '../services/pedestrians/index.js'
import {
  findOrganizationMembership,
  findUserByEmail,
  insertOrganizationMembership,
  insertUser,
  listOrganizationUsers,
} from '../services/users/index.js'
import type { OrganizationUserRow } from '../services/users/index.js'
import { requireActiveSessionUser } from './auth.js'

export type OrganizationError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'AUTH_FORBIDDEN' }
  | { type: 'ORGANIZATION_NOT_FOUND' }
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

const toOrganizationUserResponse = (row: OrganizationUserRow): OrganizationUserResponse => ({
  user_id: row.user_id,
  email: row.email,
  display_name: row.display_name,
  global_role: row.global_role as 'none' | 'admin',
  role: row.role as 'member' | 'manager',
  password_must_change: row.password_must_change,
  password_changed_at: row.password_changed_at?.toISOString() ?? null,
  temporary_password_expires_at: row.temporary_password_expires_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
  pedestrian:
    row.pedestrian_id && row.pedestrian_created_at && row.pedestrian_updated_at
      ? {
          pedestrian_id: row.pedestrian_id,
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

const requireOrganizationManagerOrAdmin = async (
  sessionToken: string | undefined,
  organizationId: string,
  executor?: DbExecutor
): Promise<
  OrganizationResult<{
    userId: string
    globalRole: 'none' | 'admin'
    membershipRole: 'manager' | null
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

  if (membership?.role !== 'manager') {
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
      membershipRole: 'manager',
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

  const createdOrganizationUser = (await listOrganizationUsers(organizationId, executor)).find(
    (user) => user.user_id === createdUser.id
  )

  if (!createdOrganizationUser) {
    throw new Error('created organization user not found')
  }

  return {
    ok: true,
    value: toOrganizationUserResponse(createdOrganizationUser),
  }
}
