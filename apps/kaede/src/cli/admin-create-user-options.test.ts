import { describe, expect, it } from 'vitest'
import { parseAdminCreateUserCliArgs } from './admin-create-user-options.js'

describe('parseAdminCreateUserCliArgs', () => {
  it('parses flags', () => {
    const result = parseAdminCreateUserCliArgs(
      [
        '--email',
        'admin@example.com',
        '--display-name',
        'Root Admin',
        '--password',
        'temporary-password',
        '--reset-password',
      ],
      {}
    )

    expect(result).toEqual({
      ok: true,
      value: {
        email: 'admin@example.com',
        displayName: 'Root Admin',
        password: 'temporary-password',
        resetPassword: true,
      },
    })
  })

  it('uses ADMIN_EMAIL and ADMIN_PASSWORD when flags are omitted', () => {
    const result = parseAdminCreateUserCliArgs([], {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'temporary-password',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'temporary-password',
        resetPassword: false,
      },
    })
  })

  it('returns an error when required values are missing', () => {
    expect(parseAdminCreateUserCliArgs([], {})).toEqual({
      ok: false,
      error: '--email or ADMIN_EMAIL is required',
    })
  })

  it('returns an error for unknown options', () => {
    expect(
      parseAdminCreateUserCliArgs(
        ['--email', 'admin@example.com', '--password', 'temporary-password', '--unknown'],
        {}
      )
    ).toEqual({
      ok: false,
      error: 'unknown option: --unknown',
    })
  })
})
