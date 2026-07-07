import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from '../../../src/config/runtime.js'
import type { RequestActor } from '../../../src/middleware/request-actor-context.js'
import { createRouteTestApp } from '../../../src/routes/create-route-test-app.js'
import { registerUpdateRecordingConstraintsRoute } from '../../../src/routes/recordings/update-recording-constraints.js'
import { recordingConstraintsResponseSchema } from '../../../src/schemas/recordings.js'
import { createApp } from '../../../src/server.js'
import { createDb } from '../../../src/services/db/client.js'
import { resetDatabase } from '../../db/helpers.js'
import { createRecordingFixture } from '../../fixtures/recordings.js'

const db = createDb()
let app: ReturnType<typeof createApp>
const authHeaders = { authorization: 'Bearer shared-token' }

describe('recording constraints API', () => {
  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    resetRuntimeConfigForTests()
    app = createApp()
    await resetDatabase(db)
  })

  afterAll(async () => {
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()
  })

  it('GET は現在の recording constraints を返す', async () => {
    const constraints = [{ seq: 0, point_type: 'start' as const, x: 10, y: 20 }]
    const { recordingId } = await createRecordingFixture(db, { constraints })

    const response = await app.request(`/api/recordings/${recordingId}/constraints`, {
      headers: authHeaders,
    })

    expect(response.status).toBe(200)
    expect(recordingConstraintsResponseSchema.parse(await response.json())).toEqual({
      recording_id: recordingId,
      constraints,
    })
  })

  it('GET は不正な DB constraints に 500 を返す', async () => {
    const { recordingId } = await createRecordingFixture(db)
    await db
      .updateTable('recordings')
      .set({ constraints: JSON.stringify([{ seq: 1, point_type: 'start', x: 10, y: 20 }]) })
      .where('id', '=', recordingId)
      .execute()

    const response = await app.request(`/api/recordings/${recordingId}/constraints`, {
      headers: authHeaders,
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error_code: 'RECORDING_CONSTRAINTS_INVALID',
      error_message: 'recording constraints contain invalid values',
      details: { recording_id: recordingId },
    })
  })

  it('service client は PUT できない', async () => {
    const { recordingId } = await createRecordingFixture(db)

    const response = await app.request(`/api/recordings/${recordingId}/constraints`, {
      method: 'PUT',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ constraints: [] }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error_code: 'AUTH_DASHBOARD_FORBIDDEN',
      error_message: 'dashboard access forbidden',
    })
  })

  it('manager は PUT で constraints を設定し空配列へ戻せる', async () => {
    const { organizationId, recordingId } = await createRecordingFixture(db)
    const manager: RequestActor = {
      type: 'user',
      user_id: '22222222-2222-4222-8222-222222222222',
      email: 'manager@example.test',
      global_role: 'none',
      account_state: 'active',
      memberships: [
        {
          organization_id: organizationId,
          organization_name: 'Fixture Organization',
          role: 'manager',
        },
      ],
    }
    const managerApp = createRouteTestApp('/recordings', registerUpdateRecordingConstraintsRoute, {
      actor: manager,
    })
    const constraints = [{ seq: 0, point_type: 'start', x: 10, y: 20 }]

    for (const nextConstraints of [constraints, []]) {
      const response = await managerApp.request(`/api/recordings/${recordingId}/constraints`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ constraints: nextConstraints }),
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        recording_id: recordingId,
        constraints: nextConstraints,
      })
    }

    const recording = await db
      .selectFrom('recordings')
      .select(['constraints'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow()
    expect(recording.constraints).toEqual([])
  })

  it('存在しない recording は GET/PUT ともに 404 を返す', async () => {
    const recordingId = '11111111-1111-4111-8111-111111111111'

    const getResponse = await app.request(`/api/recordings/${recordingId}/constraints`, {
      headers: authHeaders,
    })
    const putResponse = await app.request(`/api/recordings/${recordingId}/constraints`, {
      method: 'PUT',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ constraints: [] }),
    })

    expect(getResponse.status).toBe(404)
    expect(putResponse.status).toBe(404)
  })
})
