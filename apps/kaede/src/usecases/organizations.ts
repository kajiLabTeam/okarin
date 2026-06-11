import type { CreateOrganizationRequest, OrganizationResponse } from '../schemas/organizations.js'
import type { DbExecutor } from '../services/executor.js'
import { insertOrganization, listOrganizations } from '../services/organizations/index.js'
import type { Organization } from '../services/organizations/index.js'
import { requireActiveSessionUser } from './auth.js'

export type OrganizationError =
  | { type: 'AUTH_UNAUTHENTICATED' }
  | { type: 'AUTH_SESSION_EXPIRED' }
  | { type: 'AUTH_SESSION_REVOKED' }
  | { type: 'AUTH_USER_DISABLED' }
  | { type: 'AUTH_FORBIDDEN' }

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
