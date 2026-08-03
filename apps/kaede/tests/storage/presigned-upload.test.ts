import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  issueAnalysisTrajectoryCsvDownloadUrl,
  issueInternalAnalysisHeatmapUploadUrl,
  issueInternalAnalysisTrajectoryUploadUrl,
  putFloorMapObject,
  issueRecordingUploadUrls,
  resetS3ClientForTests,
} from '../../src/services/storage/index.js'
import { createStorageClient, readObjectText } from './support/helpers.js'

const s3 = createStorageClient()

describe('presigned upload integration', () => {
  beforeEach(() => {
    resetS3ClientForTests()
  })

  afterAll(() => {
    s3.destroy()
  })

  it('発行した presigned URL に PUT した CSV を取得できる', async () => {
    const organizationId = '99999999-9999-4999-8999-999999999999'
    const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const csv = 'timestamp,x,y\n0,1,2\n'
    const { uploadUrls } = await issueRecordingUploadUrls(organizationId, recordingId, ['acce'])
    const uploadUrl = uploadUrls.acce

    expect(uploadUrl).toBeDefined()
    if (!uploadUrl) {
      throw new Error('acce upload URL is not defined')
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: csv,
      headers: {
        'content-type': 'text/csv',
      },
    })

    expect(uploadResponse.ok).toBe(true)
    await expect(
      readObjectText(s3, `organizations/${organizationId}/recordings/${recordingId}/raw/acce.csv`)
    ).resolves.toBe(csv)
  }, 30000)

  it('発行した presigned URL に PUT した metadata.json を取得できる', async () => {
    const organizationId = '88888888-8888-4888-8888-888888888888'
    const recordingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const metadata = '{"schema_version":1,"selected_sampling_rate":"100Hz"}\n'
    const { uploadUrls } = await issueRecordingUploadUrls(organizationId, recordingId, ['metadata'])
    const uploadUrl = uploadUrls.metadata

    expect(uploadUrl).toBeDefined()
    if (!uploadUrl) {
      throw new Error('metadata upload URL is not defined')
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: metadata,
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(uploadResponse.ok).toBe(true)
    await expect(
      readObjectText(
        s3,
        `organizations/${organizationId}/recordings/${recordingId}/raw/metadata.json`
      )
    ).resolves.toBe(metadata)
  }, 30000)

  it('floor map object を API 内部用 helper で保存できる', async () => {
    const objectKey =
      'maps/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.svg'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

    await putFloorMapObject(objectKey, 'svg', new TextEncoder().encode(svg))

    await expect(readObjectText(s3, objectKey)).resolves.toBe(svg)
  }, 30000)

  it('analysis artifact を署名URLで保存してCSVを公開取得できる', async () => {
    const organizationId = '77777777-7777-4777-8777-777777777777'
    const analysisRunId = '66666666-6666-4666-8666-666666666666'
    const trajectoryId = '55555555-5555-4555-8555-555555555555'
    const csv = 'timestamp,x,y,speed_mps,is_stay\n0,1,2,,false\n'
    const heatmap = '{"schema_version":"1","trajectories":[]}\n'

    const [csvOutput, heatmapOutput] = await Promise.all([
      issueInternalAnalysisTrajectoryUploadUrl(organizationId, analysisRunId, trajectoryId),
      issueInternalAnalysisHeatmapUploadUrl(organizationId, analysisRunId),
    ])

    const [csvUploadResponse, heatmapUploadResponse] = await Promise.all([
      fetch(csvOutput.uploadUrl, { method: 'PUT', body: csv }),
      fetch(heatmapOutput.uploadUrl, { method: 'PUT', body: heatmap }),
    ])
    expect(csvUploadResponse.ok).toBe(true)
    expect(heatmapUploadResponse.ok).toBe(true)

    const csvDownload = await issueAnalysisTrajectoryCsvDownloadUrl(
      organizationId,
      analysisRunId,
      trajectoryId
    )
    const csvDownloadResponse = await fetch(csvDownload.downloadUrl)

    expect(csvDownloadResponse.ok).toBe(true)
    await expect(csvDownloadResponse.text()).resolves.toBe(csv)
    await expect(readObjectText(s3, heatmapOutput.objectKey)).resolves.toBe(heatmap)
  }, 30000)
})
