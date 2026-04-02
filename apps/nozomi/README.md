# nozomi

## 開発コマンド

python versionは`3.14`
パッケージ管理は`uv`

## 実行コマンド

```sh
$ uv sync --all-groups
$ uv run dev
```

本番相当の起動
```sh
$ uv run start
```

`HOST` と `PORT` は環境変数で上書きできます。

```sh
$ HOST=0.0.0.0 PORT=8080 uv run start
```

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
