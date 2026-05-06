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
