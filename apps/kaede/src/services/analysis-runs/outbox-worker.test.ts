import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbExecutor } from '../executor.js'

vi.mock('../db/index.js', () => ({
  db: {} as DbExecutor,
}))

vi.mock('../../config/runtime.js', () => ({
  getAppRuntimeConfig: () => ({
    apiSharedToken: 'shared-token-123',
  }),
  getCallbackRuntimeConfig: () => ({
    baseUrl: 'http://kaede:8080',
  }),
}))

const mocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  findItemById: vi.fn(),
  updateItemState: vi.fn(),
  findRunById: vi.fn(),
  listItems: vi.fn(),
  updateRunStatus: vi.fn(),
  findTimedOutItems: vi.fn(),
  dispatchToNozomi: vi.fn(),
  issueAssetDownloadUrl: vi.fn(),
  issueItemResultUploadUrl: vi.fn(),
}))

vi.mock('./outbox-repository.js', () => ({
  claimPendingOutboxJobs: mocks.claimJobs,
  completeOutboxJob: mocks.completeJob,
  failOutboxJob: mocks.failJob,
}))

vi.mock('./positioning-analysis-callback-repository.js', () => ({
  findPositioningRunItemById: mocks.findItemById,
  updatePositioningRunItemState: mocks.updateItemState,
}))

vi.mock('./positioning-analysis-run-repository.js', () => ({
  findPositioningRunById: mocks.findRunById,
  listPositioningItems: mocks.listItems,
  updatePositioningRunStatus: mocks.updateRunStatus,
  findTimedOutPositioningRunItems: mocks.findTimedOutItems,
}))

vi.mock('../nozomi/nozomi-execution-client.js', () => ({
  dispatchExecutionToNozomi: mocks.dispatchToNozomi,
  FatalDispatchError: class FatalDispatchError extends Error {
    readonly retriable = false
  },
  RetriableDispatchError: class RetriableDispatchError extends Error {
    readonly retriable = true
  },
}))

vi.mock('../storage/presigned-url.js', () => ({
  issueInternalDataAssetDownloadUrl: mocks.issueAssetDownloadUrl,
  issueInternalAnalysisItemResultUploadUrl: mocks.issueItemResultUploadUrl,
}))

import { FatalDispatchError, RetriableDispatchError } from '../nozomi/nozomi-execution-client.js'
import type { OutboxJob } from './outbox-repository.js'
import {
  aggregatePositioningRunStatus,
  checkExecutionTimeouts,
  OutboxWorker,
  processOutboxJob,
} from './outbox-worker.js'

describe('outbox-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.issueAssetDownloadUrl.mockResolvedValue({ downloadUrl: 'http://s3/asset.csv' })
    mocks.issueItemResultUploadUrl.mockResolvedValue({ uploadUrl: 'http://s3/upload.json' })
  })

  describe('aggregatePositioningRunStatus', () => {
    it('全ての子アイテムがcompletedの場合、親Runをcompletedに更新する', async () => {
      mocks.listItems.mockResolvedValue([
        { id: 'item-1', status: 'completed' },
        { id: 'item-2', status: 'completed' },
      ])

      await aggregatePositioningRunStatus('run-1')

      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'completed', expect.anything())
    })

    it('全ての子アイテムがfailedの場合、親Runをfailedに更新する', async () => {
      mocks.listItems.mockResolvedValue([
        { id: 'item-1', status: 'failed' },
        { id: 'item-2', status: 'failed' },
      ])

      await aggregatePositioningRunStatus('run-1')

      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.anything())
    })

    it('一部がcompletedで一部がfailedの場合、親Runをpartially_completedに更新する', async () => {
      mocks.listItems.mockResolvedValue([
        { id: 'item-1', status: 'completed' },
        { id: 'item-2', status: 'failed' },
      ])

      await aggregatePositioningRunStatus('run-1')

      expect(mocks.updateRunStatus).toHaveBeenCalledWith(
        'run-1',
        'partially_completed',
        expect.anything()
      )
    })

    it('未完了（processing等）が含まれる場合、親Runをprocessingに更新する', async () => {
      mocks.listItems.mockResolvedValue([
        { id: 'item-1', status: 'completed' },
        { id: 'item-2', status: 'processing' },
      ])

      await aggregatePositioningRunStatus('run-1')

      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'processing', expect.anything())
    })
  })

  describe('checkExecutionTimeouts', () => {
    it('30分タイムアウトしたアイテムをfailedにし、親状態を集約する', async () => {
      mocks.findTimedOutItems.mockResolvedValue([
        { id: 'item-1', analysis_run_id: 'run-1', status: 'processing' },
      ])
      mocks.listItems.mockResolvedValue([{ id: 'item-1', status: 'failed' }])

      const count = await checkExecutionTimeouts(30)

      expect(count).toBe(1)
      expect(mocks.updateItemState).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          status: 'failed',
          error: {
            code: 'EXECUTION_TIMEOUT',
            message: 'Execution timed out after 30 minutes',
          },
        }),
        expect.anything()
      )
      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.anything())
    })
  })

  describe('processOutboxJob', () => {
    const mockJob: OutboxJob = {
      id: 'job-1',
      job_type: 'positioning_analysis_dispatch',
      payload: { analysis_run_item_id: 'item-1' },
      status: 'processing',
      attempts: 1,
      max_attempts: 3,
      run_at: new Date(),
      lease_token: 'token-1',
      leased_until: new Date(),
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    }

    const mockItem = {
      id: 'item-1',
      analysis_run_id: 'run-1',
      pipeline_id: 'pdr',
      pipeline_digest: 'digest-1',
      status: 'queued',
      parameters: { step_length_m: 0.7 },
      pipeline_snapshot: { bindings: [] },
      input_manifest: {
        imu: [
          {
            object_key: 'orgs/1/rec/1/raw/imu.csv',
            data_type: 'sensor_raw',
            schema_version: '1.0.0',
            format: 'csv',
            checksum_sha256: 'sha-imu',
          },
        ],
      },
    }

    const mockRun = {
      id: 'run-1',
      organization_id: 'org-1',
      status: 'accepted',
    }

    it('Nozomiへの配送が成功した場合、ジョブを完了にしステータスをprocessingにする', async () => {
      mocks.findItemById.mockResolvedValue(mockItem)
      mocks.findRunById.mockResolvedValue(mockRun)
      mocks.dispatchToNozomi.mockResolvedValue({
        analysis_run_item_id: 'item-1',
        status: 'processing',
      })

      await processOutboxJob(mockJob)

      expect(mocks.updateItemState).toHaveBeenCalledWith(
        'item-1',
        { status: 'processing' },
        expect.anything()
      )
      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'processing', expect.anything())
      expect(mocks.dispatchToNozomi).toHaveBeenCalledWith(
        expect.objectContaining({
          analysis_run_item_id: 'item-1',
          pipeline_id: 'pdr',
          snapshot_digest: 'digest-1',
          output_uri: 'http://s3/upload.json',
          callback: {
            url: 'http://kaede:8080/api/internal/pipeline-executions/callbacks',
            secret: 'shared-token-123',
          },
        })
      )
      expect(mocks.completeJob).toHaveBeenCalledWith('job-1', expect.anything())
    })

    it('決定的エラー（FatalDispatchError）の場合は再試行せず即座にfailedにする', async () => {
      mocks.findItemById.mockResolvedValue(mockItem)
      mocks.findRunById.mockResolvedValue(mockRun)
      mocks.dispatchToNozomi.mockRejectedValue(new FatalDispatchError('Pipeline not found'))
      mocks.listItems.mockResolvedValue([{ id: 'item-1', status: 'failed' }])

      await processOutboxJob(mockJob)

      expect(mocks.failJob).toHaveBeenCalledWith(
        'job-1',
        'Pipeline not found',
        null,
        expect.anything()
      )
      expect(mocks.updateItemState).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          status: 'failed',
          error: {
            code: 'DISPATCH_REJECTED',
            message: 'Pipeline not found',
          },
        }),
        expect.anything()
      )
      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.anything())
    })

    it('回復可能エラー（RetriableDispatchError）で試行上限未満の場合はretryAtを設定して再試行待機にする', async () => {
      mocks.findItemById.mockResolvedValue(mockItem)
      mocks.findRunById.mockResolvedValue(mockRun)
      mocks.dispatchToNozomi.mockRejectedValue(
        new RetriableDispatchError('503 Service Unavailable')
      )

      await processOutboxJob(mockJob)

      expect(mocks.failJob).toHaveBeenCalledWith(
        'job-1',
        '503 Service Unavailable',
        expect.any(Date),
        expect.anything()
      )
      expect(mocks.updateItemState).not.toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ status: 'failed' }),
        expect.anything()
      )
    })

    it('回復可能エラーで試行回数上限（max_attempts）に達した場合はfailedとして集約する', async () => {
      const exhaustedJob: OutboxJob = {
        ...mockJob,
        attempts: 3,
        max_attempts: 3,
      }
      mocks.findItemById.mockResolvedValue(mockItem)
      mocks.findRunById.mockResolvedValue(mockRun)
      mocks.dispatchToNozomi.mockRejectedValue(
        new RetriableDispatchError('503 Service Unavailable')
      )
      mocks.listItems.mockResolvedValue([{ id: 'item-1', status: 'failed' }])

      await processOutboxJob(exhaustedJob)

      expect(mocks.failJob).toHaveBeenCalledWith(
        'job-1',
        '503 Service Unavailable',
        null,
        expect.anything()
      )
      expect(mocks.updateItemState).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          status: 'failed',
          error: {
            code: 'DISPATCH_RETRY_EXHAUSTED',
            message: '503 Service Unavailable',
          },
        }),
        expect.anything()
      )
      expect(mocks.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.anything())
    })
  })

  describe('OutboxWorker.tick', () => {
    it('ジョブを取得して処理し、タイムアウトチェックを実行する', async () => {
      mocks.claimJobs.mockResolvedValue([])
      mocks.findTimedOutItems.mockResolvedValue([])

      const worker = new OutboxWorker()
      const result = await worker.tick('test-token')

      expect(result).toEqual({ claimedCount: 0, timedOutCount: 0 })
      expect(mocks.claimJobs).toHaveBeenCalledWith(
        expect.objectContaining({ leaseToken: 'test-token' }),
        expect.anything()
      )
    })
  })
})
