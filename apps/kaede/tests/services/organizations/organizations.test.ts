import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession } from '../../../src/services/auth/index.js'
import { verifyPassword } from '../../../src/services/auth/password.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  createOrUpdateOrganizationMembershipForSession,
  createOrganizationUserForSession,
  createOrganizationForSession,
  getOrganizationForSession,
  getOrganizationUserForSession,
  listOrganizationBuildingsForSession,
  listOrganizationFloorsForSession,
  listOrganizationRecordingsForSession,
  listOrganizationUsersForSession,
  listOrganizationsForSession,
} from '../../../src/usecases/organizations/index.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()
const passwordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXk$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
const fixedTimestamp = new Date('2026-06-11T00:00:00.000Z')

const createOrganization = async (name = 'Group A') => {
  return db.insertInto('organizations').values({ name }).returningAll().executeTakeFirstOrThrow()
}

const createRecordingForOrganization = async (organizationId: string, suffix: string) => {
  const building = await db
    .insertInto('buildings')
    .values({ name: `Building ${suffix}`, organization_id: organizationId })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const floor = await db
    .insertInto('floors')
    .values({
      building_id: building.id,
      organization_id: organizationId,
      level: 1,
      name: `Floor ${suffix}`,
      image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const pedestrian = await db
    .insertInto('pedestrians')
    .values({
      display_name: `Pedestrian ${suffix}`,
      organization_id: organizationId,
      user_id: null,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return db
    .insertInto('recordings')
    .values({
      pedestrian_id: pedestrian.id,
      floor_id: floor.id,
      organization_id: organizationId,
      upload_targets: ['acce', 'gyro'],
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

const createUserWithSession = async (params: {
  email: string
  globalRole: 'admin' | 'none'
  membership?: {
    organizationId: string
    role: 'member' | 'manager' | 'owner'
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
      password_changed_at: fixedTimestamp,
      temporary_password_expires_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const session = await createSession({ userId: user.id, now: fixedTimestamp }, db)

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
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedTimestamp)
    await resetDatabase(db)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('admin can get an organization', async () => {
    const organization = await createOrganization('Group A')
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })

    const result = await getOrganizationForSession(admin.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        organization_id: organization.id,
        name: 'Group A',
      },
    })
  })

  it('manager can get their organization', async () => {
    const organization = await createOrganization('Group A')
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })

    const result = await getOrganizationForSession(manager.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        organization_id: organization.id,
        name: 'Group A',
      },
    })
  })

  it('owner can get their organization', async () => {
    const organization = await createOrganization('Group A')
    const owner = await createUserWithSession({
      email: 'owner@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'owner',
      },
    })

    const result = await getOrganizationForSession(owner.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        organization_id: organization.id,
        name: 'Group A',
      },
    })
  })

  it('get organization returns not found when organization does not exist', async () => {
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })

    const result = await getOrganizationForSession(
      admin.sessionToken,
      '11111111-1111-4111-8111-111111111111',
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ORGANIZATION_NOT_FOUND',
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

  it('non-admin cannot get an organization', async () => {
    const organization = await createOrganization()
    const member = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await getOrganizationForSession(member.sessionToken, organization.id, db)

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

  it('owner can list users in their organization', async () => {
    const organization = await createOrganization()
    const owner = await createUserWithSession({
      email: 'owner@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'owner',
      },
    })

    const result = await listOrganizationUsersForSession(owner.sessionToken, organization.id, db)

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

  it('admin can list organization buildings', async () => {
    const organization = await createOrganization()
    const otherOrganization = await createOrganization('Group B')
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const building = await db
      .insertInto('buildings')
      .values({
        organization_id: organization.id,
        name: 'Building A',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('buildings')
      .values({
        organization_id: otherOrganization.id,
        name: 'Building B',
      })
      .execute()

    const result = await listOrganizationBuildingsForSession(
      admin.sessionToken,
      organization.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        buildings: [
          {
            building_id: building.id,
            organization_id: organization.id,
            name: 'Building A',
          },
        ],
      },
    })
  })

  it('manager can list buildings in their organization', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    await db
      .insertInto('buildings')
      .values({
        organization_id: organization.id,
        name: 'Building A',
      })
      .execute()

    const result = await listOrganizationBuildingsForSession(
      manager.sessionToken,
      organization.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        buildings: [
          {
            organization_id: organization.id,
            name: 'Building A',
          },
        ],
      },
    })
  })

  it('manager cannot list buildings in another organization', async () => {
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
    await db
      .insertInto('buildings')
      .values({
        organization_id: otherOrganization.id,
        name: 'Building B',
      })
      .execute()

    const result = await listOrganizationBuildingsForSession(
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

  it('admin can list organization floors', async () => {
    const organization = await createOrganization()
    const otherOrganization = await createOrganization('Group B')
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const building = await db
      .insertInto('buildings')
      .values({
        organization_id: organization.id,
        name: 'Building A',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherBuilding = await db
      .insertInto('buildings')
      .values({
        organization_id: otherOrganization.id,
        name: 'Building B',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const floor = await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        organization_id: organization.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/11111111-1111-4111-8111-111111111111.png`,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('floors')
      .values({
        building_id: otherBuilding.id,
        organization_id: otherOrganization.id,
        level: 1,
        name: 'Other 1F',
        image_object_path: `maps/${otherBuilding.id}/22222222-2222-4222-8222-222222222222.png`,
      })
      .execute()

    const result = await listOrganizationFloorsForSession(admin.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        floors: [
          {
            floor_id: floor.id,
            building_id: building.id,
            organization_id: organization.id,
            building_name: 'Building A',
            name: '1F',
          },
        ],
      },
    })
  })

  it('manager can list floors in their organization', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    const building = await db
      .insertInto('buildings')
      .values({
        organization_id: organization.id,
        name: 'Building A',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    await db
      .insertInto('floors')
      .values({
        building_id: building.id,
        organization_id: organization.id,
        level: 1,
        name: '1F',
        image_object_path: `maps/${building.id}/33333333-3333-4333-8333-333333333333.png`,
      })
      .execute()

    const result = await listOrganizationFloorsForSession(manager.sessionToken, organization.id, db)

    expect(result).toMatchObject({
      ok: true,
      value: {
        floors: [
          {
            organization_id: organization.id,
            building_name: 'Building A',
            name: '1F',
          },
        ],
      },
    })
  })

  it('manager cannot list floors in another organization', async () => {
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

    const result = await listOrganizationFloorsForSession(
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

  it('admin can list organization recordings', async () => {
    const organization = await createOrganization()
    const otherOrganization = await createOrganization('Group B')
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const recording = await createRecordingForOrganization(organization.id, 'A')
    await createRecordingForOrganization(otherOrganization.id, 'B')

    const result = await listOrganizationRecordingsForSession(
      admin.sessionToken,
      organization.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: recording.id,
            organization_id: organization.id,
            pedestrian_id: recording.pedestrian_id,
            floor_id: recording.floor_id,
            upload_status: 'accepted',
            upload_targets: ['acce', 'gyro'],
          },
        ],
      },
    })
  })

  it('manager can list recordings in their organization', async () => {
    const organization = await createOrganization()
    const manager = await createUserWithSession({
      email: 'manager@example.com',
      globalRole: 'none',
      membership: {
        organizationId: organization.id,
        role: 'manager',
      },
    })
    await createRecordingForOrganization(organization.id, 'A')

    const result = await listOrganizationRecordingsForSession(
      manager.sessionToken,
      organization.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        recordings: [
          {
            organization_id: organization.id,
          },
        ],
      },
    })
  })

  it('manager cannot list recordings in another organization', async () => {
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
    await createRecordingForOrganization(otherOrganization.id, 'B')

    const result = await listOrganizationRecordingsForSession(
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

  it('organization recording list excludes deleted recordings', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const activeRecording = await createRecordingForOrganization(organization.id, 'A')
    const deletedRecording = await createRecordingForOrganization(organization.id, 'B')
    await db
      .updateTable('recordings')
      .set({ deleted_at: fixedTimestamp })
      .where('id', '=', deletedRecording.id)
      .execute()

    const result = await listOrganizationRecordingsForSession(
      admin.sessionToken,
      organization.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: activeRecording.id,
          },
        ],
      },
    })
  })

  it('admin can get organization user detail', async () => {
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

    const result = await getOrganizationUserForSession(
      admin.sessionToken,
      organization.id,
      member.user.id,
      db
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        user_id: member.user.id,
        email: 'member@example.com',
        role: 'member',
        pedestrian: null,
      },
    })
  })

  it('manager can get user detail in their organization', async () => {
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
      membership: {
        organizationId: organization.id,
        role: 'member',
      },
    })

    const result = await getOrganizationUserForSession(
      manager.sessionToken,
      organization.id,
      member.user.id,
      db
    )

    expect(result.ok).toBe(true)
  })

  it('manager cannot get user detail in another organization', async () => {
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
      membership: {
        organizationId: otherOrganization.id,
        role: 'member',
      },
    })

    const result = await getOrganizationUserForSession(
      manager.sessionToken,
      otherOrganization.id,
      member.user.id,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_FORBIDDEN',
      },
    })
  })

  it('organization user detail returns USER_NOT_FOUND when user is not in organization', async () => {
    const organization = await createOrganization()
    const admin = await createUserWithSession({
      email: 'admin@example.com',
      globalRole: 'admin',
    })
    const user = await createUserWithSession({
      email: 'member@example.com',
      globalRole: 'none',
    })

    const result = await getOrganizationUserForSession(
      admin.sessionToken,
      organization.id,
      user.user.id,
      db
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'USER_NOT_FOUND',
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
