import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestActor } from '../../middleware/request-actor-context.js'
import { createRouteTestApp } from '../create-route-test-app.js'
import { registerFloorMapRevisionRoutes } from './floor-map-revisions.js'

const mocks = vi.hoisted(() => ({
  floor: vi.fn(),
  revision: vi.fn(),
  list: vi.fn(),
  response: vi.fn(),
  update: vi.fn(),
}))
vi.mock('../../services/floors/index.js', () => ({ findFloorDetailById: mocks.floor }))
vi.mock('../../services/floor-maps/revisions.js', () => ({
  findMapRevision: mocks.revision,
  listMapRevisions: mocks.list,
}))
vi.mock('../../usecases/floors/floor-response.js', () => ({ toFloorResponse: mocks.response }))
vi.mock('../../usecases/floors/update-map.js', () => ({ updateMap: mocks.update }))
vi.mock('../../usecases/floors/create-floor.js', () => ({
  floorMapImageMaxBytes: 10 * 1024 * 1024,
}))

const orgId = '11111111-1111-4111-8111-111111111111'
const floorId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const path = `/api/organizations/${orgId}/floors/${floorId}/map-revisions`
const actor: RequestActor = {
  type: 'user',
  user_id: revisionId,
  email: 'user@test.example',
  account_state: 'active',
  global_role: 'none',
  memberships: [{ organization_id: orgId, organization_name: 'Test', role: 'manager' }],
}
const app = (requestActor = actor) =>
  createRouteTestApp('/organizations', registerFloorMapRevisionRoutes, { actor: requestActor })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.floor.mockResolvedValue({ floor_id: floorId, organization_id: orgId })
  mocks.revision.mockResolvedValue({
    id: revisionId,
    floor_id: floorId,
    organization_id: orgId,
    revision: 1,
    scale: 0.01,
  })
  mocks.response.mockResolvedValue({
    floor_id: floorId,
    floor_map_revision_id: revisionId,
    scale: 0.01,
  })
})

describe('map revision API', () => {
  it('旧版をフロア・組織で絞り込み、保存された縮尺で返す', async () => {
    const response = await app().request(`${path}/${revisionId}`)
    expect(response.status).toBe(200)
    expect(mocks.revision).toHaveBeenCalledWith(floorId, orgId, revisionId)
    expect(mocks.response).toHaveBeenCalledWith(
      expect.objectContaining({ floor_map_revision_id: revisionId, revision: 1, scale: 0.01 })
    )
  })
  it('他組織の利用者には履歴を返さない', async () => {
    const response = await app({ ...actor, memberships: [] }).request(`${path}/${revisionId}`)
    expect(response.status).toBe(404)
    expect(mocks.revision).not.toHaveBeenCalled()
  })
  it('存在しない版は404で返す', async () => {
    mocks.revision.mockResolvedValue(undefined)
    expect((await app().request(`${path}/${revisionId}`)).status).toBe(404)
  })
  it('版一覧を現在版と旧版を区別して返す', async () => {
    mocks.list.mockResolvedValue([{ id: revisionId, revision: 1 }])
    const response = await app().request(path)
    expect(response.status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(floorId, orgId)
    expect(await response.json()).toMatchObject({
      revisions: [{ floor_map_revision_id: revisionId }],
    })
  })
  it.each([undefined, '', '0.02'])('画像更新のscale=%sを区別して受理する', async (scale) => {
    const body = new FormData()
    body.set(
      'map_image',
      new File(['<svg viewBox="0 0 100 100"/>'], 'map.svg', { type: 'image/svg+xml' })
    )
    if (scale !== undefined) body.set('scale', scale)
    mocks.update.mockResolvedValue({ ok: true, value: { floor_id: floorId } })
    const response = await app().request(path, { method: 'POST', body })
    expect(response.status).toBe(201)
    expect(mocks.update).toHaveBeenCalledWith(
      actor,
      orgId,
      floorId,
      expect.objectContaining({ contentType: 'image/svg+xml' }),
      scale === undefined ? undefined : scale === '' ? null : 0.02
    )
  })
  it('未対応画像は保存前に拒否する', async () => {
    const body = new FormData()
    body.set('map_image', new File(['gif'], 'map.gif', { type: 'image/gif' }))
    expect((await app().request(path, { method: 'POST', body })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
