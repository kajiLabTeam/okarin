import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession } from '../../../src/services/auth/index.js'
import { verifyPassword } from '../../../src/services/auth/password.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  createOrUpdateOrganizationMembershipForSession,
  createOrganizationUserForSession,
  createOrganizationForSession,
  listOrganizationUsersForSession,
  listOrganizationsForSession,
} from '../../../src/usecases/organizations/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'

const createOrganization = async (name = 'Group A') => {
  return db.insertInto('organizations').values({ name }).returningAll().executeTakeFirstOrThrow()
}

const createUserWithSession = async (params: {
  email: string
  globalRole: 'admin' | 'none'
  membership?: {
    organizationId: string
    role: 'member' | 'manager'
  }
}) => {
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

  if (params.membership) {
    await db
      .insertInto('organization_memberships')
      .values({
        organization_id: params.membership.organizationId,
        user_id: user.id,
        role: params.membership.role,
      })
      .execute()
  }

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

  it('admin can list organization users', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'member',
      },
    })

    const result = await listOrganizationUsersForSession(admin.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        users: [
          {
            email: 'member@example.com',
            role: 'member',
            pedestrian: null,
          },
        ],
      },
    })
  })

  it('manager can list users in their organization', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })

    const result = await listOrganizationUsersForSession(manager.sessionToken, organization.id, db)

    expect(result.ok).toBe(true)
  })

  it('manager cannot list users in another organization', async () => {
    const organization = await createOrganization()
    const otherOrganization = await createOrganization('Group B')
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })

    const result = await listOrganizationUsersForSession(
      manager.sessionToken,
      otherOrganization.id,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })
  })

  it('admin can create a manager user', async () => {
    const now = new Date('2026-06-11T00:00:00.000Z')
    const expiresAt = new Date('2026-06-12T00:00:00.000Z')
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })

    const result = await createOrganizationUserForSession(
      admin.sessionToken,
      organization.id,
      {
        email: 'manager@example.com',
        display_name: 'Manager A',
        role: 'manager',
        temporary_password: 'initial-password',
        create_pedestrian: false,
      },
      now,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        email: 'manager@example.com',
        display_name: 'Manager A',
        role: 'manager',
        password_must_change: true,
        temporary_password_expires_at: '2026-06-12T00:00:00.000Z',
      },
    })

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'manager@example.com')
      .executeTakeFirstOrThrow()
    const membership = await db
      .selectFrom('organization_memberships')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow()

    expect(user.global_role).toBe('none')
    expect(user.temporary_password_expires_at).toEqual(expiresAt)
    await expect(verifyPassword(user.password_hash, 'initial-password')).resolves.toBe(true)
    expect(membership.role).toBe('manager')
  })

  it('manager can create a member user with pedestrian', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })

    const result = await createOrganizationUserForSession(
      manager.sessionToken,
      organization.id,
      {
        email: 'member@example.com',
        display_name: 'Member A',
        role: 'member',
        temporary_password: 'initial-password',
        create_pedestrian: true,
        pedestrian: {
          display_name: 'Pedestrian A',
          height: 170.5,
          stride_length: 72,
          attributes: {
            team: 'A',
          },
        },
      },
      new Date('2026-06-11T00:00:00.000Z'),
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        email: 'member@example.com',
        role: 'member',
        pedestrian: {
          organization_id: organization.id,
          display_name: 'Pedestrian A',
          height: 170.5,
          stride_length: 72,
          attributes: {
            team: 'A',
          },
        },
      },
    })

    const pedestrian = await db
      .selectFrom('pedestrians')
      .innerJoin('users', 'users.id', 'pedestrians.user_id')
      .select([
        'pedestrians.organization_id as organization_id',
        'pedestrians.display_name as display_name',
        'users.email as email',
      ])
      .where('users.email', '=', 'member@example.com')
      .executeTakeFirstOrThrow()

    expect(pedestrian).toEqual({
      organization_id: organization.id,
      display_name: 'Pedestrian A',
      email: 'member@example.com',
    })
  })

  it('manager cannot create a manager user', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })

    const result = await createOrganizationUserForSession(
      manager.sessionToken,
      organization.id,
      {
        email: 'another-manager@example.com',
        display_name: 'Manager B',
        role: 'manager',
        temporary_password: 'initial-password',
        create_pedestrian: false,
      },
      new Date('2026-06-11T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })
  })

  it('create user rejects existing email', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrganizationUserForSession(
      admin.sessionToken,
      organization.id,
      {
        email: 'member@example.com',
        display_name: 'Member A',
        role: 'member',
        temporary_password: 'initial-password',
        create_pedestrian: false,
      },
      new Date('2026-06-11T00:00:00.000Z'),
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'USER_ALREADY_EXISTS',
      },
    })
  })

  it('admin can add an existing user to an organization as member', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      admin.sessionToken,
      organization.id,
      {
        user_id: member.user.id,
        role: 'member',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        email: 'member@example.com',
        role: 'member',
      },
    })

    const membership = await db
      .selectFrom('organization_memberships')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', member.user.id)
      .executeTakeFirstOrThrow()

    expect(membership.role).toBe('member')
  })

  it('admin can promote an existing membership to manager', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'member',
      },
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      admin.sessionToken,
      organization.id,
      {
        user_id: member.user.id,
        role: 'manager',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        email: 'member@example.com',
        role: 'manager',
      },
    })

    const membership = await db
      .selectFrom('organization_memberships')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .where('user_id', '=', member.user.id)
      .executeTakeFirstOrThrow()

    expect(membership.role).toBe('manager')
  })

  it('manager can add an existing user to their organization as member', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      manager.sessionToken,
      organization.id,
      {
        user_id: member.user.id,
        role: 'member',
      },
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        email: 'member@example.com',
        role: 'member',
      },
    })
  })

  it('manager cannot create or promote manager memberships', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      manager.sessionToken,
      organization.id,
      {
        user_id: member.user.id,
        role: 'manager',
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

  it('manager cannot add memberships in another organization', async () => {
    const organization = await createOrganization()
    const otherOrganization = await createOrganization('Group B')
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      manager.sessionToken,
      otherOrganization.id,
      {
        user_id: member.user.id,
        role: 'member',
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

  it('member cannot add memberships', async () => {
    const organization = await createOrganization()
    const memberActor = await createUserWithSession({
      email: 'member-actor@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'member',
      },
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      memberActor.sessionToken,
      organization.id,
      {
        user_id: member.user.id,
        role: 'member',
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

  it('membership upsert returns ORGANIZATION_NOT_FOUND for missing organization', async () => {
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      admin.sessionToken,
      '11111111-1111-4111-8111-111111111111',
      {
        user_id: member.user.id,
        role: 'member',
      },
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
      },
    })
  })

  it('membership upsert returns USER_NOT_FOUND for missing user', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })

    const result = await createOrUpdateOrganizationMembershipForSession(
      admin.sessionToken,
      organization.id,
      {
        user_id: '11111111-1111-4111-8111-111111111111',
        role: 'member',
      },
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'USER_NOT_FOUND',
      },
    })
  })
})
