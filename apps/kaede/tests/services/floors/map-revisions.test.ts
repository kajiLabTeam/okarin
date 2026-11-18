import { sql } from 'kysely'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { updateBeacon } from '../../../src/services/beacons/index.js'
import { createDb } from '../../../src/services/db/client.js'
import {
  findMapRevision,
  listMapRevisions,
  listRevisionBeacons,
} from '../../../src/services/floor-maps/revisions.js'
import { insertRecording } from '../../../src/services/recordings/index.js'
import type * as StorageService from '../../../src/services/storage/index.js'
import { insertTrajectory } from '../../../src/services/trajectories/index.js'
import { getFloor } from '../../../src/usecases/floors/get-floor.js'
import { updateMap } from '../../../src/usecases/floors/update-map.js'
import { resetDatabase } from '../../db/helpers.js'

const { put, remove } = vi.hoisted(() => ({ put: vi.fn(), remove: vi.fn() }))
vi.mock('../../../src/services/storage/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StorageService>()),
  putFloorMapObject: put,
  deleteFloorMapObject: remove,
  issueFloorMapDownloadUrl: (key: string) =>
    Promise.resolve({
      url: `https://storage.test/${key}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
}))
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Expected value')
  return value
}
const db = createDb()
const actor = { type: 'service_client', name: 'test' } as const
const svg = (width = 100) => ({
  bytes: new TextEncoder().encode(`<svg viewBox="0 0 ${width} 200"></svg>`),
  contentType: 'image/svg+xml' as const,
})
const seed = async () => {
  const org = await db
    .insertInto('organizations')
    .values({ name: 'Maps' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const building = await db
    .insertInto('buildings')
    .values({ organization_id: org.id, name: 'Building' })
    .returningAll()
    .executeTakeFirstOrThrow()
  const floorId = randomUUID()
  await db
    .insertInto('floors')
    .values({
      id: floorId,
      building_id: building.id,
      organization_id: org.id,
      level: 1,
      name: 'Floor',
      image_object_path: `organizations/${org.id}/floors/${floorId}/map.svg`,
      map_width_px: 100,
      map_height_px: 200,
      scale: 0.01,
    })
    .execute()
  const pedestrian = await db
    .insertInto('pedestrians')
    .values({ organization_id: org.id, display_name: 'Walker' })
    .returningAll()
    .executeTakeFirstOrThrow()
  return { orgId: org.id, floorId, pedestrianId: pedestrian.id }
}

describe('floor map revision lifecycle', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await resetDatabase(db)
  })
  afterAll(async () => {
    await db.destroy()
  })

  it('v1計測後のv2登録でも旧画像・座標サイズ・縮尺と計測参照が変わらない', async () => {
    const { orgId, floorId, pedestrianId } = await seed()
    const initial = required(await findMapRevision(floorId, orgId))
    const recording = await insertRecording({
      organization_id: orgId,
      floor_id: floorId,
      pedestrian_id: pedestrianId,
      upload_targets: ['metadata'],
      floor_map_revision_id: initial.id,
    })
    expect((await updateMap(actor, orgId, floorId, svg(300), 0.02)).ok).toBe(true)
    const revisions = await listMapRevisions(floorId, orgId)
    expect(revisions).toHaveLength(2)
    expect(revisions[0]).toMatchObject({
      revision: 2,
      map_width_px: 300,
      scale: 0.02,
      beacons_need_review: true,
    })
    expect(revisions[0].image_object_path).toContain('/revisions/')
    expect(await findMapRevision(floorId, orgId, initial.id)).toMatchObject({
      image_object_path: initial.image_object_path,
      map_width_px: 100,
      map_height_px: 200,
      scale: 0.01,
    })
    const trajectory = await insertTrajectory({
      organization_id: orgId,
      floor_id: floorId,
      recording_id: recording.id,
    })
    expect(trajectory.floor_map_revision_id).toBe(initial.id)
    const legacy = await insertRecording({
      organization_id: orgId,
      floor_id: floorId,
      pedestrian_id: pedestrianId,
      upload_targets: ['metadata'],
    })
    expect(legacy.floor_map_revision_id).toBe(initial.id)
    const modern = await insertRecording({
      organization_id: orgId,
      floor_id: floorId,
      pedestrian_id: pedestrianId,
      upload_targets: ['metadata'],
      floor_map_revision_id: revisions[0].id,
    })
    expect(modern.floor_map_revision_id).toBe(revisions[0].id)
    const response = await getFloor(actor, { floorId, revisionId: initial.id })
    expect(response).toMatchObject({
      ok: true,
      value: { floor_map_revision_id: initial.id, scale: 0.01, map_width_px: 100 },
    })
  })

  it('旧配置を保持し、新版の保存でのみ現在配置が変わる。縮尺変更では再確認を要求しない', async () => {
    const { orgId, floorId } = await seed()
    const initial = required(await findMapRevision(floorId, orgId))
    const beacon = await db
      .insertInto('beacons')
      .values({
        floor_id: floorId,
        organization_id: orgId,
        name: 'Beacon',
        format_type: 'ibeacon',
        format_config: { uuid: randomUUID(), major: 1, minor: 1 },
        pixel_x: 10,
        pixel_y: 20,
        enabled: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await updateMap(actor, orgId, floorId, svg(300))
    const current = (await listMapRevisions(floorId, orgId))[0]
    expect(await listRevisionBeacons(floorId, orgId, current.id)).toMatchObject([{ pixel_x: 10 }])
    await updateBeacon(orgId, beacon.id, { pixel_x: 30 })
    expect(await listRevisionBeacons(floorId, orgId, initial.id)).toMatchObject([{ pixel_x: 10 }])
    expect(await listRevisionBeacons(floorId, orgId, current.id)).toMatchObject([{ pixel_x: 30 }])
    await db.updateTable('floors').set({ scale: 0.03 }).where('id', '=', floorId).execute()
    const scaled = (await listMapRevisions(floorId, orgId))[0]
    expect(scaled).toMatchObject({
      revision: 3,
      image_object_path: current.image_object_path,
      beacons_need_review: false,
    })
    expect((await findMapRevision(floorId, orgId, current.id))?.scale).toBe(0.01)
  })

  it('アップロード失敗・DB失敗で旧版を保持し、DB失敗時は未参照画像を片付ける', async () => {
    const { orgId, floorId } = await seed()
    const initial = required(await findMapRevision(floorId, orgId))
    put.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(updateMap(actor, orgId, floorId, svg())).rejects.toThrow('storage unavailable')
    expect(await listMapRevisions(floorId, orgId)).toHaveLength(1)
    expect(remove).not.toHaveBeenCalled()
    await expect(updateMap(actor, orgId, floorId, svg(), -1)).rejects.toThrow()
    expect(remove).toHaveBeenCalledOnce()
    expect(await getFloor(actor, { floorId })).toMatchObject({
      ok: true,
      value: { current_map_revision_id: initial.id },
    })
  })

  it('他フロア・他組織の版と不明なIDを関連付けられず、版の画像や縮尺は変更できない', async () => {
    const first = await seed()
    const other = await seed()
    const revision = required(await findMapRevision(first.floorId, first.orgId))
    expect(await findMapRevision(first.floorId, other.orgId, revision.id)).toBeUndefined()
    expect(await findMapRevision(other.floorId, first.orgId, revision.id)).toBeUndefined()
    for (const revisionId of [revision.id, randomUUID()]) {
      await expect(
        insertRecording({
          organization_id: other.orgId,
          floor_id: other.floorId,
          pedestrian_id: other.pedestrianId,
          upload_targets: ['metadata'],
          floor_map_revision_id: revisionId,
        })
      ).rejects.toThrow()
    }
    await expect(
      db
        .updateTable('floor_map_revisions')
        .set({ scale: 0.5 })
        .where('id', '=', revision.id)
        .execute()
    ).rejects.toThrow('immutable')
    await expect(
      db
        .updateTable('floor_map_revisions')
        .set({ map_width_px: 500 })
        .where('id', '=', revision.id)
        .execute()
    ).rejects.toThrow('immutable')
  })
  it('移行時に存在する地図を初期版にし、既存Recording・Trajectoryを初期版で表示・再解析できる参照にする', async () => {
    const { orgId, floorId, pedestrianId } = await seed()
    const recording = await insertRecording({
      organization_id: orgId,
      floor_id: floorId,
      pedestrian_id: pedestrianId,
      upload_targets: ['metadata'],
    })
    const trajectory = await insertTrajectory({
      organization_id: orgId,
      floor_id: floorId,
      recording_id: recording.id,
    })
    const migration = await readFile(
      new URL(
        '../../../../../db/migrations/20261118010000_add_floor_map_revisions.sql',
        import.meta.url
      ),
      'utf8'
    )
    const [up, down] = migration.split('-- migrate:down')
    try {
      await db.transaction().execute(async (tx) => {
        await sql.raw(down).execute(tx)
        await sql.raw(up).execute(tx)
        const initial = await tx
          .selectFrom('floor_map_revisions')
          .selectAll()
          .where('floor_id', '=', floorId)
          .executeTakeFirstOrThrow()
        expect(initial).toMatchObject({ revision: 1, map_width_px: 100, scale: 0.01 })
        expect(
          (
            await tx
              .selectFrom('recordings')
              .selectAll()
              .where('id', '=', recording.id)
              .executeTakeFirstOrThrow()
          ).floor_map_revision_id
        ).toBe(initial.id)
        expect(
          (
            await tx
              .selectFrom('trajectories')
              .selectAll()
              .where('id', '=', trajectory.id)
              .executeTakeFirstOrThrow()
          ).floor_map_revision_id
        ).toBe(initial.id)
        throw new Error('rollback migration test')
      })
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'rollback migration test') throw error
    }
  })

  it('同時の画像更新は直列化され、版番号や現在版が混ざらない', async () => {
    const { orgId, floorId } = await seed()
    await Promise.all([
      updateMap(actor, orgId, floorId, svg(300), 0.03),
      updateMap(actor, orgId, floorId, svg(400), 0.04),
    ])
    const revisions = await listMapRevisions(floorId, orgId)
    expect(revisions.map((r) => r.revision)).toEqual([3, 2, 1])
    expect(new Set(revisions.map((r) => r.image_object_path)).size).toBe(3)
    for (const r of revisions) expect(r.scale).toBe((r.map_width_px ?? 0) / 10000)
  })
})
