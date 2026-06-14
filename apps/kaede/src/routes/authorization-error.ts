import { authErrorMessages } from '../schemas/common.js'
import type { AuthorizationError } from '../usecases/authorization.js'

export const toAuthorizationErrorResponse = (error: AuthorizationError) => {
  return {
    body: {
      error_code: error.type,
      error_message: authErrorMessages[error.type],
    },
    status: 403 as const,
  }
}
