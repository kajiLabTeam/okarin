import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../../../src/services/auth/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  createOrganizationForSession,
  listOrganizationsForSession,
} from '../../../src/usecases/organizations.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const createUserWithSession = async (params: { email: string; globalRole: 'admin' | 'none' }) => {
  const user = await db
    .insertInto('users')
    .values({
      email: params.email,
      display_name: params.email,
      password_hash: passwordHash,
      global_role: params.globalRole,
      is_active: true,
      password_must_change: false,
      password_changed_at: new Date('2026-06-11T00:00:00.000Z'),
      temporary_password_expires_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const session = await createSession(
    {
      userId: user.id,
      now: new Date('2026-06-11T00:00:00.000Z'),
    },
    db
  )

  return {
    user,
    sessionToken: session.token,
  }
}

describe('organizations usecase', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('admin can create an organization', async () => {
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })

    const result = await createOrganizationForSession(
      admin.sessionToken,
      {
        name: ' Group A ',
      },
      db
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value).toMatchObject({
      name: 'Group A',
    })

    const organization = await db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', result.value.organization_id)
      .executeTakeFirstOrThrow()

    expect(organization.name).toBe('Group A')
  })

  it('admin can list organizations', async () => {
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    await db
      .insertInto('organizations')
      .values([{ name: 'Group B' }, { name: 'Group A' }])
      .execute()

    const result = await listOrganizationsForSession(admin.sessionToken, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        organizations: [{ name: 'Group A' }, { name: 'Group B' }],
      },
    })
  })

  it('non-admin cannot create an organization', async () => {
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrganizationForSession(
      member.sessionToken,
      {
        name: 'Group A',
      },
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })
  })
})
