#!/usr/bin/env bash
# Push deploy/.env.convex.dev or deploy/.env.convex.prod to the Convex deployment.
# Empty values are skipped. Existing different values are refused unless --force.
#
# Usage (from repo root):
#   pnpm secrets:convex:dev
#   pnpm secrets:convex:prod
#   ./deploy/convex/set-env.sh dev
#   ./deploy/convex/set-env.sh prod --force
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_NAME="${1:-}"
FORCE_FLAG=""
if [[ "${2:-}" == "--force" ]] || [[ "${1:-}" == "--force" ]]; then
  FORCE_FLAG="--force"
fi
if [[ "${1:-}" == "--force" ]]; then
  ENV_NAME="${2:-}"
fi

if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "Usage: $0 <dev|prod> [--force]" >&2
  echo "  Reads deploy/.env.convex.dev or deploy/.env.convex.prod" >&2
  echo "  and runs convex env set --from-file." >&2
  exit 1
fi

ENV_FILE="$ROOT/deploy/.env.convex.$ENV_NAME"
EXAMPLE_FILE="$ROOT/deploy/env.convex.$ENV_NAME.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  if [[ -f "$EXAMPLE_FILE" ]]; then
    echo "Copy the template:" >&2
    echo "  cp deploy/env.convex.$ENV_NAME.example deploy/.env.convex.$ENV_NAME" >&2
  fi
  exit 1
fi

# Login keys are created by `npx @convex-dev/auth`. CONVEX_SITE_URL is
# provided by Convex. Do not push either from this file.
ALLOWED_KEYS=(
  SITE_URL
  WEB_ORIGIN
  AUTH_RESEND_KEY
  AUTH_EMAIL
  AUTH_GOOGLE_ID
  AUTH_GOOGLE_SECRET
  AUTH_ADMIN_EMAILS
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  ZIPWIKI_WORKER_SECRET
  ZIPWIKI_API_URL
)

is_allowed() {
  local key="$1"
  local k
  for k in "${ALLOWED_KEYS[@]}"; do
    [[ "$k" == "$key" ]] && return 0
  done
  return 1
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

KEYS=()
SKIPPED=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  raw="${line#*=}"
  key="$(echo "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  value="$raw"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  if ! is_allowed "$key"; then
    SKIPPED+=("$key")
    continue
  fi
  if [[ -z "$value" ]]; then
    SKIPPED+=("$key(empty)")
    continue
  fi
  printf '%s=%s\n' "$key" "$raw" >> "$TMP"
  KEYS+=("$key")
done < "$ENV_FILE"

if [[ ${#KEYS[@]} -eq 0 ]]; then
  echo "No non-empty allowed variables in $ENV_FILE" >&2
  exit 1
fi

SET_ARGS=(--from-file "$TMP")
LIST_ARGS=(--names-only)
if [[ "$ENV_NAME" == "prod" ]]; then
  SET_ARGS=(--prod "${SET_ARGS[@]}")
  LIST_ARGS=(--prod "${LIST_ARGS[@]}")
fi
if [[ -n "$FORCE_FLAG" ]]; then
  SET_ARGS=(--force "${SET_ARGS[@]}")
fi

echo "Setting ${#KEYS[@]} variable(s) on Convex ($ENV_NAME): ${KEYS[*]}"
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "Skipped: ${SKIPPED[*]}"
fi

pnpm exec convex env set "${SET_ARGS[@]}"

echo "Done. Names only:"
pnpm exec convex env list "${LIST_ARGS[@]}"
