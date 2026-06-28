[![](/image/okarin.webp)](https://github.com/kajiLabTeam/okarin)

<p align="right">
© 2026 kanakanho
</p>

# 全体構成

- **okarin**
    - issueを管理するリポジトリ。issueと各リポジトリのPRを紐づけてアップデートを管理する
- [**kaede**](https://github.com/kajiLabTeam/kaede)
    - 今回のシステムの基幹リポジトリでモバイルからのデータを取得しPythonサーバーやDBとの接続などを行う
- [**nozomi**](https://github.com/kajiLabTeam/nozomi)
    - Pythonパッケージを用いてセンサデータを処理するためのサーバー
- [**rikka**](https://github.com/kajiLabTeam/rikka)
    - ロジックに全集中したパッケージリポジトリ

## ブランチ

`999/feat-add-something`
`イシュー番号/プレフィックス-ブランチ詳細`

## ローカル実行（最短）

### kaede

```sh
cd apps/kaede
pnpm install
pnpm run dev
```

### nozomi

```sh
cd apps/nozomi
uv sync --all-groups
uv run dev
```

`HOST` と `PORT` は環境変数で上書きできます。

```sh
HOST=0.0.0.0 PORT=8080 uv run start
```

## コミット前チェック

このリポジトリはルートで `lefthook` を使います。

```sh
lefthook install
```

`git commit` 時に、`kaede` と `nozomi` のチェックが両方実行されます。

`kaede` を手動で確認する場合:

```sh
cd apps/kaede
pnpm lint
pnpm exec prettier --check .
pnpm exec tsc --noEmit
pnpm build
```

`nozomi` を手動で確認する場合:

```sh
cd apps/nozomi
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest
```

## CI 対応

- `apps/kaede/**` を変更すると `Kaede CI` が実行されます（lint / format / typecheck / build / docker image build）。
- `apps/nozomi/**` を変更すると `Nozomi CI` が実行されます（lint / format / typecheck / pytest / docker image build）。

## Docker Compose 構成

- `docker/compose.yml`: 共通定義（`kaede` / `nozomi`）
- `docker/compose.local.yml`: ローカル用オーバーレイ（`postgres` / `seaweedfs` 追加、ローカルビルド）
- `docker/compose.test.yml`: test 用オーバーレイ（ローカルに近い構成で test 用 env を使用）
- `docker/compose.staging.yml`: staging 用オーバーレイ（環境変数ファイルを staging に切替）
- `docker/compose.production.yml`: production 用オーバーレイ（環境変数ファイルを production に切替）

### ローカル起動（app + postgresql + object storage）

初回はテンプレートから実ファイルを作成:

```sh
cp deploy/env/local.env.example deploy/env/local.env
cp deploy/apps/kaede.local.env.example deploy/apps/kaede.local.env
cp deploy/apps/storage-bootstrap.local.env.example deploy/apps/storage-bootstrap.local.env
cp deploy/seaweedfs/s3.local.conf.example deploy/seaweedfs/s3.local.conf
```

```sh
docker compose -p okarin-local -f docker/compose.yml -f docker/compose.local.yml up -d --build --remove-orphans
```

停止:

```sh
docker compose -p okarin-local -f docker/compose.yml -f docker/compose.local.yml down
```

ローカルの共通環境変数は `deploy/env/local.env` を使います。
`kaede` と `nozomi` で共有する Sentry 設定は `deploy/env/local.env`、`kaede` 用の S3 設定は `deploy/apps/kaede.local.env`、`storage-bootstrap` 用の認証情報は `deploy/apps/storage-bootstrap.local.env` を使います。
`FRONTEND_ORIGIN` は CORS 許可 origin として使います。通常は dashboard の origin を設定してください。

`deploy/seaweedfs/s3.local.conf` で S3 認証情報（`accessKey` / `secretKey`）を管理しています。
キーを変更する場合は `deploy/seaweedfs/s3.local.conf` と `deploy/apps/kaede.local.env` / `deploy/apps/storage-bootstrap.local.env` の対応する値を同じに更新してください。
これら実ファイルは `.gitignore` で除外されるため、GitHubには上がりません。

### test / staging / production の環境変数

- `deploy/env/test.env.example` をベースに test 用の共通 env 実ファイルを作成してください。
- `deploy/apps/kaede.test.env.example` をベースに test 用の `kaede` env を作成してください。
- `deploy/apps/storage-bootstrap.test.env.example` をベースに test 用の `storage-bootstrap` env を作成してください。
- `deploy/seaweedfs/s3.test.conf.example` をベースに test 用の SeaweedFS 実ファイルを作成してください。
- `deploy/env/staging.env.example` と `deploy/env/production.env.example` をベースに共通 env の実ファイルを作成してください。
- `deploy/apps/kaede.staging.env.example` と `deploy/apps/kaede.production.env.example` をベースに `kaede` 用 env を作成してください。
- `deploy/apps/storage-bootstrap.staging.env.example` と `deploy/apps/storage-bootstrap.production.env.example` をベースに `storage-bootstrap` 用 env を作成してください。
- `deploy/seaweedfs/s3.staging.conf.example` と `deploy/seaweedfs/s3.production.conf.example` をベースに SeaweedFS の実ファイルを作成してください。
- 各環境の compose override が対応する `env_file` を持ちます。必要なら `ENV_FILE` で上書きできます。

### kaede API shared token 認証

`kaede` には `KAEDE_API_SHARED_TOKEN` を使った認証 middleware があります。
この値が設定されている環境では、`/api/*` へのリクエストに以下の header が必要です。

```http
Authorization: Bearer <KAEDE_API_SHARED_TOKEN>
```

token は環境ごとに別の値を使ってください。
同じ token を test / staging / production で使い回すと、test 用に配った token で production API も叩けるためです。

生成例:

```sh
openssl rand -hex 32
```

`deploy/env/*.env.example` には `KAEDE_API_SHARED_TOKEN` の項目があります。
実際の `deploy/env/test.env` / `deploy/env/staging.env` / `deploy/env/production.env` では、placeholder ではなく生成した値に置き換えてください。

local では `KAEDE_API_SHARED_TOKEN=` のように空のままにすると middleware は無効になります。
スマホアプリから test 環境などを叩く場合は、API base URL と同じ環境の token を使ってください。

例:

```sh
curl -H "Authorization: Bearer ${KAEDE_API_SHARED_TOKEN}" \
  http://<kaede-host>:8080/api/pedestrians
```

`/api/trajectories/callback` は Nozomi からの callback 用 endpoint で、別途 callback token を検証するため shared token 認証の対象外です。
また、`GET /` の health check は shared token なしでアクセスできます。

### test 手動デプロイ

手動で `docker compose` を直接実行する場合は、runtime metadata 用ファイルを先に作成してください。

```sh
mkdir -p /var/tmp/okarin/runtime
touch /var/tmp/okarin/runtime/test.env
```

```sh
ENV_FILE=./deploy/env/test.env \
DEPLOY_META_FILE=/var/tmp/okarin/runtime/test.env \
docker compose -p okarin-test -f docker/compose.yml -f docker/compose.test.yml up -d --build --remove-orphans
```

停止:

```sh
ENV_FILE=./deploy/env/test.env \
DEPLOY_META_FILE=/var/tmp/okarin/runtime/test.env \
docker compose -p okarin-test -f docker/compose.yml -f docker/compose.test.yml down
```

### staging 手動デプロイ

```sh
mkdir -p /var/tmp/okarin/runtime
touch /var/tmp/okarin/runtime/staging.env
```

```sh
ENV_FILE=./deploy/env/staging.env \
DEPLOY_META_FILE=/var/tmp/okarin/runtime/staging.env \
docker compose -p okarin-staging -f docker/compose.yml -f docker/compose.staging.yml up -d --build --remove-orphans
```

### production 手動デプロイ

```sh
mkdir -p /var/tmp/okarin/runtime
touch /var/tmp/okarin/runtime/production.env
```

```sh
ENV_FILE=./deploy/env/production.env \
DEPLOY_META_FILE=/var/tmp/okarin/runtime/production.env \
docker compose -p okarin-production -f docker/compose.yml -f docker/compose.production.yml up -d --build --remove-orphans
```

停止:

```sh
ENV_FILE=./deploy/env/production.env \
DEPLOY_META_FILE=/var/tmp/okarin/runtime/production.env \
docker compose -p okarin-production -f docker/compose.yml -f docker/compose.production.yml down
```

## SSH デプロイスクリプト

環境ごとにデプロイスクリプトを分ける想定です。

```sh
./deploy/scripts/deploy-test.sh [release_ref]
./deploy/scripts/deploy-staging.sh [release_ref]
./deploy/scripts/deploy-production.sh [release_ref]
```

- 各スクリプト内で対象環境を固定しています
- 各スクリプトは `docker compose` を直接実行します
- 既定では `sudo docker compose` を使います。不要な環境では `DOCKER_COMPOSE_BIN='docker compose'` で上書きしてください
- `docker inspect` も既定では `sudo /usr/bin/docker` を使います。不要な環境では `DOCKER_BIN='docker'` で上書きしてください
- `postgres` と `seaweedfs` だけを pull し、`kaede` と `nozomi` は `up --build` で更新します
- 各スクリプトは `postgres` / `seaweedfs` 起動後に `dbmate up` と `storage-bootstrap` を実行してからアプリを起動します
- deploy 成功時の revision は `/var/tmp/okarin/revisions/*.last_successful` に保存します
- deploy 成功時の runtime metadata は `/var/tmp/okarin/runtime/*.env` に保存します
- `deploy/scripts/*.sh` 経由のデプロイでは runtime metadata ファイルも自動で作成します
- 外部公開している `kaede` では `GET /` の応答に `deploy_ref` / `revision` / `deployed_at` が含まれるため、外から現在のデプロイ内容を確認できます

例:

```sh
curl http://<kaede-host>:8080/
```
- 引数が空なら `SSH_ORIGINAL_COMMAND` を使います
- それも空なら `main` を deploy 対象にします

### rollback 手順

直前に成功した revision は以下で確認できます。

```sh
cat /var/tmp/okarin/revisions/staging.last_successful
cat /var/tmp/okarin/revisions/production.last_successful
```

手動 rollback は、保存済みの `REVISION` をそのまま deploy スクリプトへ渡して実行します。deploy スクリプトは branch / tag / commit SHA のいずれも受け付けます。

```sh
REVISION=$(sed -n 's/^REVISION=//p' /var/tmp/okarin/revisions/staging.last_successful)
./deploy/scripts/deploy-staging.sh "$REVISION"
```

```sh
REVISION=$(sed -n 's/^REVISION=//p' /var/tmp/okarin/revisions/production.last_successful)
./deploy/scripts/deploy-production.sh "$REVISION"
```

注意:

- DB migration を含むため、rollback 対象 revision が現在の DB スキーマと互換かを確認してください
- deploy 失敗時は `docker compose ps` と各サービスログを確認してから rollback を判断してください
