import type { Kysely, Transaction } from 'kysely'
import type { DB } from './db/index.js'

// 通常のクエリ実行とトランザクション内でのクエリ実行の両方に対応するための型定義
export type DbExecutor = Kysely<DB> | Transaction<DB>
