import type { OrganizationInviteError } from '../../usecases/organization-invites/index.js'

export const toOrganizationInviteErrorResponse = (error: OrganizationInviteError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
    case 'AUTH_METHOD_NOT_ALLOWED':
    case 'INVITE_MEMBERSHIP_SUSPENDED':
    case 'AUTH_USER_DISABLED':
      return {
        status: 403 as const,
        body: { error_code: error.type, error_message: 'operation is not allowed' },
      }
    case 'AUTH_SESSION_EXPIRED':
    case 'AUTH_SESSION_REVOKED':
      return {
        status: 401 as const,
        body: { error_code: error.type, error_message: 'session is not valid' },
      }
    case 'INVITE_NOT_FOUND':
    case 'INVITE_INVALID':
      return {
        status: 404 as const,
        body: { error_code: error.type, error_message: 'invite is not available' },
      }
    case 'INVITE_EXPIRED':
      return {
        status: 422 as const,
        body: { error_code: error.type, error_message: 'invite expired' },
      }
    case 'INVITE_ALREADY_REDEEMED':
    case 'INVITE_ALREADY_REVOKED':
    case 'INVITE_ALREADY_MEMBER':
    case 'LOCAL_LOGIN_EMAIL_CONFLICT':
    case 'MEMBERSHIP_PROFILE_UNAVAILABLE':
      return {
        status: 409 as const,
        body: { error_code: error.type, error_message: 'invite conflicts with current state' },
      }
    case 'INVITE_NEW_USER_PROFILE_REQUIRED':
    case 'INVITE_EXISTING_USER_PROFILE_NOT_ALLOWED':
      return {
        status: 400 as const,
        body: { error_code: error.type, error_message: 'invalid invite registration payload' },
      }
  }
}
