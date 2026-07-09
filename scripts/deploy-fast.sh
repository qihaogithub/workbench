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

默认启用 targeted sync，只同步目标服务构建所需的 workspace 包。
默认启用本地构建：在本机生成 linux/amd64 镜像，上传到服务器后只执行 docker load + recreate。

短名:
  author      -> author-site
  agent       -> agent-service
  viewer      -> viewer-site
  shot        -> screenshot-service
  screenshot  -> screenshot-service
  core        -> agent-service author-site viewer-site

选项:
  --targeted-sync  只同步目标服务需要的包（默认）
  --full-sync      使用 deploy.sh 的完整同步模式
  --local-build    本地构建镜像后上传部署（默认）
  --remote-build   在服务器上构建镜像（仅作为兜底，带资源预检）
  --dry-run        只打印将要执行的部署范围，不真正部署
  -h, --help       显示帮助
EOF
}

if [ "$#" -eq 0 ]; then
    print_usage
    exit 1
fi

dry_run=false
sync_mode="${DEPLOY_SYNC_MODE:-targeted}"
build_mode="${DEPLOY_BUILD_MODE:-local}"
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
        --targeted-sync)
            sync_mode="targeted"
            ;;
        --full-sync)
            sync_mode="full"
            ;;
        --local-build)
            build_mode="local"
            ;;
        --remote-build)
            build_mode="remote"
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

case "${sync_mode}" in
    full|targeted)
        ;;
    *)
        echo "不支持的同步模式: ${sync_mode}" >&2
        echo "允许值: full targeted" >&2
        exit 1
        ;;
esac

case "${build_mode}" in
    local|remote)
        ;;
    *)
        echo "不支持的构建模式: ${build_mode}" >&2
        echo "允许值: local remote" >&2
        exit 1
        ;;
esac

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
    echo "DEPLOY_BUILD_MODE=\"${build_mode}\" DEPLOY_SYNC_MODE=\"${sync_mode}\" DEPLOY_SERVICES=\"${deploy_services}\" scripts/deploy.sh"
    exit 0
fi

DEPLOY_BUILD_MODE="${build_mode}" DEPLOY_SYNC_MODE="${sync_mode}" DEPLOY_SERVICES="${deploy_services}" exec "${PROJECT_DIR}/scripts/deploy.sh"
