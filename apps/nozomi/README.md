# nozomi

## 開発コマンド

python versionは`3.14`
パッケージ管理は`uv`

## 実行コマンド

```sh
$ uv sync --all-groups
$ uv run dev
```

Sentry を使う場合は `SENTRY_DSN` を設定してください。必要に応じて `SENTRY_TRACES_SAMPLE_RATE` と `SENTRY_SEND_DEFAULT_PII` も使えます。

本番相当の起動
```sh
$ uv run start
```

`HOST` と `PORT` は環境変数で上書きできます。

```sh
$ HOST=0.0.0.0 PORT=8080 uv run start
```

## Pipeline実行APIの運用条件

- 入出力URLは`S3_INTERNAL_ENDPOINT`と`S3_PUBLIC_ENDPOINT`のoriginだけを許可します。追加originが必要な場合は`NOZOMI_ALLOWED_STORAGE_ORIGINS`へカンマ区切りで指定します。
- callback先は`NOZOMI_PIPELINE_CALLBACK_URL`（既定はKaedeの`/api/internal/pipeline-executions/callbacks`）に固定し、`KAEDE_API_SHARED_TOKEN`をBearer認証に使用します。リクエストの`callback.secret`は後段PRとの互換性のため受理しますが利用・保存せず、URLや秘密値は実行DBへ保存しません。
- 1入力の上限は既定で200 MiBです。`NOZOMI_MAX_INPUT_BYTES`で変更できます。
- 実行予約とcallback配信待ちは`NOZOMI_EXECUTION_DB_PATH`のSQLiteへ保存します。Docker Composeでは永続volumeを割り当て、callbackが未達の場合は再起動後も指数バックオフで再送します。再起動で中断した実行は`execution_interrupted`へ収束し、失敗callbackを再送します。複数ホストへ水平分割する場合は共有DBへ移行してください。

### uvのセットアップ

`uv venv`
`. .venv/bin/activate`
`uv sync --all-groups`
`uv run dev`

### uvでパッケージの追加

`uv add hoge`

## Git Hook

リポジトリルートで`lefthook`を使います。
`brew install lefthook`
初回だけルートで`lefthook install`を実行してください。

## コミット前に以下のコマンドを実行
## フォーマッター

```sh
uv run ruff format --check .
```

## リンター

```sh
uv run ruff check .
```

## リンター（自動修正）

```sh
uv run ruff check --fix .
```

## 型チェック

```sh
uv run mypy .
```
