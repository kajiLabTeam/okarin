# nozomi

# 開発コマンド

python versionは`3.14`
パッケージ管理は`uv`

## 実行コマンド
```sh
$ uv run main.py
```

python fastapiの実行
```sh
$ uv run fastapi dev main.py
```

### uvのセットアップ

`uv venv`
`. .venv/bin/activate`
`uv sync`
`uv run main.py`

### uvでパッケージの追加

`uv add hoge`

# コミット前に以下のコマンドをする
## フォーマッター

```sh
$ uv run ruff format
```

## リンター

```sh
uv run ruff check
```

## リンター（自動修正）

```sh
uv run ruff check --fix
```

## 型チェック

```sh
uv run mypy src/
```
