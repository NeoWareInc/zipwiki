#!/usr/bin/env bash
# Push deploy/.env.dev or deploy/.env.prod to Fly secrets.
# Empty values are skipped so you don't wipe existing secrets.
#
# Usage (from repo root):
#   pnpm secrets:fly:dev
#   pnpm secrets:fly:prod
#   ./deploy/fly/set-secrets.sh dev
#   ./deploy/fly/set-secrets.sh prod --stage
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_NAME="${1:-}"
STAGE_FLAG=""
if [[ "${2:-}" == "--stage" ]] || [[ "${1:-}" == "--stage" ]]; then
  STAGE_FLAG="--stage"
fi
if [[ "${1:-}" == "--stage" ]]; then
  ENV_NAME="${2:-}"
fi

if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "Usage: $0 <dev|prod> [--stage]" >&2
  echo "  Reads deploy/.env.dev or deploy/.env.prod and runs fly secrets set." >&2
  exit 1
fi

ENV_FILE="$ROOT/deploy/.env.$ENV_NAME"
EXAMPLE_FILE="$ROOT/deploy/env.$ENV_NAME.example"
CONFIG="$ROOT/deploy/fly/fly.$ENV_NAME.toml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  if [[ -f "$EXAMPLE_FILE" ]]; then
    echo "Copy the template:" >&2
    echo "  cp deploy/env.$ENV_NAME.example deploy/.env.$ENV_NAME" >&2
  fi
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing Fly config: $CONFIG" >&2
  exit 1
fi

if ! command -v fly >/dev/null 2>&1; then
  echo "flyctl not found. Install: https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

ALLOWED_KEYS=(
  CONVEX_SITE_URL
  ZIPWIKI_WORKER_SECRET
  ANTHROPIC_API_KEY
  LLAMA_CLOUD_API_KEY
  WEB_ORIGIN
)

is_allowed() {
  local key="$1"
  local k
  for k in "${ALLOWED_KEYS[@]}"; do
    [[ "$k" == "$key" ]] && return 0
  done
  return 1
}

ARGS=()
SKIPPED=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  raw="${line#*=}"
  key="$(echo "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ "$raw" =~ ^\".*\"$ ]]; then
    raw="${raw:1:${#raw}-2}"
  elif [[ "$raw" =~ ^\'.*\'$ ]]; then
    raw="${raw:1:${#raw}-2}"
  fi

  if ! is_allowed "$key"; then
    SKIPPED+=("$key")
    continue
  fi
  if [[ -z "$raw" ]]; then
    SKIPPED+=("$key(empty)")
    continue
  fi
  ARGS+=("${key}=${raw}")
done < "$ENV_FILE"

if [[ ${#ARGS[@]} -eq 0 ]]; then
  echo "No non-empty allowed secrets in $ENV_FILE" >&2
  exit 1
fi

echo "Setting ${#ARGS[@]} secret(s) on Fly ($ENV_NAME) via $CONFIG"
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "Skipped: ${SKIPPED[*]}"
fi

# shellcheck disable=SC2086
fly secrets set -c "$CONFIG" $STAGE_FLAG "${ARGS[@]}"

echo "Done. Verify: fly secrets list -c deploy/fly/fly.$ENV_NAME.toml"
