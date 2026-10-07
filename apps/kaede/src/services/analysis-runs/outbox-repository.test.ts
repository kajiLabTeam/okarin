import type { DatabaseConnection, QueryResult } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DB } from '../db/index.js'
import type { DbExecutor } from '../executor.js'

vi.mock('../db/index.js', () => ({
  db: {},
}))

import {
  claimPendingOutboxJobs,
  completeOutboxJob,
  failOutboxJob,
  findOutboxJobById,
  insertOutboxJobs,
} from './outbox-repository.js'

describe('outbox-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('insertOutboxJobs', () => {
    it('空配列が渡されたときはクエリを発行せず空配列を返す', async () => {
      const mockExecutor = {
        insertInto: vi.fn(),
      }
      const result = await insertOutboxJobs([], mockExecutor as unknown as DbExecutor)
      expect(result).toEqual([])
      expect(mockExecutor.insertInto).not.toHaveBeenCalled()
    })

    it('ジョブを正しくJSONシリアライズして挿入する', async () => {
      const valuesFn = vi.fn().mockReturnValue({
        returningAll: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'pending' }]),
        }),
      })
      const mockExecutor = {
        insertInto: vi.fn().mockReturnValue({ values: valuesFn }),
      }

      const result = await insertOutboxJobs(
        [
          {
            job_type: 'positioning_analysis_dispatch',
            payload: { analysis_run_item_id: 'item-1' },
            status: 'pending',
            attempts: 0,
            max_attempts: 3,
            run_at: new Date('2026-10-07T00:00:00Z'),
            lease_token: null,
            leased_until: null,
            last_error: null,
          },
        ],
        mockExecutor as unknown as DbExecutor
      )

      expect(result).toEqual([{ id: 'job-1', status: 'pending' }])
      expect(mockExecutor.insertInto).toHaveBeenCalledWith('outbox_jobs')
      expect(valuesFn).toHaveBeenCalledWith([
        expect.objectContaining({
          job_type: 'positioning_analysis_dispatch',
          payload: '{"analysis_run_item_id":"item-1"}',
          status: 'pending',
        }),
      ])
    })
  })

  describe('claimPendingOutboxJobs', () => {
    it('SQLテンプレートを実行して取得行を返す', async () => {
      const { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } =
        await import('kysely')
      const executeQuerySpy = vi.fn().mockResolvedValue({
        rows: [{ id: 'job-1', status: 'processing', lease_token: 'token-1' }],
      })
      const mockConnection: DatabaseConnection = {
        executeQuery: <R>(): Promise<QueryResult<R>> =>
          Promise.resolve(executeQuerySpy() as Promise<QueryResult<R>>),
        streamQuery: vi.fn(),
      }
      class TestDriver extends DummyDriver {
        override acquireConnection(): Promise<DatabaseConnection> {
          return Promise.resolve(mockConnection)
        }
      }
      const testDb = new Kysely<DB>({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => new TestDriver(),
          createIntrospector: (dbInstance) => new PostgresIntrospector(dbInstance),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
      })

      const result = await claimPendingOutboxJobs(
        { limit: 5, leaseDurationMs: 60000, leaseToken: 'token-1' },
        testDb
      )

      expect(result).toEqual([{ id: 'job-1', status: 'processing', lease_token: 'token-1' }])
      expect(executeQuerySpy).toHaveBeenCalledOnce()
    })
  })

  describe('completeOutboxJob', () => {
    it('ジョブをcompletedに更新しリースを解除する', async () => {
      const executeFn = vi.fn().mockResolvedValue([])
      const whereFn = vi.fn().mockReturnValue({ execute: executeFn })
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      const mockExecutor = {
        updateTable: vi.fn().mockReturnValue({ set: setFn }),
      }

      await completeOutboxJob('job-1', mockExecutor as unknown as DbExecutor)

      expect(mockExecutor.updateTable).toHaveBeenCalledWith('outbox_jobs')
      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          lease_token: null,
          leased_until: null,
        })
      )
      expect(whereFn).toHaveBeenCalledWith('id', '=', 'job-1')
      expect(executeFn).toHaveBeenCalledOnce()
    })
  })

  describe('failOutboxJob', () => {
    it('retryAtが指定されている場合はpendingにしてrun_atを更新する', async () => {
      const executeFn = vi.fn().mockResolvedValue([])
      const whereFn = vi.fn().mockReturnValue({ execute: executeFn })
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      const mockExecutor = {
        updateTable: vi.fn().mockReturnValue({ set: setFn }),
      }

      const retryDate = new Date('2026-10-07T01:00:00Z')
      await failOutboxJob(
        'job-1',
        'network timeout',
        retryDate,
        mockExecutor as unknown as DbExecutor
      )

      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          run_at: retryDate,
          lease_token: null,
          leased_until: null,
          last_error: 'network timeout',
        })
      )
      expect(whereFn).toHaveBeenCalledWith('id', '=', 'job-1')
      expect(executeFn).toHaveBeenCalledOnce()
    })

    it('retryAtがない場合はfailedに更新する', async () => {
      const executeFn = vi.fn().mockResolvedValue([])
      const whereFn = vi.fn().mockReturnValue({ execute: executeFn })
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      const mockExecutor = {
        updateTable: vi.fn().mockReturnValue({ set: setFn }),
      }

      await failOutboxJob(
        'job-1',
        'fatal validation error',
        null,
        mockExecutor as unknown as DbExecutor
      )

      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          lease_token: null,
          leased_until: null,
          last_error: 'fatal validation error',
        })
      )
      expect(whereFn).toHaveBeenCalledWith('id', '=', 'job-1')
      expect(executeFn).toHaveBeenCalledOnce()
    })
  })

  describe('findOutboxJobById', () => {
    it('指定したIDのジョブを取得する', async () => {
      const executeTakeFirstFn = vi.fn().mockResolvedValue({ id: 'job-1' })
      const whereFn = vi.fn().mockReturnValue({ executeTakeFirst: executeTakeFirstFn })
      const selectAllFn = vi.fn().mockReturnValue({ where: whereFn })
      const mockExecutor = {
        selectFrom: vi.fn().mockReturnValue({ selectAll: selectAllFn }),
      }

      const result = await findOutboxJobById('job-1', mockExecutor as unknown as DbExecutor)

      expect(result).toEqual({ id: 'job-1' })
      expect(mockExecutor.selectFrom).toHaveBeenCalledWith('outbox_jobs')
      expect(whereFn).toHaveBeenCalledWith('id', '=', 'job-1')
    })
  })
})
