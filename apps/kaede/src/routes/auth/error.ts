import { toAuthErrorResponse as toCommonAuthErrorResponse } from '../../schemas/common.js'
import type { AuthErrorCode } from '../../schemas/common.js'

export const toAuthErrorResponse = <TCode extends AuthErrorCode>(error: { type: TCode }) => {
  return toCommonAuthErrorResponse(error.type)
}
