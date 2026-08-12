#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# data-sync.sh — 数据目录双向同步统一入口
#
# 方向：
#   prod2local  使用正式环境 data 覆盖本地 data
#   local2prod  使用本地 data 覆盖正式环境 data
#
# 底层复用已有脚本：
#   prod2local → scripts/sync-production-data-to-local.sh
#   local2prod → scripts/deploy-author-with-data.sh
#
# 用法：
#   scripts/data-sync.sh prod2local [--dry-run] [--yes]
#   scripts/data-sync.sh local2prod [--dry-run] [--yes]
#   scripts/data-sync.sh --help
#
# 说明：
#   默认覆盖前会交互确认（Y/n）；传 --yes 跳过确认。
#   --dry-run 只做只读预检，不备份、不覆盖。
#   所有既有脚本的环境变量（SERVER_IP / SERVER_USER / SSH_PASSWORD 等）均可覆盖透传。
# ============================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

direction=""
dry_run=false
assume_yes=false

log_info() { echo -e "${BLUE}$*${NC}"; }
log_ok()   { echo -e "${GREEN}$*${NC}"; }
log_warn() { echo -e "${YELLOW}$*${NC}"; }
log_error(){ echo -e "${RED}$*${NC}" >&2; }

print_usage() {
    cat <<'EOF'
用法:
  scripts/data-sync.sh <direction> [--dry-run] [--yes]

方向 (必填):
  prod2local   使用正式环境 data 覆盖本地 data
  local2prod   使用本地 data 覆盖正式环境 data

选项:
  --dry-run    只执行只读预检，不备份、不覆盖、不重启
  --yes        跳过交互确认直接执行（覆盖前仍遵循底层脚本的确认参数）
  -h, --help   显示帮助

示例:
  scripts/data-sync.sh prod2local --dry-run
  scripts/data-sync.sh prod2local
  scripts/data-sync.sh local2prod --yes

可覆盖环境变量 (透传给底层脚本):
  SERVER_IP SERVER_PORT SERVER_USER REMOTE_DIR SSH_PASSWORD SSH_KEY LOCAL_DATA_DIR
EOF
}

# 解析参数
for arg in "$@"; do
    case "$arg" in
        prod2local|local2prod)
            direction="$arg"
            ;;
        --dry-run)
            dry_run=true
            ;;
        --yes)
            assume_yes=true
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            log_error "未知参数: $arg"
            echo "" >&2
            print_usage >&2
            exit 1
            ;;
    esac
done

if [ -z "$direction" ]; then
    log_error "❌ 缺少方向参数。"
    echo "" >&2
    print_usage >&2
    exit 1
fi

confirm_direction() {
    local label="$1"
    local src="$2"
    local dst="$3"

    log_warn "⚠️  即将使用 ${label}:"
    log_warn "  来源: ${src}"
    log_warn "  目标: ${dst}"
    log_warn "  会覆盖目标目录，且不可撤回复原（覆盖前会备份）。"

    if [ "$assume_yes" = true ]; then
        log_warn "已传入 --yes，跳过确认。"
        return 0
    fi

    read -r -p "确认继续覆盖？[y/N] " answer
    case "${answer:-N}" in
        y|Y|yes|YES) return 0 ;;
        *) log_error "已取消。"; exit 1 ;;
    esac
}

case "$direction" in
    prod2local)
        confirm_direction "正式环境 data 覆盖本地 data" \
            "正式 (SERVER_USER@SERVER_IP:REMOTE_DIR/data)" \
            "本地 (${PROJECT_DIR}/data)"

        ARGS=()
        if [ "$dry_run" = true ]; then
            ARGS+=(--dry-run)
        fi
        ARGS+=(--overwrite-local-data --confirm-overwrite-local-data)

        log_info "🚀 exec: scripts/sync-production-data-to-local.sh ${ARGS[*]}"
        exec "${PROJECT_DIR}/scripts/sync-production-data-to-local.sh" "${ARGS[@]}"
        ;;

    local2prod)
        confirm_direction "本地 data 覆盖正式环境 data" \
            "本地 (${PROJECT_DIR}/data)" \
            "正式 (SERVER_USER@SERVER_IP:REMOTE_DIR/data)"

        ARGS=()
        if [ "$dry_run" = true ]; then
            ARGS+=(--dry-run)
        fi
        ARGS+=(--overwrite-data --confirm-overwrite-production-data)

        log_info "🚀 exec: scripts/deploy-author-with-data.sh ${ARGS[*]}"
        exec "${PROJECT_DIR}/scripts/deploy-author-with-data.sh" "${ARGS[@]}"
        ;;
esac