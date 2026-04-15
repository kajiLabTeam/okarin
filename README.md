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

- `compose.yml`: 共通定義（`kaede` / `nozomi`）
- `compose.local.yml`: ローカル用オーバーレイ（`postgres` / `seaweedfs` 追加、ローカルビルド）
- `compose.staging.yml`: staging 用オーバーレイ（環境変数ファイルを staging に切替）
- `compose.production.yml`: production 用オーバーレイ（環境変数ファイルを production に切替）

### ローカル起動（app + postgresql + object storage）

初回はテンプレートから実ファイルを作成:

```sh
cp deploy/env.local.example deploy/env.local
cp deploy/seaweedfs/s3.local.conf.example deploy/seaweedfs/s3.local.conf
```

```sh
docker compose -p okarin-local -f compose.yml -f compose.local.yml up -d --build --remove-orphans
```

停止:

```sh
docker compose -p okarin-local -f compose.yml -f compose.local.yml down
```

ローカル環境変数は `deploy/env.local` を使います。

`deploy/seaweedfs/s3.local.conf` で S3 認証情報（`accessKey` / `secretKey`）を管理しています。  
キーを変更する場合は `deploy/seaweedfs/s3.local.conf` と `deploy/env.local` の両方を同じ値に更新してください。
これら実ファイルは `.gitignore` で除外されるため、GitHubには上がりません。

### staging / production の環境変数

- `deploy/env.staging.example` と `deploy/env.production.example` をベースに実ファイルを作成してください。
- `deploy/seaweedfs/s3.staging.conf.example` と `deploy/seaweedfs/s3.production.conf.example` をベースに SeaweedFS の実ファイルを作成してください。
- 各環境の compose override が対応する `env_file` を持ちます。必要なら `ENV_FILE` で上書きできます。

### staging 手動デプロイ

```sh
ENV_FILE=./deploy/env.staging \
docker compose -p okarin-staging -f compose.yml -f compose.staging.yml up -d --build --remove-orphans
```

### production 手動デプロイ

```sh
ENV_FILE=./deploy/env.production \
docker compose -p okarin-production -f compose.yml -f compose.production.yml up -d --build --remove-orphans
```

停止:

```sh
ENV_FILE=./deploy/env.production \
docker compose -p okarin-production -f compose.yml -f compose.production.yml down
```
