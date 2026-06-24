import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { getMyPedestrian } from '../../../src/usecases/pedestrians/get-my-pedestrian.js'
import { listMyRecordings } from '../../../src/usecases/pedestrians/list-my-recordings.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

afterAll(async () => {
  await db.destroy()
})

const userActor = (userId: string): RequestActor => ({
  type: 'user',
  user_id: userId,
  email: 'user@example.com',
  global_role: 'none',
  account_state: 'active',
  password_must_change: false,
  memberships: [],
})

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

describe('getMyPedestrian', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('user_id に紐づく pedestrian を返す', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'My Pedestrian Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const user = await db
      .insertInto('users')
      .values({
        email: 'linked-user@example.com',
        display_name: 'Linked User',
        password_hash: 'hash',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const pedestrian = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'Linked Pedestrian',
        height: 1.72,
        stride_length: 0.7,
        attributes: { label: 'linked' },
        user_id: user.id,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getMyPedestrian(userActor(user.id))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected getMyPedestrian to succeed')
    }

    expect(result.value).toMatchObject({
      pedestrian_id: pedestrian.id,
      organization_id: organization.id,
      display_name: 'Linked Pedestrian',
      height: 1.72,
      stride_length: 0.7,
      attributes: { label: 'linked' },
    })
  })

  it('紐づく pedestrian がない user は PEDESTRIAN_NOT_FOUND を返す', async () => {
    const user = await db
      .insertInto('users')
      .values({
        email: 'unlinked-user@example.com',
        display_name: 'Unlinked User',
        password_hash: 'hash',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await getMyPedestrian(userActor(user.id))

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
      },
    })
  })

  it('service client actor は対象外として拒否する', async () => {
    const result = await getMyPedestrian(serviceClientActor)

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })
})

describe('listMyRecordings', () => {
  beforeEach(async () => {
    await resetDatabase(db)
  })

  it('user_id に紐づく pedestrian の recording だけ返す', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'My Recording Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const user = await db
      .insertInto('users')
      .values({
        email: 'linked-user@example.com',
        display_name: 'Linked User',
        password_hash: 'hash',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const pedestrian = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'Linked Pedestrian',
        user_id: user.id,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherPedestrian = await db
      .insertInto('pedestrians')
      .values({
        organization_id: organization.id,
        display_name: 'Other Pedestrian',
        user_id: null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ name: 'Building A', organization_id: organization.id })
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
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const recording = await db
      .insertInto('recordings')
      .values({
        pedestrian_id: pedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await db
      .insertInto('recordings')
      .values({
        pedestrian_id: otherPedestrian.id,
        floor_id: floor.id,
        organization_id: organization.id,
        upload_targets: ['acce', 'gyro'],
      })
      .execute()

    const result = await listMyRecordings(userActor(user.id))

    expect(result).toMatchObject({
      ok: true,
      value: {
        recordings: [
          {
            recording_id: recording.id,
            pedestrian_id: pedestrian.id,
            floor_id: floor.id,
            organization_id: organization.id,
            upload_status: 'accepted',
            upload_targets: ['acce', 'gyro'],
          },
        ],
      },
    })
  })

  it('紐づく pedestrian がない user は PEDESTRIAN_NOT_FOUND を返す', async () => {
    const user = await db
      .insertInto('users')
      .values({
        email: 'unlinked-recording-user@example.com',
        display_name: 'Unlinked User',
        password_hash: 'hash',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await listMyRecordings(userActor(user.id))

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'PEDESTRIAN_NOT_FOUND',
      },
    })
  })
})
