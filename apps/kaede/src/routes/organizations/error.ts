import type { OrganizationError } from '../../usecases/organizations.js'

const errorStatuses: Record<OrganizationError['type'], 401 | 403 | 404 | 409> = {
  AUTH_FORBIDDEN: 403,
  AUTH_SESSION_EXPIRED: 401,
  AUTH_SESSION_REVOKED: 401,
  AUTH_UNAUTHENTICATED: 401,
  AUTH_USER_DISABLED: 403,
  ORGANIZATION_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  USER_ALREADY_EXISTS: 409,
}

const errorMessages: Record<OrganizationError['type'], string> = {
  AUTH_FORBIDDEN: 'permission denied',
  AUTH_SESSION_EXPIRED: 'session expired',
  AUTH_SESSION_REVOKED: 'session revoked',
  AUTH_UNAUTHENTICATED: 'login required',
  AUTH_USER_DISABLED: 'user is disabled',
  ORGANIZATION_NOT_FOUND: 'organization not found',
  USER_NOT_FOUND: 'user not found',
  USER_ALREADY_EXISTS: 'user already exists',
}

export const toOrganizationErrorResponse = (error: OrganizationError) => {
  return {
    body: {
      error_code: error.type,
      error_message: errorMessages[error.type],
    },
    status: errorStatuses[error.type],
  }
}
