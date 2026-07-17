#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVER_IP="${SERVER_IP:-10.131.75.39}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_USER="${SERVER_USER:-jojo}"
REMOTE_DIR="${REMOTE_DIR:-/Users/jojo/Documents/workbench}"
# 认证方式：默认使用密码登录（SSH_PASSWORD），置空则回退到 SSH 私钥（SSH_KEY）
SSH_PASSWORD="${SSH_PASSWORD:-123456}"
SSH_KEY="${SSH_KEY:-${HOME}/.ssh/figma-mirror-deploy-key}"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${PROJECT_DIR}/data}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/Users/jojo/workbench-data-backups}"
REMOTE_STAGING_ROOT="${REMOTE_STAGING_ROOT:-/Users/jojo/workbench-data-staging}"
LEGACY_DATA_VOLUME="${LEGACY_DATA_VOLUME:-opencode-workbench_app-data}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

dry_run=false
deploy_author=false
backup_only=false
overwrite_data=false
verify=false
confirm_overwrite=false
keep_staging=false
stamp="$(date +%Y%m%d-%H%M%S)"
staging_path=""

print_usage() {
    cat <<'EOF'
用法:
  scripts/deploy-author-with-data.sh --deploy-author --verify
  scripts/deploy-author-with-data.sh --dry-run --overwrite-data --confirm-overwrite-production-data
  scripts/deploy-author-with-data.sh --deploy-author --overwrite-data --confirm-overwrite-production-data --verify
  scripts/deploy-author-with-data.sh --backup-only
  scripts/deploy-author-with-data.sh --verify

动作:
  --deploy-author                         部署创作端，内部调用 scripts/deploy-fast.sh author
  --backup-only                           只备份远端生产 data，不上传、不覆盖、不停服
  --overwrite-data                        使用本地 data/ 覆盖正式环境 data，必须同时传确认参数
  --verify                                验证远端容器健康、data 挂载和 HTTP 端点

保护:
  --confirm-overwrite-production-data     允许执行生产 data 覆盖
  --dry-run                               打印并执行只读预检，不部署、不备份、不上传、不覆盖
  --keep-staging                          覆盖完成后保留远端 staging 目录
  -h, --help                              显示帮助

可覆盖环境变量:
  SERVER_IP SERVER_PORT SERVER_USER REMOTE_DIR SSH_PASSWORD SSH_KEY LOCAL_DATA_DIR
  REMOTE_BACKUP_DIR REMOTE_STAGING_ROOT LEGACY_DATA_VOLUME
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

# ================= SSH / Rsync 认证封装 =================
# 统一走 SSH_CMD（数组）与 RSYNC_RSH（字符串），屏蔽密码/私钥差异。
SSH_OPTS=(-p "${SERVER_PORT}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10)
if [ -n "${SSH_PASSWORD}" ]; then
    if ! command -v sshpass >/dev/null 2>&1; then
        log_error "❌ 使用密码登录需要 sshpass，请先安装（macOS: brew install sshpass），或置空 SSH_PASSWORD 改用私钥"
        exit 1
    fi
    SSH_CMD=(sshpass -p "${SSH_PASSWORD}" ssh "${SSH_OPTS[@]}")
    RSYNC_RSH="sshpass -p ${SSH_PASSWORD} ssh ${SSH_OPTS[*]}"
else
    SSH_CMD=(ssh "${SSH_OPTS[@]}" -i "${SSH_KEY}")
    RSYNC_RSH="ssh ${SSH_OPTS[*]} -i ${SSH_KEY}"
fi

ssh_base() {
    "${SSH_CMD[@]}" "${SERVER_USER}@${SERVER_IP}" "$@"
}

run_remote_script() {
    "${SSH_CMD[@]}" "${SERVER_USER}@${SERVER_IP}" bash -s -- "$@"
}

require_local_inputs() {
    if [ -z "${SSH_PASSWORD}" ] && [ ! -f "${SSH_KEY}" ]; then
        log_error "❌ SSH 私钥不存在: ${SSH_KEY}"
        exit 1
    fi

    if [ "${overwrite_data}" = true ] && [ ! -d "${LOCAL_DATA_DIR}" ]; then
        log_error "❌ 本地 data 目录不存在: ${LOCAL_DATA_DIR}"
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
    echo "  REMOTE_BACKUP_DIR=${REMOTE_BACKUP_DIR}"
    echo "  REMOTE_STAGING_ROOT=${REMOTE_STAGING_ROOT}"
    echo "  LEGACY_DATA_VOLUME=${LEGACY_DATA_VOLUME}"
    echo "  dry_run=${dry_run}"
    echo "  deploy_author=${deploy_author}"
    echo "  backup_only=${backup_only}"
    echo "  overwrite_data=${overwrite_data}"
    echo "  verify=${verify}"
}

preflight_remote_data() {
    log_info "🔍 远端 data 挂载预检..."
    run_remote_script "${REMOTE_DIR}" "${LEGACY_DATA_VOLUME}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
legacy_volume="$2"

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
if [ -d "$app_data_dir" ]; then
    du -sh "$app_data_dir"
    find "$app_data_dir" -maxdepth 1 -mindepth 1 | wc -l
else
    echo "WARN: APP_DATA_DIR does not exist yet"
fi

if docker volume inspect "$legacy_volume" >/dev/null 2>&1; then
    volume_path="$(docker volume inspect -f '{{.Mountpoint}}' "$legacy_volume")"
    echo "LEGACY_VOLUME_PATH=$volume_path"
    if [ -d "$volume_path" ]; then
        du -sh "$volume_path"
        find "$volume_path" -maxdepth 1 -mindepth 1 | wc -l
    fi
else
    echo "LEGACY_VOLUME_PATH="
fi

echo "MOUNTS"
for c in \
    workbench-agent-service-1 \
    workbench-author-site-1 \
    workbench-screenshot-service-1 \
    workbench-viewer-site-1
do
    docker inspect -f '{{.Name}} {{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}} {{end}}' "$c" 2>/dev/null || true
done
REMOTE
}

backup_remote_data() {
    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过生产 data 备份"
        return
    fi

    log_info "💾 备份远端生产 data..."
    run_remote_script "${REMOTE_DIR}" "${REMOTE_BACKUP_DIR}" "${LEGACY_DATA_VOLUME}" "${stamp}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
backup_dir="$2"
legacy_volume="$3"
stamp="$4"

cd "$remote_dir"
mkdir -p "$backup_dir"

app_data_dir="/opt/workbench/data"
if [ -f .env.docker ]; then
    configured="$(awk -F= '$1 == "APP_DATA_DIR" { print substr($0, index($0, "=") + 1); exit }' .env.docker)"
    if [ -n "$configured" ]; then
        app_data_dir="$configured"
    fi
fi

test -d "$app_data_dir"
bind_backup="$backup_dir/${stamp}-bind-data.tar.gz"
tar -C "$(dirname "$app_data_dir")" -czf "$bind_backup" "$(basename "$app_data_dir")"
echo "BIND_BACKUP=$bind_backup"

if docker volume inspect "$legacy_volume" >/dev/null 2>&1; then
    volume_path="$(docker volume inspect -f '{{.Mountpoint}}' "$legacy_volume")"
    if [ -d "$volume_path" ]; then
        volume_backup="$backup_dir/${stamp}-legacy-volume-data.tar.gz"
        tar -C "$volume_path" -czf "$volume_backup" .
        echo "VOLUME_BACKUP=$volume_backup"
    fi
fi

sha256sum "$backup_dir/${stamp}"-*.tar.gz
ls -lh "$backup_dir/${stamp}"-*.tar.gz
REMOTE
    log_ok "✅ 远端 data 备份完成"
}

deploy_author_site() {
    if [ "${dry_run}" = true ]; then
        echo "DRY RUN: DEPLOY_SERVICES=author-site scripts/deploy.sh"
        return
    fi

    log_info "🚀 部署创作端 author-site..."
    "${PROJECT_DIR}/scripts/deploy-fast.sh" author
    log_ok "✅ 创作端部署完成"
}

upload_staging() {
    staging_path="${REMOTE_STAGING_ROOT}/data-${stamp}"

    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过 data 上传"
        return
    fi

    log_info "📦 上传本地 data 到远端 staging: ${staging_path}"
    ssh_base "mkdir -p '${staging_path}'"

    rsync -az --delete --stats \
        -e "${RSYNC_RSH}" \
        "${LOCAL_DATA_DIR}/" \
        "${SERVER_USER}@${SERVER_IP}:${staging_path}/"

    run_remote_script "${staging_path}" <<'REMOTE'
set -euo pipefail
staging="$1"
du -sh "$staging"
find "$staging" -maxdepth 1 -mindepth 1 | wc -l
find "$staging" -maxdepth 1 -mindepth 1 -printf '%f\n' | sort
REMOTE
    log_ok "✅ data staging 上传并校验完成"
}

overwrite_remote_data() {
    if [ "${overwrite_data}" != true ]; then
        return
    fi

    if [ "${confirm_overwrite}" != true ]; then
        log_error "❌ --overwrite-data 必须同时传 --confirm-overwrite-production-data"
        exit 1
    fi

    if [ "${dry_run}" = true ]; then
        log_warn "DRY RUN: 跳过生产 data 覆盖"
        return
    fi

    backup_remote_data
    upload_staging

    log_warn "⚠️  即将停止共享 data 的服务并覆盖正式 data"
    run_remote_script "${REMOTE_DIR}" "${staging_path}" "${LEGACY_DATA_VOLUME}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
staging="$2"
legacy_volume="$3"

cd "$remote_dir"
test -d "$staging"

app_data_dir="/opt/workbench/data"
if [ -f .env.docker ]; then
    configured="$(awk -F= '$1 == "APP_DATA_DIR" { print substr($0, index($0, "=") + 1); exit }' .env.docker)"
    if [ -n "$configured" ]; then
        app_data_dir="$configured"
    fi
fi
test -d "$app_data_dir"

volume_path=""
if docker volume inspect "$legacy_volume" >/dev/null 2>&1; then
    volume_path="$(docker volume inspect -f '{{.Mountpoint}}' "$legacy_volume")"
fi

echo "STOPPING_SERVICES"
docker compose --env-file .env.docker stop viewer-site screenshot-service author-site agent-service

echo "SYNC_APP_DATA_DIR=$app_data_dir"
rsync -a --delete "$staging"/ "$app_data_dir"/
chown -R root:root "$app_data_dir"

if [ -n "$volume_path" ] && [ -d "$volume_path" ]; then
    echo "SYNC_LEGACY_VOLUME=$volume_path"
    rsync -a --delete "$staging"/ "$volume_path"/
    chown -R root:root "$volume_path"
fi

sync

echo "STARTING_SERVICES"
docker compose --env-file .env.docker up -d agent-service author-site screenshot-service viewer-site
docker compose --env-file .env.docker ps agent-service author-site screenshot-service viewer-site

echo "DATA_SUMMARY"
du -sh "$app_data_dir"
find "$app_data_dir" -maxdepth 1 -mindepth 1 | wc -l
REMOTE

    if [ "${keep_staging}" != true ]; then
        log_info "🧹 清理远端 staging..."
        ssh_base "rm -rf '${staging_path}'"
    fi

    log_ok "✅ 正式 data 覆盖完成"
}

verify_remote() {
    log_info "🩺 验证远端服务健康、挂载和 HTTP 端点..."
    run_remote_script "${REMOTE_DIR}" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
cd "$remote_dir"

for i in $(seq 1 90); do
    agent="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' workbench-agent-service-1 2>/dev/null || echo missing)"
    author="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' workbench-author-site-1 2>/dev/null || echo missing)"
    screenshot="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' workbench-screenshot-service-1 2>/dev/null || echo missing)"
    viewer="$(docker inspect -f '{{.State.Status}}' workbench-viewer-site-1 2>/dev/null || echo missing)"
    printf 'attempt=%s agent=%s author=%s screenshot=%s viewer=%s\n' "$i" "$agent" "$author" "$screenshot" "$viewer"
    if [ "$agent" = healthy ] && [ "$author" = healthy ] && [ "$screenshot" = healthy ] && [ "$viewer" = running ]; then
        break
    fi
    sleep 2
done

check_health() {
    local name="$1"
    local expected="$2"
    local actual
    if [ "$expected" = "running" ]; then
        actual="$(docker inspect -f '{{.State.Status}}' "$name")"
    else
        actual="$(docker inspect -f '{{.State.Health.Status}}' "$name")"
    fi
    if [ "$actual" != "$expected" ]; then
        echo "❌ $name expected=$expected actual=$actual" >&2
        docker logs --tail=120 "$name" 2>/dev/null || true
        exit 1
    fi
}

check_health workbench-agent-service-1 healthy
check_health workbench-author-site-1 healthy
check_health workbench-screenshot-service-1 healthy
check_health workbench-viewer-site-1 running

echo "MOUNTS"
for c in \
    workbench-agent-service-1 \
    workbench-author-site-1 \
    workbench-screenshot-service-1 \
    workbench-viewer-site-1
do
    docker inspect -f '{{.Name}} {{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}} {{end}}' "$c"
done

echo "HTTP_CHECKS"
curl -fsS http://127.0.0.1:3200 >/dev/null && echo author=ok
curl -fsS http://127.0.0.1:3201/health >/dev/null && echo agent=ok
curl -fsS http://127.0.0.1:3202/health >/dev/null && echo screenshot=ok
curl -fsS http://127.0.0.1:3300 >/dev/null && echo viewer=ok
REMOTE

    log_ok "✅ 远端验证通过"
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
        --deploy-author)
            deploy_author=true
            ;;
        --backup-only)
            backup_only=true
            ;;
        --overwrite-data)
            overwrite_data=true
            ;;
        --verify)
            verify=true
            ;;
        --confirm-overwrite-production-data)
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

if [ "${deploy_author}" != true ] && [ "${backup_only}" != true ] && [ "${overwrite_data}" != true ] && [ "${verify}" != true ]; then
    log_error "❌ 请至少指定一个动作。"
    echo "" >&2
    print_usage >&2
    exit 1
fi

if [ "${backup_only}" = true ] && { [ "${deploy_author}" = true ] || [ "${overwrite_data}" = true ] || [ "${verify}" = true ]; }; then
    log_error "❌ --backup-only 需要单独执行。"
    exit 1
fi

if [ "${overwrite_data}" = true ] && [ "${confirm_overwrite}" != true ]; then
    log_error "❌ --overwrite-data 必须同时传 --confirm-overwrite-production-data"
    exit 1
fi

require_local_inputs
print_summary
check_ssh
preflight_remote_data

if [ "${backup_only}" = true ]; then
    backup_remote_data
    exit 0
fi

if [ "${deploy_author}" = true ]; then
    deploy_author_site
fi

if [ "${overwrite_data}" = true ]; then
    overwrite_remote_data
fi

if [ "${verify}" = true ]; then
    verify_remote
fi

log_ok "🎉 完成"
