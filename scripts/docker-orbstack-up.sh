#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.docker"

with_screenshot=false
build=true
verify=true

print_usage() {
    cat <<'EOF'
Usage:
  scripts/docker-orbstack-up.sh [options]

Options:
  --with-screenshot   Also start screenshot-service through the screenshot profile.
  --no-build          Start containers without rebuilding images.
  --no-verify         Skip HTTP verification after startup.
  -h, --help          Show this help.

Default startup scope:
  knowledge-service agent-service author-site viewer-site
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --)
            ;;
        --with-screenshot)
            with_screenshot=true
            ;;
        --no-build)
            build=false
            ;;
        --no-verify)
            verify=false
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unsupported option: $1" >&2
            echo "" >&2
            print_usage >&2
            exit 1
            ;;
    esac
    shift
done

if [ ! -f "${ENV_FILE}" ]; then
    echo "Missing ${ENV_FILE}. Copy or create .env.docker before starting Docker services." >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker is not available. Start OrbStack and retry." >&2
    exit 1
fi

export APP_DATA_DIR="${APP_DATA_DIR:-${PROJECT_DIR}/data}"
# Read SERVER_IP from .env.docker to derive correct browser-facing URLs.
# NEXT_PUBLIC_* vars are baked into the JS bundle at build time; if they point
# to localhost but the user accesses via SERVER_IP, WebSocket/fetch will fail.
SERVER_IP_FROM_ENV="$(grep -E '^SERVER_IP=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || true)"
if [ -n "${SERVER_IP_FROM_ENV}" ]; then
  export NEXT_PUBLIC_AGENT_SERVICE_URL="${NEXT_PUBLIC_AGENT_SERVICE_URL:-http://${SERVER_IP_FROM_ENV}:3201}"
  export NEXT_PUBLIC_SCREENSHOT_SERVICE_URL="${NEXT_PUBLIC_SCREENSHOT_SERVICE_URL:-http://${SERVER_IP_FROM_ENV}:3202}"
  export NEXT_PUBLIC_WEB_URL="${NEXT_PUBLIC_WEB_URL:-http://${SERVER_IP_FROM_ENV}:3200}"
  export CORS_ORIGINS="${CORS_ORIGINS:-http://${SERVER_IP_FROM_ENV}:3200,http://${SERVER_IP_FROM_ENV}:3300,http://localhost:3200,http://localhost:3300,http://127.0.0.1:3200,http://127.0.0.1:3300}"
  export FIGMA_OAUTH_REDIRECT_URI="${FIGMA_OAUTH_REDIRECT_URI:-http://${SERVER_IP_FROM_ENV}:3200/api/user/external-auth/figma/callback}"
else
  export NEXT_PUBLIC_AGENT_SERVICE_URL="${NEXT_PUBLIC_AGENT_SERVICE_URL:-http://localhost:3201}"
  export NEXT_PUBLIC_SCREENSHOT_SERVICE_URL="${NEXT_PUBLIC_SCREENSHOT_SERVICE_URL:-http://localhost:3202}"
  export NEXT_PUBLIC_WEB_URL="${NEXT_PUBLIC_WEB_URL:-http://localhost:3200}"
  export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3200,http://localhost:3300,http://127.0.0.1:3200,http://127.0.0.1:3300}"
  export FIGMA_OAUTH_REDIRECT_URI="${FIGMA_OAUTH_REDIRECT_URI:-http://localhost:3200/api/user/external-auth/figma/callback}"
fi
export NEXT_PUBLIC_DATA_BASE="${NEXT_PUBLIC_DATA_BASE:-}"
export PUPPETEER_DISABLE_SANDBOX="${PUPPETEER_DISABLE_SANDBOX:-true}"

services=(knowledge-service agent-service author-site viewer-site)
compose_args=(--env-file "${ENV_FILE}")

if [ "${with_screenshot}" = true ]; then
    export COMPOSE_PROFILES="${COMPOSE_PROFILES:-screenshot}"
    services+=(screenshot-service)
fi

up_args=(up -d)
if [ "${build}" = true ]; then
    up_args+=(--build)
fi

echo "Starting local OrbStack services: ${services[*]}"
echo "APP_DATA_DIR=${APP_DATA_DIR}"
docker compose "${compose_args[@]}" "${up_args[@]}" "${services[@]}"

if [ "${verify}" = true ]; then
    verify_args=()
    if [ "${with_screenshot}" = true ]; then
        verify_args+=(--with-screenshot)
    fi
    "${PROJECT_DIR}/scripts/docker-orbstack-verify.sh" "${verify_args[@]}"
fi
