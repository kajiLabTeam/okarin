import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetRuntimeConfigForTests } from '../../src/config/runtime.js'
import { createApp } from '../../src/server.js'
import { createDb } from '../../src/services/db/client.js'
import {
  listRecordingRawObjectKeys,
  resetS3ClientForTests,
} from '../../src/services/storage/index.js'
import { resetDatabase } from '../db/helpers.js'
import { createRecordingFixture } from '../fixtures/recordings.js'
import { createStorageClient, putObjectText } from './support/helpers.js'

const db = createDb()
let app: ReturnType<typeof createApp>
const s3 = createStorageClient()

const authHeaders = {
  authorization: 'Bearer shared-token',
}

describe('POST /api/recordings/:recordingId/complete-upload', () => {
  beforeEach(async () => {
    process.env.KAEDE_API_SHARED_TOKEN = 'shared-token'
    resetRuntimeConfigForTests()
    app = createApp()
    await resetDatabase(db)
    resetS3ClientForTests()
  })

  afterAll(async () => {
    s3.destroy()
    await db.destroy()
    Reflect.deleteProperty(process.env, 'KAEDE_API_SHARED_TOKEN')
    resetRuntimeConfigForTests()
  })

  it('必要な raw が揃っていれば ready に更新する', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro', 'metadata'],
    })

    await putObjectText(s3, `recordings/${recordingId}/raw/acce.csv`, 'timestamp,x\n0,1\n')
    await putObjectText(s3, `recordings/${recordingId}/raw/gyro.csv`, 'timestamp,z\n0,2\n')
    await putObjectText(s3, `recordings/${recordingId}/raw/metadata.json`, '{"schema_version":1}\n')

    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
      headers: authHeaders,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      recording_id: recordingId,
      upload_status: 'ready',
    })

    const updated = await db
      .selectFrom('recordings')
      .select(['upload_status'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow()

    expect(updated.upload_status).toBe('ready')
  }, 15000)

  it('不足 raw がある場合は missing_targets を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro', 'metadata'],
    })

    await putObjectText(s3, `recordings/${recordingId}/raw/acce.csv`, 'timestamp,x\n0,1\n')
    await putObjectText(s3, `recordings/${recordingId}/raw/gyro.csv`, 'timestamp,z\n0,2\n')

    const response = await app.request(`/api/recordings/${recordingId}/complete-upload`, {
      method: 'POST',
      headers: authHeaders,
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error_code: 'UPLOAD_TARGETS_MISSING',
      error_message: 'some upload targets are missing',
      details: {
        recording_id: recordingId,
        missing_targets: ['metadata'],
      },
    })

    const updated = await db
      .selectFrom('recordings')
      .select(['upload_status'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow()

    expect(updated.upload_status).toBe('accepted')
  }, 15000)

  it('storage listing が recording 配下の uploaded object keys を返す', async () => {
    const { recordingId } = await createRecordingFixture(db, {
      uploadStatus: 'accepted',
      uploadTargets: ['acce', 'gyro'],
    })

    await putObjectText(s3, `recordings/${recordingId}/raw/acce.csv`, 'timestamp,x\n0,1\n')

    await expect(listRecordingRawObjectKeys(recordingId)).resolves.toEqual([
      `recordings/${recordingId}/raw/acce.csv`,
    ])
  }, 15000)
})
