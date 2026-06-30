import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createDb } from '../../../src/services/db/client.js'
import type * as StorageService from '../../../src/services/storage/index.js'
import { createFloor, floorMapImageMaxBytes } from '../../../src/usecases/floors/create-floor.js'
import { resetDatabase } from '../../db/helpers.js'

const { putFloorMapObjectMock, deleteFloorMapObjectMock, issueFloorMapDownloadUrlMock } =
  vi.hoisted(() => ({
    putFloorMapObjectMock: vi.fn(),
    deleteFloorMapObjectMock: vi.fn(),
    issueFloorMapDownloadUrlMock: vi.fn(),
  }))

vi.mock('../../../src/services/storage/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageService>()

  return {
    ...actual,
    deleteFloorMapObject: deleteFloorMapObjectMock,
    issueFloorMapDownloadUrl: issueFloorMapDownloadUrlMock,
    putFloorMapObject: putFloorMapObjectMock,
  }
})

const db = createDb()
const validSvg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const serviceClientActor: RequestActor = {
  type: 'service_client',
  name: 'shared_token',
}

const adminActor: RequestActor = {
  type: 'user',
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  global_role: 'admin',
  account_state: 'active',
  memberships: [],
}

const managerActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'manager@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Manager Organization',
      role: 'manager',
    },
  ],
})

const memberActor = (organizationId: string): RequestActor => ({
  type: 'user',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'member@example.com',
  global_role: 'none',
  account_state: 'active',
  memberships: [
    {
      organization_id: organizationId,
      organization_name: 'Member Organization',
      role: 'member',
    },
  ],
})

describe('createFloor', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    issueFloorMapDownloadUrlMock.mockResolvedValue({
      url: 'http://127.0.0.1:8333/okarin-test/floor-map',
      expiresAt: '2026-05-13T01:00:00.000Z',
    })
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('building に紐づく floor を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Floor Test Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Floor Test Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      adminActor,
      organization.id,
      building.id,
      {
        level: 2,
        name: '2F',
        scale: 25,
      },
      {
        bytes: validSvg,
        contentType: 'image/svg+xml',
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createFloor to succeed')
    }

    expect(result.value).toMatchObject({
      building_id: building.id,
      organization_id: organization.id,
      building_name: 'Floor Test Building',
      level: 2,
      name: '2F',
      scale: 25,
    })
    expect(result.value.map_image.download_expires_at).toEqual(expect.any(String))
    const mapDownloadUrl = new URL(result.value.map_image.download_url)
    const expectedMapPath = `/okarin-test/maps/${building.id}/${result.value.floor_id}.svg`
    expect(result.value.map_image).toMatchObject({
      content_type: 'image/svg+xml',
      extension: 'svg',
    })
    expect(mapDownloadUrl.pathname).toBe('/okarin-test/floor-map')
    expect(putFloorMapObjectMock).toHaveBeenCalledWith(
      expectedMapPath.slice('/okarin-test/'.length),
      'svg',
      validSvg
    )

    const floor = await db
      .selectFrom('floors')
      .selectAll()
      .where('id', '=', result.value.floor_id)
      .executeTakeFirstOrThrow()

    expect(floor).toMatchObject({
      id: result.value.floor_id,
      building_id: building.id,
      organization_id: organization.id,
      level: 2,
      name: '2F',
      scale: 25,
      image_object_path: `maps/${building.id}/${result.value.floor_id}.svg`,
    })
  })

  it('存在しない building_id では floor を作成しない', async () => {
    const buildingId = '11111111-1111-4111-8111-111111111111'

    const result = await createFloor(
      serviceClientActor,
      '99999999-9999-4999-8999-999999999999',
      buildingId,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: validPng,
        contentType: 'image/png',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId,
      },
    })

    const floors = await db.selectFrom('floors').select('id').execute()

    expect(floors).toEqual([])
    expect(putFloorMapObjectMock).not.toHaveBeenCalled()
  })

  it('manager は所属 organization の building に floor を作成できる', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Manager Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      managerActor(organization.id),
      organization.id,
      building.id,
      {
        level: 3,
        name: '3F',
      },
      {
        bytes: validPng,
        contentType: 'image/png',
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected createFloor to succeed')
    }

    expect(result.value).toMatchObject({
      building_id: building.id,
      organization_id: organization.id,
      name: '3F',
    })
  })

  it('manager は別 organization の building に floor を作成できない', async () => {
    const ownOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Own Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const otherOrganization = await db
      .insertInto('organizations')
      .values({ name: 'Other Manager Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: otherOrganization.id, name: 'Other Manager Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      managerActor(ownOrganization.id),
      ownOrganization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: validPng,
        contentType: 'image/png',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'BUILDING_NOT_FOUND',
        buildingId: building.id,
      },
    })
  })

  it('member は floor を作成できない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Member Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Member Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      memberActor(organization.id),
      organization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: validPng,
        contentType: 'image/png',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'AUTH_DASHBOARD_FORBIDDEN',
      },
    })
  })

  it('不正な floor map image は floor を作成しない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Invalid Image Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Invalid Image Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      adminActor,
      organization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: new TextEncoder().encode('<svg><script>alert(1)</script></svg>'),
        contentType: 'image/svg+xml',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'FLOOR_MAP_IMAGE_INVALID' },
    })
    expect(putFloorMapObjectMock).not.toHaveBeenCalled()
    await expect(db.selectFrom('floors').select('id').execute()).resolves.toEqual([])
  })

  it('PNG magic number が不正な floor map image は floor を作成しない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Invalid PNG Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Invalid PNG Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      adminActor,
      organization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: new Uint8Array([0x00, 0x01]),
        contentType: 'image/png',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: { type: 'FLOOR_MAP_IMAGE_INVALID' },
    })
    expect(putFloorMapObjectMock).not.toHaveBeenCalled()
    await expect(db.selectFrom('floors').select('id').execute()).resolves.toEqual([])
  })

  it('10MB を超える floor map image は floor を作成しない', async () => {
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'Oversized Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'Oversized Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    const result = await createFloor(
      adminActor,
      organization.id,
      building.id,
      {
        level: 1,
        name: '1F',
      },
      {
        bytes: new Uint8Array(floorMapImageMaxBytes + 1),
        contentType: 'image/png',
      }
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'FLOOR_MAP_IMAGE_TOO_LARGE',
        maxBytes: floorMapImageMaxBytes,
      },
    })
    expect(putFloorMapObjectMock).not.toHaveBeenCalled()
    await expect(db.selectFrom('floors').select('id').execute()).resolves.toEqual([])
  })

  it('S3 保存に失敗した場合は floor を作成しない', async () => {
    putFloorMapObjectMock.mockRejectedValueOnce(new Error('s3 put failed'))
    const organization = await db
      .insertInto('organizations')
      .values({ name: 'S3 Failure Floor Organization' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    const building = await db
      .insertInto('buildings')
      .values({ organization_id: organization.id, name: 'S3 Failure Floor Building' })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await expect(
      createFloor(
        adminActor,
        organization.id,
        building.id,
        {
          level: 1,
          name: '1F',
        },
        {
          bytes: validPng,
          contentType: 'image/png',
        }
      )
    ).rejects.toThrow('s3 put failed')

    await expect(db.selectFrom('floors').select('id').execute()).resolves.toEqual([])
  })
})
