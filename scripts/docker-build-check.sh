#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.docker"

with_screenshot=false
pull=false
parallel=false

print_usage() {
    cat <<'EOF'
Usage:
  scripts/docker-build-check.sh [options]

Options:
  --with-screenshot   Include screenshot-service in the Docker build check.
  --pull              Ask Docker to pull newer base images during build.
  --parallel          Build all selected services in one compose invocation.
  -h, --help          Show this help.

Default build scope:
  agent-service author-site viewer-site

Default build mode is serial to keep local OrbStack builds predictable and avoid
several clean pnpm installs competing for registry bandwidth.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --)
            ;;
        --with-screenshot)
            with_screenshot=true
            ;;
        --pull)
            pull=true
            ;;
        --parallel)
            parallel=true
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
    echo "Missing ${ENV_FILE}. Docker build check needs the same env file as compose." >&2
    exit 1
fi

export APP_DATA_DIR="${APP_DATA_DIR:-${PROJECT_DIR}/data}"
export NEXT_PUBLIC_AGENT_SERVICE_URL="${NEXT_PUBLIC_AGENT_SERVICE_URL:-http://localhost:3201}"
export NEXT_PUBLIC_SCREENSHOT_SERVICE_URL="${NEXT_PUBLIC_SCREENSHOT_SERVICE_URL:-http://localhost:3202}"
export NEXT_PUBLIC_DATA_BASE="${NEXT_PUBLIC_DATA_BASE:-}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3200,http://localhost:3300,http://127.0.0.1:3200,http://127.0.0.1:3300}"
export SCREENSHOT_SERVICE_PLATFORM="${SCREENSHOT_SERVICE_PLATFORM:-linux/amd64}"
export PUPPETEER_DISABLE_SANDBOX="${PUPPETEER_DISABLE_SANDBOX:-true}"

services=(agent-service author-site viewer-site)
compose_args=(--env-file "${ENV_FILE}")
build_options=()

if [ "${pull}" = true ]; then
    build_options+=(--pull)
fi

if [ "${with_screenshot}" = true ]; then
    export COMPOSE_PROFILES="${COMPOSE_PROFILES:-screenshot}"
    services+=(screenshot-service)
fi

echo "Checking Docker build scope: ${services[*]}"

if [ "${parallel}" = true ]; then
    docker compose "${compose_args[@]}" build "${build_options[@]}" "${services[@]}"
else
    export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
    for service in "${services[@]}"; do
        echo "Checking Docker build: ${service}"
        docker compose "${compose_args[@]}" build "${build_options[@]}" "${service}"
    done
fi
