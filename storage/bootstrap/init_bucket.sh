#!/bin/sh

set -eu

required_envs="
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
"

for env_name in $required_envs; do
  eval "env_value=\${$env_name:-}"
  if [ -z "$env_value" ]; then
    echo "missing required environment variable: $env_name" >&2
    exit 1
  fi
done

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"
export AWS_EC2_METADATA_DISABLED=true

aws_cmd() {
  aws --endpoint-url "$S3_ENDPOINT" "$@"
}

if aws_cmd s3api head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1; then
  echo "bucket already exists: $S3_BUCKET"
  exit 0
fi

echo "creating bucket: $S3_BUCKET"
aws_cmd s3api create-bucket --bucket "$S3_BUCKET" >/dev/null
echo "bucket created: $S3_BUCKET"
