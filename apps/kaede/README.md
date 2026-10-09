# kaede

## 実行

以下のバージョンでしか動きません。`package.json`で指定しているので確認してください。

```
node.js : >= 22.13.0
pnpm : >= 10.0.0
```

```txt
pnpm install
pnpm run dev
```

## Legacy recordings の data-assets 移行

旧 `recordings.raw/<organization_id>/<recording_id>/` オブジェクトを、既存の raw オブジェクトを変更せずに `data_assets` と関連テーブルへ登録する one-shot 移行です。`acce` と `gyro` の CSV のみが対象で、欠損・不正なオブジェクトと catalog 非対応 target は JSON の `missing_items` / `items` に一覧化されます。

まず dry-run で確認します（既定値も dry-run です）。dry-run は DB/S3 の読み取りだけを行い、移行行・完了マーカーを書き込みません。

```txt
pnpm migrate:legacy-recordings --dry-run
```

内容を確認して実行する場合だけ `--execute` を明示します。

```txt
pnpm migrate:legacy-recordings --execute
```

実行は recording/data type ごとのトランザクションで行われます。既に `recording_data_assets` の関連がある項目は `already_migrated` となり、再実行しても追加 asset は作成されません。全項目が成功または既移行になった場合だけ `application_data_migrations` に完了マーカーが記録されます。失敗・欠損がある場合は exit code 1 なので、JSON の `missing_items` を確認して問題解消後に再実行してください。

Sentry を使う場合は `SENTRY_DSN` を設定してください。必要に応じて `SENTRY_TRACES_SAMPLE_RATE` と `SENTRY_SEND_DEFAULT_PII` も使えます。

## Database

`kaede` の DB アクセスは `Kysely` を使い、型定義は実 DB スキーマから codegen する。

スキーマ変更時の基本手順:

```txt
make up ENV=local
make db-up ENV=local
pnpm run db:codegen
```

- migration の正本はリポジトリルートの `db/migrations/*.sql`
- `pnpm run db:codegen` は local PostgreSQL に接続して `src/services/db/generated.ts` を更新する
- migration 追加後や `db/schema.sql` 更新後は codegen もあわせて実行する

## Linter,Formatter

Linterの実行:`pnpm lint`
Linterの実行時にFixableな箇所を直す:`pnpm lint:fix`
Formatterを実行:`pnpm format`

## Git Hook

リポジトリルートで`lefthook`を使います。

`lefthook`をインストールしていない場合はインストールをしてください。

brewの場合:`brew install lefthook`

初回だけルートで`lefthook install`を実行してください。

コミット前の確認を手動で行う場合:

```txt
pnpm lint
pnpm exec prettier --check .
pnpm exec tsc --noEmit
```
