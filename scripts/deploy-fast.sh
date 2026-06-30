#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_usage() {
    cat <<'EOF'
用法:
  scripts/deploy-fast.sh author
  scripts/deploy-fast.sh agent
  scripts/deploy-fast.sh viewer
  scripts/deploy-fast.sh author viewer
  scripts/deploy-fast.sh shot

短名:
  author      -> author-site
  agent       -> agent-service
  viewer      -> viewer-site
  shot        -> screenshot-service
  screenshot  -> screenshot-service
  core        -> agent-service author-site viewer-site

选项:
  --dry-run   只打印将要执行的部署范围，不真正部署
  -h, --help  显示帮助
EOF
}

if [ "$#" -eq 0 ]; then
    print_usage
    exit 1
fi

dry_run=false
services=()

for target in "$@"; do
    case "${target}" in
        -h|--help)
            print_usage
            exit 0
            ;;
        --dry-run)
            dry_run=true
            ;;
        author|author-site)
            services+=("author-site")
            ;;
        agent|agent-service)
            services+=("agent-service")
            ;;
        viewer|viewer-site)
            services+=("viewer-site")
            ;;
        shot|screenshot|screenshot-service)
            services+=("screenshot-service")
            ;;
        core)
            services+=("agent-service" "author-site" "viewer-site")
            ;;
        *)
            echo "不支持的部署目标: ${target}" >&2
            echo "" >&2
            print_usage >&2
            exit 1
            ;;
    esac
done

if [ "${#services[@]}" -eq 0 ]; then
    echo "请至少指定一个部署目标。" >&2
    echo "" >&2
    print_usage >&2
    exit 1
fi

deduped_services=()
for service in "${services[@]}"; do
    exists=false
    for existing in "${deduped_services[@]}"; do
        if [ "${existing}" = "${service}" ]; then
            exists=true
            break
        fi
    done
    if [ "${exists}" = false ]; then
        deduped_services+=("${service}")
    fi
done

deploy_services="${deduped_services[*]}"

if [ "${dry_run}" = true ]; then
    echo "DEPLOY_SERVICES=\"${deploy_services}\" scripts/deploy.sh"
    exit 0
fi

DEPLOY_SERVICES="${deploy_services}" exec "${PROJECT_DIR}/scripts/deploy.sh"
