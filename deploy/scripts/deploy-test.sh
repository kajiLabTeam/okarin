#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
PROJECT_NAME=okarin-test
COMPOSE_FILE=compose.test.yml
REVISION_DIR=/var/tmp/okarin/revisions
REVISION_FILE="$REVISION_DIR/test.last_successful"
DOCKER_COMPOSE_BIN=${DOCKER_COMPOSE_BIN:-sudo docker compose}

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

compose_cmd() {
  ENV_FILE="$ENV_FILE" \
  KAEDE_ENV_FILE="$KAEDE_ENV_FILE" \
  STORAGE_BOOTSTRAP_ENV_FILE="$STORAGE_BOOTSTRAP_ENV_FILE" \
  sh -c 'exec "$@"' _ $DOCKER_COMPOSE_BIN \
    --env-file "$ENV_FILE" \
    -p "$PROJECT_NAME" \
    -f compose.yml \
    -f "$COMPOSE_FILE" \
    "$@"
}

resolve_ref() {
  if [ "$#" -gt 0 ] && [ -n "$1" ]; then
    printf '%s\n' "$1"
    return
  fi

  if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
    printf '%s\n' "$SSH_ORIGINAL_COMMAND"
    return
  fi

  printf 'main\n'
}

require_file() {
  if [ ! -f "$1" ]; then
    fail "required file not found: $1"
  fi
}

ensure_dir() {
  dir=$1
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
  fi
}

require_clean_tree() {
  if ! git diff --quiet --ignore-submodules HEAD --; then
    fail "tracked working tree has local changes"
  fi

  if ! git diff --cached --quiet --ignore-submodules HEAD --; then
    fail "index has staged changes"
  fi
}

dump_compose_state() {
  compose_cmd ps || true

  compose_cmd logs --tail 100 kaede nozomi postgres seaweedfs || true
}

wait_for_healthy() {
  service=$1
  attempts=${2:-60}
  interval=${3:-2}

  container_id=$(
    compose_cmd ps -q "$service"
  )

  [ -n "$container_id" ] || fail "container not found for service: $service"

  i=0
  while [ "$i" -lt "$attempts" ]; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      return 0
    fi

    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
      dump_compose_state
      fail "service $service entered bad state: $status"
    fi

    sleep "$interval"
    i=$((i + 1))
  done

  dump_compose_state
  fail "timed out waiting for service $service to become healthy"
}

TARGET_REF=$(resolve_ref "${1:-}")
ENV_FILE="$REPO_DIR/deploy/env/test.env"
KAEDE_ENV_FILE="$REPO_DIR/deploy/apps/kaede.test.env"
STORAGE_BOOTSTRAP_ENV_FILE="$REPO_DIR/deploy/apps/storage-bootstrap.test.env"
SEAWEEDFS_CONFIG_FILE="$REPO_DIR/deploy/seaweedfs/s3.test.conf"
COMPOSE_OVERRIDE="$REPO_DIR/$COMPOSE_FILE"

require_file "$ENV_FILE"
require_file "$KAEDE_ENV_FILE"
require_file "$STORAGE_BOOTSTRAP_ENV_FILE"
require_file "$SEAWEEDFS_CONFIG_FILE"
require_file "$COMPOSE_OVERRIDE"

cd "$REPO_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "script must run inside the repository"
require_clean_tree

log "Fetching origin for ref: $TARGET_REF"
git fetch --prune --tags origin "$TARGET_REF"
git checkout --detach FETCH_HEAD

log "Pulling external images for env: test"
compose_cmd pull postgres seaweedfs

log "Starting dependent services for env: test"
compose_cmd up -d postgres seaweedfs

log "Running database migrations for env: test"
compose_cmd \
  --profile tools \
  -e DBMATE_SCHEMA_FILE=/tmp/schema.sql \
  run --rm dbmate up

log "Initializing object storage for env: test"
compose_cmd \
  --profile tools \
  run --rm storage-bootstrap

log "Starting application services for env: test"
compose_cmd up -d --build --remove-orphans

log "Waiting for services to become healthy for env: test"
wait_for_healthy postgres
wait_for_healthy seaweedfs
wait_for_healthy nozomi
wait_for_healthy kaede

ensure_dir "$REVISION_DIR"
cat >"$REVISION_FILE" <<EOF
REVISION=$(git rev-parse HEAD)
REF=$TARGET_REF
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

log "Deploy completed for test at $(git rev-parse --short HEAD)"
