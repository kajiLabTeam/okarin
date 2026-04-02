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

- `apps/kaede/**` を変更すると `Kaede CI` が実行されます（lint / format / typecheck）。
- `apps/nozomi/**` を変更すると `Nozomi CI` が実行されます（lint / format / typecheck / pytest）。

## Docker Compose 構成

- `compose.yml`: 共通定義（`kaede` / `nozomi`）
- `compose.local.yml`: ローカル用オーバーレイ（`postgres` / `minio` 追加、ローカルビルド）
- `compose.staging.yml`: staging 用オーバーレイ（環境変数ファイルを staging に切替）
- `compose.production.yml`: production 用オーバーレイ（環境変数ファイルを production に切替）

### ローカル起動（app + postgresql + object storage）

```sh
make local-up
```

停止:

```sh
make local-down
```

ローカル環境変数は `env/local/common.env` を使います。

### staging / production の環境変数

- `env/staging/common.env.example` と `env/production/common.env.example` をベースに実ファイルを作成してください。
- `ENV_FILE` で読み込む env ファイルを切り替えます。

### staging 手動デプロイ

```sh
make staging-up STAGING_ENV=./env/staging/common.env
```

### production 手動デプロイ

```sh
make production-up PRODUCTION_ENV=./env/production/common.env APP_TAG=v1.0.0
```

停止:

```sh
make production-down PRODUCTION_ENV=./env/production/common.env
```
