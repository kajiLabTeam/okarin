import { describe, expect, it } from 'vitest'

import {
  authErrorCodeSchema,
  authErrorResponseSchema,
  errorResponseSchema,
  uploadTargetsSchema,
} from './common.js'

describe('uploadTargetsSchema', () => {
  it('acce と gyro を含む入力を受け入れる', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro'])

    expect(result.success).toBe(true)
  })

  it('acce を含まない入力を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['gyro', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('gyro を含まない入力を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'wifi'])

    expect(result.success).toBe(false)
  })

  it('重複した target を拒否する', () => {
    const result = uploadTargetsSchema.safeParse(['acce', 'gyro', 'gyro'])

    expect(result.success).toBe(false)
  })
})

describe('authErrorCodeSchema', () => {
  it('定義済み auth / authorization error code を受け入れる', () => {
    const codes = [
      'AUTH_UNAUTHENTICATED',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_SESSION_EXPIRED',
      'AUTH_SESSION_REVOKED',
      'AUTH_USER_DISABLED',
      'AUTH_USER_LOCKED',
      'AUTH_PASSWORD_CHANGE_REQUIRED',
      'AUTH_DASHBOARD_FORBIDDEN',
      'AUTH_ORGANIZATION_FORBIDDEN',
    ]

    for (const code of codes) {
      expect(authErrorCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it('未知の error code を拒否する', () => {
    const result = authErrorCodeSchema.safeParse('AUTH_UNKNOWN')

    expect(result.success).toBe(false)
  })
})

describe('authErrorResponseSchema', () => {
  it('auth error response は common error response と互換の shape を持つ', () => {
    const response = {
      error_code: 'AUTH_UNAUTHENTICATED',
      error_message: 'login required',
    }

    expect(authErrorResponseSchema.safeParse(response).success).toBe(true)
    expect(errorResponseSchema.safeParse(response).success).toBe(true)
  })

  it('authorization error response は common error response と互換の shape を持つ', () => {
    const response = {
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
      details: {
        organization_id: '11111111-1111-4111-8111-111111111111',
      },
    }

    expect(authErrorResponseSchema.safeParse(response).success).toBe(true)
    expect(errorResponseSchema.safeParse(response).success).toBe(true)
  })
})
