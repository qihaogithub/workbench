#!/usr/bin/env bash
set -euo pipefail

print_usage() {
    cat <<'EOF'
Usage:
  scripts/docker-screenshot-deep-health.sh

Runs the screenshot-service deep browser health check:
  http://localhost:3202/health?deep=1

Override the URL with SCREENSHOT_HEALTH_URL when needed.
EOF
}

if [ "${1:-}" = "--" ]; then
    shift
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    print_usage
    exit 0
fi

if [ "$#" -gt 0 ]; then
    echo "Unsupported option: $1" >&2
    echo "" >&2
    print_usage >&2
    exit 1
fi

url="${SCREENSHOT_HEALTH_URL:-http://localhost:3202/health?deep=1}"

payload="$(curl -fsS "${url}")"

node -e "
const payload = JSON.parse(process.argv[1]);
const ok = payload.deepCheck && payload.deepCheck.ok === true;
console.log(JSON.stringify(payload, null, 2));
process.exit(ok ? 0 : 1);
" "${payload}"
