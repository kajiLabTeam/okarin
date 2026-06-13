import type { AuthorizationError } from '../usecases/authorization.js'

const authorizationErrorMessages: Record<AuthorizationError['type'], string> = {
  AUTH_DASHBOARD_FORBIDDEN: 'dashboard access forbidden',
  AUTH_ORGANIZATION_FORBIDDEN: 'organization access forbidden',
}

export const toAuthorizationErrorResponse = (error: AuthorizationError) => {
  return {
    body: {
      error_code: error.type,
      error_message: authorizationErrorMessages[error.type],
    },
    status: 403 as const,
  }
}
