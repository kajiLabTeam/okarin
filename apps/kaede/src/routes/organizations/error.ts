import { authErrorMessages, authErrorStatuses } from '../../schemas/common.js'
import type { OrganizationError } from '../../usecases/organizations/index.js'

const errorStatuses: Record<OrganizationError['type'], 401 | 403 | 404 | 409> = {
  AUTH_FORBIDDEN: 403,
  AUTH_SESSION_EXPIRED: authErrorStatuses.AUTH_SESSION_EXPIRED,
  AUTH_SESSION_REVOKED: authErrorStatuses.AUTH_SESSION_REVOKED,
  AUTH_UNAUTHENTICATED: authErrorStatuses.AUTH_UNAUTHENTICATED,
  AUTH_USER_DISABLED: authErrorStatuses.AUTH_USER_DISABLED,
  BUILDING_NOT_FOUND: 404,
  ORGANIZATION_CREATION_REQUESTS_DISABLED: 403,
  ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING: 409,
  ORGANIZATION_CREATION_REQUEST_NOT_FOUND: 404,
  ORGANIZATION_CREATION_REQUEST_NOT_PENDING: 409,
  ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER: 403,
  ORGANIZATION_NOT_FOUND: 404,
  ORGANIZATION_SLUG_ALREADY_EXISTS: 409,
  USER_NOT_FOUND: 404,
  USER_ALREADY_EXISTS: 409,
}

const errorMessages: Record<OrganizationError['type'], string> = {
  AUTH_FORBIDDEN: 'permission denied',
  AUTH_SESSION_EXPIRED: authErrorMessages.AUTH_SESSION_EXPIRED,
  AUTH_SESSION_REVOKED: authErrorMessages.AUTH_SESSION_REVOKED,
  AUTH_UNAUTHENTICATED: authErrorMessages.AUTH_UNAUTHENTICATED,
  AUTH_USER_DISABLED: authErrorMessages.AUTH_USER_DISABLED,
  BUILDING_NOT_FOUND: 'building not found',
  ORGANIZATION_CREATION_REQUESTS_DISABLED: 'organization creation requests are disabled',
  ORGANIZATION_CREATION_REQUEST_ALREADY_PENDING: 'organization creation request already pending',
  ORGANIZATION_CREATION_REQUEST_NOT_FOUND: 'organization creation request not found',
  ORGANIZATION_CREATION_REQUEST_NOT_PENDING: 'organization creation request is not pending',
  ORGANIZATION_CREATION_REQUEST_REQUIRES_PENDING_USER:
    'organization creation request requires pending user',
  ORGANIZATION_NOT_FOUND: 'organization not found',
  ORGANIZATION_SLUG_ALREADY_EXISTS: 'organization slug already exists',
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
