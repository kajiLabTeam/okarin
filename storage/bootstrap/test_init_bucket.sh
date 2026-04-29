#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
TARGET_SCRIPT="$SCRIPT_DIR/init_bucket.sh"
TMPDIR_ROOT=$(mktemp -d)
trap 'rm -rf "$TMPDIR_ROOT"' EXIT INT TERM

TESTS_RUN=0

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo "ok: $1"
}

assert_contains() {
  needle=$1
  file=$2
  if ! grep -F -- "$needle" "$file" >/dev/null 2>&1; then
    echo "expected to find: $needle" >&2
    echo "--- file: $file ---" >&2
    cat "$file" >&2
    echo "-------------------" >&2
    fail "assert_contains"
  fi
}

write_fake_aws() {
  bin_dir=$1
  log_file=$2
  head_status=$3
  cat >"$bin_dir/aws" <<EOF
#!/bin/sh
set -eu
printf '%s\n' "\$*" >>"$log_file"
if [ "\$1" = "--endpoint-url" ]; then
  shift 2
fi
if [ "\$1" = "s3api" ] && [ "\$2" = "head-bucket" ]; then
  exit $head_status
fi
if [ "\$1" = "s3api" ] && [ "\$2" = "create-bucket" ]; then
  exit 0
fi
exit 0
EOF
  chmod +x "$bin_dir/aws"
}

test_missing_required_env() {
  work_dir="$TMPDIR_ROOT/missing-env"
  mkdir -p "$work_dir"
  stdout_file="$work_dir/stdout"
  stderr_file="$work_dir/stderr"

  if env -i PATH="$PATH" sh "$TARGET_SCRIPT" >"$stdout_file" 2>"$stderr_file"; then
    fail "missing env should fail"
  fi

  assert_contains "missing required environment variable: S3_ENDPOINT" "$stderr_file"
  pass "missing required env"
}

test_existing_bucket() {
  work_dir="$TMPDIR_ROOT/existing-bucket"
  bin_dir="$work_dir/bin"
  mkdir -p "$bin_dir"
  stdout_file="$work_dir/stdout"
  stderr_file="$work_dir/stderr"
  aws_log="$work_dir/aws.log"
  : >"$aws_log"

  write_fake_aws "$bin_dir" "$aws_log" 0

  env \
    PATH="$bin_dir:$PATH" \
    S3_ENDPOINT="http://seaweedfs:8333" \
    S3_REGION="ap-northeast-1" \
    S3_BUCKET="okarin-local" \
    S3_ACCESS_KEY_ID="storage-bootstrap-local" \
    S3_SECRET_ACCESS_KEY="secret" \
    sh "$TARGET_SCRIPT" >"$stdout_file" 2>"$stderr_file"

  assert_contains "bucket already exists: okarin-local" "$stdout_file"
  assert_contains "--endpoint-url http://seaweedfs:8333 s3api head-bucket --bucket okarin-local" "$aws_log"
  if grep -F -- "create-bucket" "$aws_log" >/dev/null 2>&1; then
    fail "create-bucket should not be called when bucket exists"
  fi
  pass "existing bucket"
}

test_create_bucket_when_missing() {
  work_dir="$TMPDIR_ROOT/create-bucket"
  bin_dir="$work_dir/bin"
  mkdir -p "$bin_dir"
  stdout_file="$work_dir/stdout"
  stderr_file="$work_dir/stderr"
  aws_log="$work_dir/aws.log"
  : >"$aws_log"

  write_fake_aws "$bin_dir" "$aws_log" 1

  env \
    PATH="$bin_dir:$PATH" \
    S3_ENDPOINT="http://seaweedfs:8333" \
    S3_REGION="ap-northeast-1" \
    S3_BUCKET="okarin-local" \
    S3_ACCESS_KEY_ID="storage-bootstrap-local" \
    S3_SECRET_ACCESS_KEY="secret" \
    sh "$TARGET_SCRIPT" >"$stdout_file" 2>"$stderr_file"

  assert_contains "creating bucket: okarin-local" "$stdout_file"
  assert_contains "bucket created: okarin-local" "$stdout_file"
  assert_contains "--endpoint-url http://seaweedfs:8333 s3api head-bucket --bucket okarin-local" "$aws_log"
  assert_contains "--endpoint-url http://seaweedfs:8333 s3api create-bucket --bucket okarin-local" "$aws_log"
  pass "create bucket when missing"
}

test_missing_required_env
test_existing_bucket
test_create_bucket_when_missing

echo "PASS: $TESTS_RUN tests"
