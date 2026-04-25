# DB Directory

このディレクトリは PostgreSQL スキーマ管理用である。

## 構成

- `migrations/`
  - `dbmate` で管理する migration SQL を置く
- `schema.sql`
  - `dbmate dump` で更新する最新スキーマのスナップショット

## 方針

- 正本は `migrations/*.sql`
- `schema.sql` は補助的なスナップショットとして扱う
- スキーマ変更は migration の追加で行う
- 適用済み migration は書き換えない
- 本番運用は rollback より roll-forward を基本とする

## 想定コマンド

`dbmate` は Docker Compose サービスとして実行する前提とする。

```sh
# local 環境を起動
make up ENV=local

# migration 状態確認
make db-status ENV=local

# migration 適用
make db-up ENV=local

# schema.sql を再ダンプ
make db-dump ENV=local

# 新しい migration を作成
make db-new ENV=local NAME=add_something
```

初回セットアップでは、`make up ENV=local` で `postgres` を起動してから `make db-up ENV=local` を実行する。

## 参照

https://github.com/amacneil/dbmate
