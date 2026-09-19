#!/usr/bin/env bash
# Smoke-check ZipWiki API on Fly (dev + prod).
#
# Usage (from repo root):
#   pnpm check:fly
#   pnpm check:fly:dev
#   pnpm check:fly:prod
#   ./deploy/fly/check.sh [dev|prod|all]
#
# fly.dev /health failures fail the exit code.
# Custom domains (api*.zipwiki.ai) warn only until DNS/certs are ready.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TARGET="${1:-all}"
if [[ "$TARGET" != "dev" && "$TARGET" != "prod" && "$TARGET" != "all" ]]; then
  echo "Usage: $0 [dev|prod|all]" >&2
  exit 1
fi

if [[ -t 1 ]]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; YELLOW=""; DIM=""; RESET=""
fi

FAILS=0
WARNS=0

check_url() {
  local label="$1"
  local url="$2"
  local soft="${3:-0}"
  local tmp err_file
  tmp="$(mktemp)"
  err_file="${tmp}.err"

  set +e
  local http_ms
  http_ms="$(
    curl -sS -L --connect-timeout 10 --max-time 45 \
      -o "$tmp" -w '%{http_code} %{time_total}' \
      "$url" 2>"$err_file"
  )"
  local curl_ec=$?
  set -e

  bump() {
    local msg="$1"
    if [[ "$soft" == "1" ]]; then
      WARNS=$((WARNS + 1))
      echo "  ${YELLOW}WARN${RESET}  $label  $msg"
    else
      FAILS=$((FAILS + 1))
      echo "  ${RED}FAIL${RESET}  $label  $msg"
    fi
    echo "         ${DIM}$url${RESET}"
  }

  if [[ $curl_ec -ne 0 ]]; then
    local err
    err="$(tr '\n' ' ' <"$err_file" | sed 's/[[:space:]]*$//')"
    bump "curl exit $curl_ec${err:+: $err}"
    rm -f "$tmp" "$err_file"
    return
  fi

  local code="${http_ms%% *}"
  local secs="${http_ms#* }"
  local body
  body="$(cat "$tmp")"
  rm -f "$tmp" "$err_file"

  if [[ "$code" != "200" ]]; then
    bump "HTTP $code (${secs}s)"
    echo "         ${body:0:200}"
    return
  fi

  local status service phase
  if command -v jq >/dev/null 2>&1; then
    status="$(echo "$body" | jq -r '.status // empty')"
    service="$(echo "$body" | jq -r '.service // empty')"
    phase="$(echo "$body" | jq -r '.phase // empty')"
  else
    status="$(echo "$body" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    service="$(echo "$body" | sed -n 's/.*"service"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    phase="$(echo "$body" | sed -n 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  fi

  if [[ "$status" != "ok" ]]; then
    bump "HTTP 200 but status=${status:-?} (${secs}s)"
    echo "         ${body:0:200}"
    return
  fi

  echo "  ${GREEN}OK${RESET}    $label  ${DIM}${secs}s  service=${service:-?} phase=${phase:-?}${RESET}"
}

fly_snapshot() {
  local env="$1"
  local config="$ROOT/deploy/fly/fly.$env.toml"
  if ! command -v fly >/dev/null 2>&1; then
    echo "  ${DIM}(flyctl not installed — skip machine status)${RESET}"
    return
  fi
  if [[ ! -f "$config" ]]; then
    echo "  ${YELLOW}WARN${RESET}  missing $config"
    WARNS=$((WARNS + 1))
    return
  fi
  echo "  ${DIM}fly status${RESET}"
  set +e
  fly status -c "$config" 2>&1 | sed 's/^/    /'
  local st=$?
  set -e
  if [[ $st -ne 0 ]]; then
    FAILS=$((FAILS + 1))
  fi
}

check_env() {
  local env="$1"
  local app fly_host custom_host
  if [[ "$env" == "dev" ]]; then
    app="zipwiki-api-dev"
    fly_host="https://zipwiki-api-dev.fly.dev"
    custom_host="https://api-dev.zipwiki.ai"
  else
    app="zipwiki-api-prod"
    fly_host="https://zipwiki-api-prod.fly.dev"
    custom_host="https://api.zipwiki.ai"
  fi

  echo ""
  echo "=== $env ($app) ==="
  fly_snapshot "$env"
  echo "  ${DIM}GET /health${RESET}"
  check_url "fly.dev" "$fly_host/health" 0
  check_url "custom" "$custom_host/health" 1
}

echo "ZipWiki API check ($(date -u +%Y-%m-%dT%H:%MZ))"

if [[ "$TARGET" == "all" || "$TARGET" == "dev" ]]; then
  check_env dev
fi
if [[ "$TARGET" == "all" || "$TARGET" == "prod" ]]; then
  check_env prod
fi

echo ""
if [[ $FAILS -eq 0 ]]; then
  if [[ $WARNS -gt 0 ]]; then
    echo "${GREEN}Fly hosts healthy.${RESET} ${YELLOW}$WARNS warning(s) (usually custom DNS/certs).${RESET}"
  else
    echo "${GREEN}All checks passed.${RESET}"
  fi
  exit 0
fi
echo "${RED}$FAILS check(s) failed.${RESET}${WARNS:+ ($WARNS warning(s))}"
echo "Tips: fly logs -c deploy/fly/fly.dev.toml · pnpm deploy:fly:dev|prod"
exit 1
