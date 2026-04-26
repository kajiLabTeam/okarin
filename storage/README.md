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
