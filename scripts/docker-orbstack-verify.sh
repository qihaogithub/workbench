#!/usr/bin/env bash
set -euo pipefail

with_screenshot=false

print_usage() {
    cat <<'EOF'
Usage:
  scripts/docker-orbstack-verify.sh [--with-screenshot]

Checks the local OrbStack HTTP surface:
  knowledge-service  container health (internal-only)
  author-site  http://localhost:3200
  agent-service http://localhost:3201/health
  viewer-site  http://localhost:3300

With --with-screenshot, also checks screenshot-service process health.
Use scripts/docker-screenshot-deep-health.sh for browser rendering diagnostics.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --)
            ;;
        --with-screenshot)
            with_screenshot=true
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

check_http_status() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local status
    local attempt

    for attempt in $(seq 1 30); do
        status="$(curl -sS -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || true)"
        if [ "${status}" = "${expected}" ]; then
            echo "${name} ok: HTTP ${status}"
            return 0
        fi
        sleep 2
    done

    echo "${name} failed: expected HTTP ${expected}, got ${status:-none} (${url})" >&2
    exit 1
}

check_json_status() {
    local name="$1"
    local url="$2"
    local status
    local attempt

    for attempt in $(seq 1 30); do
        status="$(
            curl -fsS "${url}" 2>/dev/null \
                | node -e "let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{try{const data=JSON.parse(input);process.stdout.write(String(data.status||''));}catch{process.exit(2);}});" \
                2>/dev/null || true
        )"
        if [ "${status}" = "ok" ]; then
            echo "${name} ok: status=ok"
            return 0
        fi
        sleep 2
    done

    echo "${name} failed: expected status=ok, got status=${status:-none} (${url})" >&2
    exit 1
}

check_http_status "author-site" "http://localhost:3200" "200"
check_json_status "agent-service" "http://localhost:3201/health"
check_http_status "viewer-site" "http://localhost:3300" "200"

knowledge_health="$(
    docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
        workbench-knowledge-service-1 2>/dev/null || true
)"
if [ "${knowledge_health}" != "healthy" ]; then
    echo "knowledge-service failed: expected container health=healthy, got ${knowledge_health:-missing}" >&2
    exit 1
fi
echo "knowledge-service ok: container health=healthy"

if [ "${with_screenshot}" = true ]; then
    check_json_status "screenshot-service" "http://localhost:3202/health"
fi
