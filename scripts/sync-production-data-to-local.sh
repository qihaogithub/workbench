#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVER_IP="${SERVER_IP:-10.130.33.131}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_USER="${SERVER_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/workbench}"
SSH_KEY="${SSH_KEY:-${HOME}/.ssh/figma-mirror-deploy-key}"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${PROJECT_DIR}/data}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-${PROJECT_DIR}/../workbench-data-backups}"
LOCAL_STAGING_ROOT="${LOCAL_STAGING_ROOT:-${PROJECT_DIR}/../workbench-data-staging}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

dry_run=false
backup_only=false
overwrite_local=false
confirm_overwrite=false
keep_staging=false
stamp="$(date +%Y%m%d-%H%M%S)"
staging_path=""

print_usage() {
    cat <<'EOF'
用法:
  scripts/sync-production-data-to-local.sh --dry-run --overwrite-local-data --confirm-overwrite-local-data
  scripts/sync-production-data-to-local.sh --backup-only
  scripts/sync-production-data-to-local.sh --overwrite-local-data --confirm-overwrite-local-data

动作:
  --backup-only                         只备份本地 data，不拉取、不覆盖
  --overwrite-local-data                使用正式环境 data 覆盖本地 data，必须同时传确认参数

保护:
  --confirm-overwrite-local-data        允许执行本地 data 覆盖
  --dry-run                             只执行只读预检，不备份、不拉取、不覆盖
  --keep-staging                        覆盖完成后保留本地 staging 目录
  -h, --help                            显示帮助

可覆盖环境变量:
  SERVER_IP SERVER_PORT SERVER_USER REMOTE_DIR SSH_KEY LOCAL_DATA_DIR
  LOCAL_BACKUP_DIR LOCAL_STAGING_ROOT
EOF
}

log_info() {
    echo -e "${BLUE}$*${NC}"
}

log_ok() {
    echo -e "${GREEN}$*${NC}"
}

log_warn() {
    echo -e "${YELLOW}$*${NC}"
}

log_error() {
    echo -e "${RED}$*${NC}" >&2
}

ssh_base() {
    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "$@"
}

run_remote_script() {
    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" bash -s -- "$@"
}

print_sha256() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$@"
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$@"
    else
        log_warn "WARN: 未找到 shasum 或 sha256sum，跳过备份校验值输出"
    fi
}

require_local_inputs() {
    if [ ! -f "${SSH_KEY}" ]; then
        log_error "❌ SSH 私钥不存在: ${SSH_KEY}"
        exit 1
    fi

    if [ -e "${LOCAL_DATA_DIR}" ] && [ ! -d "${LOCAL_DATA_DIR}" ]; then
        log_error "❌ LOCAL_DATA_DIR 不是目录: ${LOCAL_DATA_DIR}"
        exit 1
    fi
}

check_ssh() {
    log_info "🔍 检查 SSH 连接..."
    if ! ssh_base "echo ok" >/dev/null 2>&1; then
        log_error "❌ SSH 连接失败: ${SERVER_USER}@${SERVER_IP}"
        exit 1
    fi
    log_ok "✅ SSH 连接正常"
}

print_summary() {
    log_info "📋 执行参数"
    echo "  SERVER=${SERVER_USER}@${SERVER_IP}:${SERVER_PORT}"
    echo "  REMOTE_DIR=${REMOTE_DIR}"
    echo "  LOCAL_DATA_DIR=${LOCAL_DATA_DIR}"
    echo "  LOCAL_BACKUP_DIR=${LOCAL_BACKUP_DIR}"
    echo "  LOCAL_STAGING_ROOT=${LOCAL_STAGING_ROOT}"
    echo "  dry_run=${dry_run}"
    echo "  backup_only=${backup_only}"
    echo "  overwrite_local=${overwrite_local}"
}

resolve_remote_data_dir() {
    run_remote_script "${REMOTE_DIR}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"

if [ ! -d "$remote_dir" ]; then
    echo "远端项目目录不存在: $remote_dir" >&2
    exit 1
fi

cd "$remote_dir"

app_data_dir="/opt/workbench/data"
if [ -f .env.docker ]; then
    configured="$(awk -F= '$1 == "APP_DATA_DIR" { print substr($0, index($0, "=") + 1); exit }' .env.docker)"
    if [ -n "$configured" ]; then
        app_data_dir="$configured"
    fi
fi

if [ ! -d "$app_data_dir" ]; then
    echo "APP_DATA_DIR 不存在: $app_data_dir" >&2
    exit 1
fi

printf '%s\n' "$app_data_dir"
REMOTE
}

preflight_remote_data() {
    log_info "🔍 正式环境 data 预检..."
    run_remote_script "${REMOTE_DIR}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"

if [ ! -d "$remote_dir" ]; then
    echo "❌ 远端项目目录不存在: $remote_dir" >&2
    exit 1
fi

cd "$remote_dir"

app_data_dir="/opt/workbench/data"
if [ -f .env.docker ]; then
    configured="$(awk -F= '$1 == "APP_DATA_DIR" { print substr($0, index($0, "=") + 1); exit }' .env.docker)"
    if [ -n "$configured" ]; then
        app_data_dir="$configured"
    fi
fi

echo "APP_DATA_DIR=$app_data_dir"
test -d "$app_data_dir"
du -sh "$app_data_dir"
find "$app_data_dir" -maxdepth 1 -mindepth 1 | wc -l
find "$app_data_dir" -maxdepth 1 -mindepth 1 -printf '%f\n' | sort
REMOTE
}

preflight_local_data() {
    log_info "🔍 本地 data 预检..."
    echo "LOCAL_DATA_DIR=${LOCAL_DATA_DIR}"
    if [ -d "${LOCAL_DATA_DIR}" ]; then
        du -sh "${LOCAL_DATA_DIR}"
        find "${LOCAL_DATA_DIR}" -maxdepth 1 -mindepth 1 | wc -l
        find "${LOCAL_DATA_DIR}" -maxdepth 1 -mindepth 1 -exec basename {} \; | sort
    else
        log_warn "WARN: 本地 data 目录不存在，覆盖时会创建: ${LOCAL_DATA_DIR}"
    fi
}

backup_local_data() {
    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过本地 data 备份"
        return
    fi

    if [ ! -d "${LOCAL_DATA_DIR}" ]; then
        log_warn "WARN: 本地 data 目录不存在，跳过备份: ${LOCAL_DATA_DIR}"
        return
    fi

    mkdir -p "${LOCAL_BACKUP_DIR}"
    local_backup="${LOCAL_BACKUP_DIR}/${stamp}-local-data.tar.gz"

    log_info "💾 备份本地 data: ${local_backup}"
    tar -C "$(dirname "${LOCAL_DATA_DIR}")" -czf "${local_backup}" "$(basename "${LOCAL_DATA_DIR}")"
    print_sha256 "${local_backup}"
    ls -lh "${local_backup}"
    log_ok "✅ 本地 data 备份完成"
}

download_staging() {
    staging_path="${LOCAL_STAGING_ROOT}/production-data-${stamp}"

    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过正式 data 拉取"
        return
    fi

    remote_data_dir="$(resolve_remote_data_dir)"
    mkdir -p "${staging_path}"

    log_info "📦 拉取正式环境 data 到本地 staging: ${staging_path}"
    rsync -az --delete --stats \
        -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
        "${SERVER_USER}@${SERVER_IP}:${remote_data_dir}/" \
        "${staging_path}/"

    du -sh "${staging_path}"
    find "${staging_path}" -maxdepth 1 -mindepth 1 | wc -l
    find "${staging_path}" -maxdepth 1 -mindepth 1 -exec basename {} \; | sort
    log_ok "✅ 正式 data staging 拉取并校验完成"
}

overwrite_local_data() {
    if [ "${overwrite_local}" != true ]; then
        return
    fi

    if [ "${confirm_overwrite}" != true ]; then
        log_error "❌ --overwrite-local-data 必须同时传 --confirm-overwrite-local-data"
        exit 1
    fi

    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过本地 data 覆盖"
        return
    fi

    download_staging
    backup_local_data

    log_warn "⚠️  即将使用正式环境 data 覆盖本地 data"
    mkdir -p "${LOCAL_DATA_DIR}"
    rsync -a --delete "${staging_path}/" "${LOCAL_DATA_DIR}/"
    sync

    if [ "${keep_staging}" != true ]; then
        log_info "🧹 清理本地 staging..."
        rm -rf "${staging_path}"
    fi

    log_info "DATA_SUMMARY"
    du -sh "${LOCAL_DATA_DIR}"
    find "${LOCAL_DATA_DIR}" -maxdepth 1 -mindepth 1 | wc -l
    log_ok "✅ 本地 data 覆盖完成"
}

if [ "$#" -eq 0 ]; then
    print_usage
    exit 1
fi

for arg in "$@"; do
    case "$arg" in
        --dry-run)
            dry_run=true
            ;;
        --backup-only)
            backup_only=true
            ;;
        --overwrite-local-data)
            overwrite_local=true
            ;;
        --confirm-overwrite-local-data)
            confirm_overwrite=true
            ;;
        --keep-staging)
            keep_staging=true
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            log_error "不支持的参数: $arg"
            echo "" >&2
            print_usage >&2
            exit 1
            ;;
    esac
done

if [ "${backup_only}" != true ] && [ "${overwrite_local}" != true ]; then
    log_error "❌ 请至少指定一个动作。"
    echo "" >&2
    print_usage >&2
    exit 1
fi

if [ "${backup_only}" = true ] && [ "${overwrite_local}" = true ]; then
    log_error "❌ --backup-only 需要单独执行。"
    exit 1
fi

if [ "${overwrite_local}" = true ] && [ "${confirm_overwrite}" != true ]; then
    log_error "❌ --overwrite-local-data 必须同时传 --confirm-overwrite-local-data"
    exit 1
fi

require_local_inputs
print_summary
check_ssh
preflight_remote_data
preflight_local_data

if [ "${backup_only}" = true ]; then
    backup_local_data
    exit 0
fi

if [ "${overwrite_local}" = true ]; then
    overwrite_local_data
fi

log_ok "🎉 完成"
