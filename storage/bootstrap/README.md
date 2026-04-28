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
  --env-file ./deploy/env.local.storage-bootstrap \
  -v "$PWD/storage/bootstrap:/work:ro" \
  -w /work \
  --entrypoint sh \
  amazon/aws-cli:2.34.38 \
  ./init_bucket.sh
```

`deploy/env.local` には共通の S3 設定を置き、
`deploy/env.local.storage-bootstrap` には bootstrap 専用の資格情報を置く。

## SecretAccessKeyの作成

`openssl rand -hex 32`
