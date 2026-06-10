import { authErrorStatus } from '../../usecases/auth.js'

interface AuthRouteError {
  type: Parameters<typeof authErrorStatus>[0]['type']
}

const authErrorMessages: Record<AuthRouteError['type'], string> = {
  AUTH_INVALID_CREDENTIALS: 'invalid email or password',
  AUTH_SESSION_EXPIRED: 'session expired',
  AUTH_SESSION_REVOKED: 'session revoked',
  AUTH_TEMPORARY_PASSWORD_EXPIRED: 'temporary password expired',
  AUTH_UNAUTHENTICATED: 'login required',
  AUTH_USER_DISABLED: 'user is disabled',
  AUTH_USER_LOCKED: 'account is locked due to too many failed attempts',
}

export const toAuthErrorResponse = (error: Parameters<typeof authErrorStatus>[0]) => {
  return {
    body: {
      error_code: error.type,
      error_message: authErrorMessages[error.type],
    },
    status: authErrorStatus(error),
  }
}
