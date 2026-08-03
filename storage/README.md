# Storage Directory

このディレクトリはオブジェクトストレージの保存規約管理用である。

## 構成

- `object_schema.md`
  - SeaweedFS / S3 上でどのキーに何を保存するかを定義する
- `bootstrap/`
  - 将来、bucket 初期化や補助スクリプトを置くための領域

## 方針

- 実行設定ファイルは `deploy/seaweedfs/` に置く
- 保存規約の正本はこのディレクトリで管理する
- 設計説明用の文書は `docs/db/` に置く
- raw / result の保存先は DB に持たず、ID と規約から導出する

## 想定用途

- `kaede` が署名付き URL を発行する際の保存先規約参照
- `complete-upload` の存在確認対象の整理
- `nozomi` が利用する raw / result URL 生成規約の共有

## 想定コマンド

`storage-bootstrap` は Docker Compose サービスとして実行する前提とする。

```sh
# local 環境を起動
make up ENV=local

# bucket の存在確認と初期化
make storage-init ENV=local
```

## テスト

`init_bucket.sh` の分岐はローカルでテストできる。

```sh
# bucket 初期化スクリプトのテスト
make storage-test
```

確認内容:

- 必須環境変数が不足した場合に失敗すること
- bucket が既に存在する場合は作成しないこと
- bucket が存在しない場合は作成すること

## Filer UI

ローカル環境では SeaweedFS の Filer UI をブラウザで開ける。

```sh
# local 環境を起動
make up ENV=local
```

起動後に以下へアクセスする:

`http://localhost:8888`

補足:

- `8333` は S3 API のため、ブラウザで直接開くと `Access Denied` になる
- `8888` は Filer UI 用ポート
- `9333` は SeaweedFS の管理情報確認用ポート

## 既存floor mapの画像寸法を移行する

`floors.map_width_px`と`map_height_px`が未設定の環境では、Kaedeコンテナ内で次を実行する。
`backfill`はobject storage上のPNG IHDRまたはSVG viewBoxから寸法を取得し、未設定行だけを更新する。

```sh
node dist/cli/floor-map-dimension-backfill.js backfill
node dist/cli/floor-map-dimension-backfill.js verify
```

開発環境ではmise経由で実行できる。

```sh
mise exec -- pnpm floor-map-dimension-backfill -- backfill
mise exec -- pnpm floor-map-dimension-backfill -- verify
```

特定floorだけを再実行する場合は`--floor-id`を付ける。

```sh
node dist/cli/floor-map-dimension-backfill.js backfill --floor-id <UUID>
```

各floorの結果と最後の集計がJSON Linesで標準出力へ出る。`failed`が1件以上ある場合は終了コード1に
なるため、objectの存在、拡張子、PNGのIHDRまたはSVGの`viewBox="0 0 width height"`、DBに保存済みの
寸法との不一致を確認する。`backfill`は保存済み寸法を上書きせず、再実行できる。移行後に`verify`を
実行し、最後の集計で`failed: 0`であることを確認する。
