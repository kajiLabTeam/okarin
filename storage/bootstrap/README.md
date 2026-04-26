# Storage Bootstrap

このディレクトリは、オブジェクトストレージ初期化用の補助スクリプトを置く場所である。

現在は bucket の存在確認と作成だけを扱う。

## スクリプト

- `init_bucket.sh`
  - `S3_BUCKET` の存在確認を行い、なければ作成する

## 必要な環境変数

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

## 実行例

Docker で `aws-cli` を使って実行する想定:

```sh
docker run --rm \
  --network okarin-local_default \
  --env-file ./deploy/env.local \
  -v "$PWD/storage/bootstrap:/work:ro" \
  -w /work \
  amazon/aws-cli:2 \
  sh ./init_bucket.sh
```
