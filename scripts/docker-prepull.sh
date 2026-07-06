#!/usr/bin/env bash
set -euo pipefail

screenshot=false

print_usage() {
    cat <<'EOF'
Usage:
  scripts/docker-prepull.sh [--screenshot]

Pulls common base images used by local Docker builds.
With --screenshot, also pulls the screenshot-service base image for
SCREENSHOT_SERVICE_PLATFORM, defaulting to linux/amd64 for OrbStack.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --)
            ;;
        --screenshot)
            screenshot=true
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

docker pull node:20-bookworm-slim
docker pull nginx:alpine

if [ "${screenshot}" = true ]; then
    platform="${SCREENSHOT_SERVICE_PLATFORM:-linux/amd64}"
    docker pull --platform "${platform}" node:20-bookworm-slim
fi
