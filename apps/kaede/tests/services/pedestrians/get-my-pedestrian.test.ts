import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import { getMyPedestrian } from '../../../src/usecases/pedestrians/get-my-pedestrian.js'
import { resetDatabase } from '../../db/helpers.js'

const db = createDb()

const userActor = (userId: string): RequestActor => ({
  type: 'user',
  user_id: userId,
  email: 'user@example.com',
  global_role: 'none',
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

  afterAll(async () => {
    await db.destroy()
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
