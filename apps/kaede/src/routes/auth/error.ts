import { toAuthErrorResponse as toCommonAuthErrorResponse } from '../../schemas/common.js'
import type { AuthErrorCode } from '../../schemas/common.js'

export const toAuthErrorResponse = (error: { type: AuthErrorCode }) => {
  return toCommonAuthErrorResponse(error.type)
}
