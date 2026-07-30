import { toAuthErrorResponse as toCommonAuthErrorResponse } from '../../schemas/common.js'
import type { AuthErrorCode } from '../../schemas/common.js'

export const toAuthErrorResponse = <TErrorCode extends AuthErrorCode>(error: {
  type: TErrorCode
}) => {
  return toCommonAuthErrorResponse(error.type)
}
