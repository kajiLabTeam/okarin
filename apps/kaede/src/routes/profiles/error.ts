import type { ProfileError } from '../../usecases/profiles/index.js'
import { toAuthorizationErrorResponse } from '../authorization-error.js'

export const toProfileErrorResponse = (error: ProfileError) => {
  switch (error.type) {
    case 'AUTH_DASHBOARD_FORBIDDEN':
    case 'AUTH_ORGANIZATION_FORBIDDEN':
      return toAuthorizationErrorResponse(error)
    case 'USER_NOT_FOUND':
      return {
        body: { error_code: error.type, error_message: 'user not found' },
        status: 404 as const,
      }
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        body: { error_code: error.type, error_message: 'membership not found' },
        status: 404 as const,
      }
    case 'MEMBERSHIP_NOT_ACTIVE':
      return {
        body: { error_code: error.type, error_message: 'membership is not active' },
        status: 403 as const,
      }
    case 'MEMBERSHIP_PROFILE_UNAVAILABLE':
      return {
        body: {
          error_code: error.type,
          error_message: 'membership profile is not available during migration',
        },
        status: 409 as const,
      }
  }
}
