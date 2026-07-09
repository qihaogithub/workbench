#!/bin/bash
set -e

# ================= 配置部分 =================
SERVER_IP="10.130.33.131"
SERVER_PORT="22"
SERVER_USER="root"
REMOTE_DIR="/opt/workbench"

# 本地路径
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${HOME}/.ssh/figma-mirror-deploy-key"
LOCAL_ENV_FILE="${PROJECT_DIR}/.env.docker"
DEPLOY_ENV_FILE="${PROJECT_DIR}/.deploy.env"

# 部署范围与构建资源保护。
# 默认跳过 screenshot-service，避免 Chromium 系统依赖安装拖垮正式机。
DEPLOY_SERVICES="${DEPLOY_SERVICES:-agent-service author-site viewer-site}"
INCLUDE_SCREENSHOT_SERVICE="${INCLUDE_SCREENSHOT_SERVICE:-false}"
COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
DEPLOY_SYNC_MODE="${DEPLOY_SYNC_MODE:-full}"
DEPLOY_BUILD_MODE="${DEPLOY_BUILD_MODE:-local}"
DEPLOY_IMAGE_PLATFORM="${DEPLOY_IMAGE_PLATFORM:-linux/amd64}"
REMOTE_IMAGE_DIR_BASE="${REMOTE_IMAGE_DIR_BASE:-/tmp/workbench-deploy-images}"
REMOTE_BUILD_MIN_MEM_AVAILABLE_MB="${REMOTE_BUILD_MIN_MEM_AVAILABLE_MB:-3072}"
REMOTE_BUILD_MAX_LOAD="${REMOTE_BUILD_MAX_LOAD:-4.0}"
ALLOW_CREATE_APP_DATA_DIR="${ALLOW_CREATE_APP_DATA_DIR:-false}"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 开始一键部署流程...${NC}"

# ================= 0. 生成部署环境文件 =================
if [ ! -f "${LOCAL_ENV_FILE}" ]; then
    echo -e "${RED}❌ 未找到环境变量文件: ${LOCAL_ENV_FILE}${NC}"
    echo -e "${YELLOW}   请复制 .env.docker 为模板并填写实际配置${NC}"
    exit 1
fi

python3 - "${LOCAL_ENV_FILE}" "${DEPLOY_ENV_FILE}" <<'PY'
import sys

env_path = sys.argv[1]
out_path = sys.argv[2]
values = {}
order = []
with open(env_path, "r", encoding="utf-8") as f:
    for raw_line in f:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if not key.replace("_", "").isalnum() or key[0].isdigit():
            continue
        if key not in values:
            order.append(key)
        values[key] = val.strip()

defaults = {
    "USE_SECURE_COOKIE": "false",
}
for key, value in defaults.items():
    if key not in values:
        order.append(key)
        values[key] = value

internal_api_token = values.get("INTERNAL_API_TOKEN", "").strip()
if not internal_api_token:
    print("❌ .env.docker 缺少 INTERNAL_API_TOKEN，生产环境无法同步管理后台模型配置到 agent-service", file=sys.stderr)
    print("   请在 .env.docker 中设置 author-site 与 agent-service 共享的随机密钥后重试", file=sys.stderr)
    sys.exit(1)

with open(out_path, "w", encoding="utf-8") as f:
    for key in order:
        f.write(f"{key}={values[key]}\n")
PY

LOCAL_IMAGE_DIR=""

cleanup() {
    rm -f "${DEPLOY_ENV_FILE}"
    if [ -n "${LOCAL_IMAGE_DIR}" ] && [ -d "${LOCAL_IMAGE_DIR}" ]; then
        rm -rf "${LOCAL_IMAGE_DIR}"
    fi
}

trap cleanup EXIT
echo -e "${GREEN}✅ 已从 .env.docker 生成部署环境文件${NC}"

# ================= 获取 Git 版本信息 =================
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DEPLOY_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${GIT_COMMIT}"
LOCAL_IMAGE_DIR="${PROJECT_DIR}/.tmp/deploy-images/${DEPLOY_RUN_ID}"
REMOTE_IMAGE_DIR="${REMOTE_IMAGE_DIR_BASE%/}/${DEPLOY_RUN_ID}"

echo -e "${BLUE}📋 构建信息: commit=${GIT_COMMIT}, branch=${GIT_BRANCH}, time=${BUILD_TIME}${NC}"

if [ "${INCLUDE_SCREENSHOT_SERVICE}" = "true" ] && [[ " ${DEPLOY_SERVICES} " != *" screenshot-service "* ]]; then
    DEPLOY_SERVICES="${DEPLOY_SERVICES} screenshot-service"
fi

for service in ${DEPLOY_SERVICES}; do
    case "${service}" in
        agent-service|author-site|screenshot-service|viewer-site)
            ;;
        *)
            echo -e "${RED}❌ 不支持的部署服务名: ${service}${NC}"
            echo -e "${YELLOW}   允许值: agent-service author-site screenshot-service viewer-site${NC}"
            exit 1
            ;;
    esac
done

if ! [[ "${COMPOSE_PARALLEL_LIMIT}" =~ ^[1-9][0-9]*$ ]]; then
    echo -e "${RED}❌ COMPOSE_PARALLEL_LIMIT 必须是正整数，当前值: ${COMPOSE_PARALLEL_LIMIT}${NC}"
    exit 1
fi

case "${DEPLOY_SYNC_MODE}" in
    full|targeted)
        ;;
    *)
        echo -e "${RED}❌ DEPLOY_SYNC_MODE 必须是 full 或 targeted，当前值: ${DEPLOY_SYNC_MODE}${NC}"
        exit 1
        ;;
esac

case "${DEPLOY_BUILD_MODE}" in
    local|remote)
        ;;
    *)
        echo -e "${RED}❌ DEPLOY_BUILD_MODE 必须是 local 或 remote，当前值: ${DEPLOY_BUILD_MODE}${NC}"
        exit 1
        ;;
esac

if ! [[ "${REMOTE_BUILD_MIN_MEM_AVAILABLE_MB}" =~ ^[1-9][0-9]*$ ]]; then
    echo -e "${RED}❌ REMOTE_BUILD_MIN_MEM_AVAILABLE_MB 必须是正整数，当前值: ${REMOTE_BUILD_MIN_MEM_AVAILABLE_MB}${NC}"
    exit 1
fi

if ! [[ "${REMOTE_BUILD_MAX_LOAD}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo -e "${RED}❌ REMOTE_BUILD_MAX_LOAD 必须是数字，当前值: ${REMOTE_BUILD_MAX_LOAD}${NC}"
    exit 1
fi

case "${ALLOW_CREATE_APP_DATA_DIR}" in
    true|false)
        ;;
    *)
        echo -e "${RED}❌ ALLOW_CREATE_APP_DATA_DIR 必须是 true 或 false，当前值: ${ALLOW_CREATE_APP_DATA_DIR}${NC}"
        exit 1
        ;;
esac

image_for_service() {
    case "$1" in
        agent-service) echo "workbench-agent-service" ;;
        author-site) echo "workbench-author-site" ;;
        screenshot-service) echo "workbench-screenshot-service" ;;
        viewer-site) echo "workbench-viewer-site" ;;
        *)
            echo -e "${RED}❌ 不支持的部署服务名: $1${NC}" >&2
            return 1
            ;;
    esac
}

echo -e "${BLUE}📦 部署服务: ${DEPLOY_SERVICES}${NC}"
echo -e "${BLUE}🧯 Compose 构建并发: COMPOSE_PARALLEL_LIMIT=${COMPOSE_PARALLEL_LIMIT}${NC}"
echo -e "${BLUE}🔄 同步模式: DEPLOY_SYNC_MODE=${DEPLOY_SYNC_MODE}${NC}"
echo -e "${BLUE}🏗️  构建模式: DEPLOY_BUILD_MODE=${DEPLOY_BUILD_MODE}${NC}"
if [ "${DEPLOY_BUILD_MODE}" = "local" ]; then
    echo -e "${BLUE}🧱 本地镜像平台: DEPLOY_IMAGE_PLATFORM=${DEPLOY_IMAGE_PLATFORM}${NC}"
fi
echo -e "${BLUE}🗂️  允许创建空 APP_DATA_DIR: ALLOW_CREATE_APP_DATA_DIR=${ALLOW_CREATE_APP_DATA_DIR}${NC}"
if [[ " ${DEPLOY_SERVICES} " != *" screenshot-service "* ]]; then
    echo -e "${YELLOW}⚠️  本次不会重建 screenshot-service。如需更新截图服务，执行 INCLUDE_SCREENSHOT_SERVICE=true scripts/deploy.sh${NC}"
fi

# ================= 1. 检查 SSH Key =================
echo -e "${BLUE}🔍 [1/4] 检查 SSH 连接...${NC}"
if [ ! -f "${SSH_KEY}" ]; then
    echo -e "${RED}❌ SSH 私钥不存在: ${SSH_KEY}${NC}"
    echo -e "${YELLOW}   请先配置 SSH 免密登录，确保 ssh root@${SERVER_IP} 可以直接连接${NC}"
    exit 1
fi

# 验证 SSH 连接
if ! ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "echo ok" >/dev/null 2>&1; then
    echo -e "${RED}❌ SSH 连接失败: ${SERVER_USER}@${SERVER_IP}${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SSH 连接正常${NC}"

if [ "${DEPLOY_BUILD_MODE}" = "local" ]; then
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}❌ 本地 Docker 不可用，无法执行 DEPLOY_BUILD_MODE=local${NC}"
        echo -e "${YELLOW}   请先启动本地 Docker/OrbStack，或显式使用 DEPLOY_BUILD_MODE=remote。${NC}"
        exit 1
    fi
    if ! docker compose version >/dev/null 2>&1; then
        echo -e "${RED}❌ 本地 docker compose 不可用，无法执行 DEPLOY_BUILD_MODE=local${NC}"
        exit 1
    fi
fi

# ================= 2. 预检远程 Docker 镜像源 =================
echo -e "${BLUE}🔍 [2/4] 检查远程 Docker 镜像源配置...${NC}"

REMOTE_DAEMON_JSON="$(ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    if [ -f /etc/docker/daemon.json ]; then
        cat /etc/docker/daemon.json
    fi
")"

if echo "${REMOTE_DAEMON_JSON}" | grep -q 'docker.mirrors.ustc.edu.cn'; then
    echo -e "${RED}❌ 检测到远程 Docker 仍在使用已失效的镜像源: docker.mirrors.ustc.edu.cn${NC}"
    echo "请先在服务器上修复 /etc/docker/daemon.json 后重试部署。"
    exit 1
fi

echo -e "${GREEN}✅ 远程 Docker 镜像源检查通过${NC}"

# ================= 3. 同步文件 (Rsync) =================
echo -e "${BLUE}🔄 [3/4] 同步代码到服务器 (${SERVER_IP})...${NC}"
cd "${PROJECT_DIR}"

rsync_excludes=(
    --exclude '/.git/'
    --exclude '/.gitignore'
    --exclude '/.agents/'
    --exclude '/.codegraph/'
    --exclude '/.workbench/'
    --exclude '/.env'
    --exclude '/.env.docker'
    --exclude '/.tmp/'
    --exclude '/.pnpm-store/'
    --exclude '/.venv/'
    --exclude '/data/'
    --exclude '/node_modules/'
    --exclude '/OPS/CLI/dist/'
    --exclude '/OPS/CLI/node_modules/'
    --exclude '/packages/web/'
    --exclude '/packages/snapshot-service/'
    --exclude '/packages/*/.next/'
    --exclude '/packages/*/.workbench/'
    --exclude '/packages/*/data/'
    --exclude '/packages/*/node_modules/'
    --exclude '/packages/*/dist/'
    --exclude '/packages/*/out/'
    --exclude '/packages/*/tsconfig.tsbuildinfo'
    --exclude '/packages/author-site/.next/'
    --exclude '/packages/viewer-site/.next/'
    --exclude '__pycache__'
    --exclude '*.pyc'
    --exclude '*.png'
    --exclude '.DS_Store'
    --exclude '/docs/'
    --exclude '/test/'
    --exclude '/tests/'
    --exclude '/test-results/'
    --exclude '/tmp/'
    --exclude 'deploy.sh'
)

if [ "${DEPLOY_SYNC_MODE}" = "targeted" ]; then
    required_packages=()

    add_required_package() {
        local package_name="$1"
        local existing
        for existing in "${required_packages[@]}"; do
            if [ "${existing}" = "${package_name}" ]; then
                return
            fi
        done
        required_packages+=("${package_name}")
    }

    for service in ${DEPLOY_SERVICES}; do
        case "${service}" in
            agent-service)
                add_required_package "agent-service"
                add_required_package "knowledge-core"
                add_required_package "knowledge-service"
                add_required_package "preview-contract"
                add_required_package "sketch-core"
                add_required_package "shared"
                ;;
            author-site)
                add_required_package "agent-client"
                add_required_package "author-site"
                add_required_package "demo-ui"
                add_required_package "knowledge-core"
                add_required_package "knowledge-service"
                add_required_package "preview-contract"
                add_required_package "project-core"
                add_required_package "project-scaffold"
                add_required_package "sketch-core"
                add_required_package "sketch-react"
                add_required_package "shared"
                ;;
            screenshot-service)
                add_required_package "screenshot-service"
                add_required_package "sketch-core"
                add_required_package "shared"
                ;;
            viewer-site)
                add_required_package "demo-ui"
                add_required_package "sketch-core"
                add_required_package "sketch-react"
                add_required_package "shared"
                add_required_package "viewer-site"
                ;;
        esac
    done

    is_required_package() {
        local package_name="$1"
        local existing
        for existing in "${required_packages[@]}"; do
            if [ "${existing}" = "${package_name}" ]; then
                return 0
            fi
        done
        return 1
    }

    all_workspace_packages=(
        "agent-client"
        "agent-service"
        "author-site"
        "demo-ui"
        "knowledge-core"
        "knowledge-service"
        "preview-contract"
        "project-cli"
        "project-core"
        "project-scaffold"
        "screenshot-service"
        "shared"
        "sketch-core"
        "sketch-playground"
        "sketch-react"
        "viewer-site"
    )

    for package_name in "${all_workspace_packages[@]}"; do
        if ! is_required_package "${package_name}"; then
            rsync_excludes+=(--exclude "/packages/${package_name}/")
        fi
    done

    validate_dockerfile_package_inputs() {
        local service="$1"
        local dockerfile
        local package_name
        case "${service}" in
            agent-service) dockerfile="docker/agent-service/Dockerfile" ;;
            author-site) dockerfile="docker/author-site/Dockerfile" ;;
            screenshot-service) dockerfile="docker/screenshot-service/Dockerfile" ;;
            viewer-site) dockerfile="docker/viewer-site/Dockerfile" ;;
            *) return ;;
        esac

        while IFS= read -r package_name; do
            if ! is_required_package "${package_name}"; then
                echo -e "${RED}❌ targeted sync 缺少 ${service} Dockerfile 需要的包: packages/${package_name}${NC}"
                echo -e "${YELLOW}   请更新 scripts/deploy.sh 中 ${service} 的 required package 列表，或使用 --full-sync。${NC}"
                exit 1
            fi
        done < <(sed -nE 's#^[[:space:]]*COPY[[:space:]]+packages/([^/]+)/.*#\1#p' "${dockerfile}" | sort -u)
    }

    for service in ${DEPLOY_SERVICES}; do
        validate_dockerfile_package_inputs "${service}"
    done

    echo -e "${BLUE}🎯 targeted sync 包: ${required_packages[*]}${NC}"
fi

rsync -avz --progress --delete \
    "${rsync_excludes[@]}" \
    -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    ./ \
    "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"

echo -e "${GREEN}✅ 代码同步完成${NC}"

# ================= 4. 构建镜像并启动服务 =================
if [ "${DEPLOY_BUILD_MODE}" = "local" ]; then
    echo -e "${BLUE}🔄 [4/4] 本地构建镜像、上传并启动服务...${NC}"

    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
        set -e
        cd ${REMOTE_DIR}

        cp -f .deploy.env .env.docker
        APP_DATA_DIR=\$(awk -F= '\$1 == \"APP_DATA_DIR\" { print substr(\$0, index(\$0, \"=\") + 1); exit }' .env.docker)
        APP_DATA_DIR=\${APP_DATA_DIR:-/opt/workbench/data}
        echo \"📁 APP_DATA_DIR=\${APP_DATA_DIR}\"
        if [ ! -d \"\${APP_DATA_DIR}\" ]; then
            if [ '${ALLOW_CREATE_APP_DATA_DIR}' = 'true' ]; then
                mkdir -p \"\${APP_DATA_DIR}\"
                echo \"⚠️  已创建空 APP_DATA_DIR: \${APP_DATA_DIR}\"
            else
                echo \"❌ APP_DATA_DIR 不存在: \${APP_DATA_DIR}\"
                echo \"   普通部署不会自动创建空 data 目录，避免正式环境切到空数据。\"
                echo \"   请先恢复/同步 data，或确认首次部署后使用 ALLOW_CREATE_APP_DATA_DIR=true。\"
                exit 1
            fi
        fi
        mkdir -p '${REMOTE_IMAGE_DIR}'
    "

    mkdir -p "${LOCAL_IMAGE_DIR}"
    export COMPOSE_PARALLEL_LIMIT
    export DOCKER_DEFAULT_PLATFORM="${DEPLOY_IMAGE_PLATFORM}"

    echo -e "${BLUE}📦 本地构建服务: ${DEPLOY_SERVICES}${NC}"
    echo -e "${BLUE}🧱 DOCKER_DEFAULT_PLATFORM=${DOCKER_DEFAULT_PLATFORM}${NC}"

    for service in ${DEPLOY_SERVICES}; do
        echo -e "${BLUE}📦 本地构建服务: ${service}${NC}"
        docker compose --env-file "${DEPLOY_ENV_FILE}" build \
            --build-arg GIT_COMMIT="${GIT_COMMIT}" \
            --build-arg GIT_BRANCH="${GIT_BRANCH}" \
            --build-arg BUILD_TIME="${BUILD_TIME}" \
            "${service}"

        image="$(image_for_service "${service}")"
        if ! docker image inspect "${image}" >/dev/null 2>&1; then
            echo -e "${RED}❌ 本地构建完成后未找到镜像: ${image}${NC}"
            exit 1
        fi

        echo -e "${BLUE}📦 导出镜像: ${image}${NC}"
        docker save "${image}" | gzip -c > "${LOCAL_IMAGE_DIR}/${service}.tar.gz"
    done

    echo -e "${BLUE}📤 上传镜像归档到服务器: ${REMOTE_IMAGE_DIR}${NC}"
    rsync -avz --progress \
        -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
        "${LOCAL_IMAGE_DIR}/" \
        "${SERVER_USER}@${SERVER_IP}:${REMOTE_IMAGE_DIR}/"

    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
        set -e
        cd ${REMOTE_DIR}

        DEPLOY_SERVICES='${DEPLOY_SERVICES}'
        REMOTE_IMAGE_DIR='${REMOTE_IMAGE_DIR}'

        image_for_service() {
            case \"\$1\" in
                agent-service) echo 'workbench-agent-service' ;;
                author-site) echo 'workbench-author-site' ;;
                screenshot-service) echo 'workbench-screenshot-service' ;;
                viewer-site) echo 'workbench-viewer-site' ;;
                *) echo \"\" ;;
            esac
        }

        for service in \${DEPLOY_SERVICES}; do
            archive=\"\${REMOTE_IMAGE_DIR}/\${service}.tar.gz\"
            image=\$(image_for_service \"\${service}\")
            if [ ! -f \"\${archive}\" ]; then
                echo \"❌ 服务器缺少镜像归档: \${archive}\"
                exit 1
            fi

            echo \"📥 加载镜像: \${image}\"
            gzip -dc \"\${archive}\" | docker load

            echo \"🚀 重启服务: \${service}\"
            docker compose --env-file .env.docker up -d --force-recreate --no-deps --no-build \
                \"\${service}\"
        done

        rm -rf \"\${REMOTE_IMAGE_DIR}\"
        echo \"✅ 已启动服务: \${DEPLOY_SERVICES}\"
    "
else
    echo -e "${BLUE}🔄 [4/4] 远程构建并启动服务...${NC}"

    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
        set -e
        cd ${REMOTE_DIR}

        cp -f .deploy.env .env.docker
        APP_DATA_DIR=\$(awk -F= '\$1 == \"APP_DATA_DIR\" { print substr(\$0, index(\$0, \"=\") + 1); exit }' .env.docker)
        APP_DATA_DIR=\${APP_DATA_DIR:-/opt/workbench/data}
        echo \"📁 APP_DATA_DIR=\${APP_DATA_DIR}\"
        if [ ! -d \"\${APP_DATA_DIR}\" ]; then
            if [ '${ALLOW_CREATE_APP_DATA_DIR}' = 'true' ]; then
                mkdir -p \"\${APP_DATA_DIR}\"
                echo \"⚠️  已创建空 APP_DATA_DIR: \${APP_DATA_DIR}\"
            else
                echo \"❌ APP_DATA_DIR 不存在: \${APP_DATA_DIR}\"
                echo \"   普通部署不会自动创建空 data 目录，避免正式环境切到空数据。\"
                echo \"   请先恢复/同步 data，或确认首次部署后使用 ALLOW_CREATE_APP_DATA_DIR=true。\"
                exit 1
            fi
        fi

        mem_available_mb=\$(awk '/MemAvailable/ { print int(\$2 / 1024); exit }' /proc/meminfo)
        load1=\$(awk '{ print \$1 }' /proc/loadavg)
        echo \"🧯 远程构建预检: MemAvailable=\${mem_available_mb}MB Load1=\${load1}\"
        if [ \"\${mem_available_mb}\" -lt '${REMOTE_BUILD_MIN_MEM_AVAILABLE_MB}' ]; then
            echo \"❌ 远程可用内存不足，拒绝在正式机上构建。需要 >= ${REMOTE_BUILD_MIN_MEM_AVAILABLE_MB}MB。\"
            echo \"   推荐使用默认 DEPLOY_BUILD_MODE=local，或低峰期再显式 --remote-build。\"
            exit 1
        fi
        if awk -v load=\"\${load1}\" -v max='${REMOTE_BUILD_MAX_LOAD}' 'BEGIN { exit !(load > max) }'; then
            echo \"❌ 远程负载过高，拒绝在正式机上构建。当前 Load1=\${load1}，上限=${REMOTE_BUILD_MAX_LOAD}。\"
            echo \"   推荐使用默认 DEPLOY_BUILD_MODE=local，或低峰期再显式 --remote-build。\"
            exit 1
        fi

        export COMPOSE_PARALLEL_LIMIT='${COMPOSE_PARALLEL_LIMIT}'
        DEPLOY_SERVICES='${DEPLOY_SERVICES}'

        echo \"📦 构建服务: \${DEPLOY_SERVICES}\"
        echo \"🧯 COMPOSE_PARALLEL_LIMIT=\${COMPOSE_PARALLEL_LIMIT}\"

        for service in \${DEPLOY_SERVICES}; do
            echo \"📦 构建服务: \${service}\"
            docker compose --env-file .env.docker build \
                --build-arg GIT_COMMIT='${GIT_COMMIT}' \
                --build-arg GIT_BRANCH='${GIT_BRANCH}' \
                --build-arg BUILD_TIME='${BUILD_TIME}' \
                \"\${service}\"

            echo \"🚀 重启服务: \${service}\"
            docker compose --env-file .env.docker up -d --force-recreate --no-deps --no-build \
                \"\${service}\"
        done

        echo \"✅ 已启动服务: \${DEPLOY_SERVICES}\"
    "
fi

# ================= 5. 部署后自检 =================
echo -e "${BLUE}🩺 部署后自检...${NC}"

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    set -e
    cd ${REMOTE_DIR}

    DEPLOY_SERVICES='${DEPLOY_SERVICES}'

    service_in_deploy() {
        case \" \${DEPLOY_SERVICES} \" in
            *\" \$1 \"*) return 0 ;;
            *) return 1 ;;
        esac
    }

    container_for_service() {
        case \"\$1\" in
            agent-service) echo 'workbench-agent-service-1' ;;
            author-site) echo 'workbench-author-site-1' ;;
            screenshot-service) echo 'workbench-screenshot-service-1' ;;
            viewer-site) echo 'workbench-viewer-site-1' ;;
            *) echo \"\" ;;
        esac
    }

    check_container_running() {
        local name=\"\$1\"
        local status
        status=\$(docker inspect -f '{{.State.Status}}' \"\$name\" 2>/dev/null || echo 'missing')
        if [ \"\$status\" != 'running' ]; then
            echo \"❌ 容器未运行: \$name (status=\$status)\"
            docker logs --tail=80 \"\$name\" 2>/dev/null || true
            exit 1
        fi
        echo \"✅ 容器运行正常: \$name\"
    }

    check_container_healthy() {
        local name=\"\$1\"
        local health
        health=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \"\$name\" 2>/dev/null || echo 'missing')
        if [ \"\$health\" != 'healthy' ]; then
            echo \"❌ 容器健康检查失败: \$name (health=\$health)\"
            docker logs --tail=80 \"\$name\" 2>/dev/null || true
            exit 1
        fi
        echo \"✅ 容器健康正常: \$name\"
    }

    # 等待容器启动（最多 60 秒）
    echo '⏳ 等待容器启动...'
    for i in \$(seq 1 60); do
        all_running=true
        for service in \${DEPLOY_SERVICES}; do
            name=\$(container_for_service \"\$service\")
            status=\$(docker inspect -f '{{.State.Status}}' \"\$name\" 2>/dev/null || echo 'missing')
            if [ \"\$status\" != 'running' ]; then
                all_running=false
                break
            fi
        done
        if [ \"\$all_running\" = true ]; then
            break
        fi
        if [ \"\$i\" -eq 60 ]; then
            echo '❌ 容器启动超时'
            docker compose ps
            exit 1
        fi
        sleep 1
    done

    # 检查容器运行状态
    for service in \${DEPLOY_SERVICES}; do
        check_container_running \"\$(container_for_service \"\$service\")\"
    done

    # 等待健康检查（最多 90 秒）
    echo '⏳ 等待健康检查...'
    for i in \$(seq 1 90); do
        all_healthy=true
        for service in \${DEPLOY_SERVICES}; do
            case \"\$service\" in
                agent-service|author-site|screenshot-service) ;;
                *) continue ;;
            esac
            name=\$(container_for_service \"\$service\")
            health=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \"\$name\" 2>/dev/null || echo 'missing')
            if [ \"\$health\" != 'healthy' ]; then
                all_healthy=false
                break
            fi
        done
        if [ \"\$all_healthy\" = true ]; then
            break
        fi
        if [ \"\$i\" -eq 90 ]; then
            echo '❌ 健康检查超时'
            for service in \${DEPLOY_SERVICES}; do
                case \"\$service\" in
                    agent-service|author-site|screenshot-service) ;;
                    *) continue ;;
                esac
                check_container_healthy \"\$(container_for_service \"\$service\")\"
            done
            exit 1
        fi
        sleep 1
    done

    # 健康检查
    for service in \${DEPLOY_SERVICES}; do
        case \"\$service\" in
            agent-service|author-site|screenshot-service) ;;
            *) continue ;;
        esac
        check_container_healthy \"\$(container_for_service \"\$service\")\"
    done

    # API 端点检查（重试 30 秒）
    if service_in_deploy author-site; then
        for i in \$(seq 1 30); do
            if curl -fsS http://127.0.0.1:3200 >/dev/null 2>&1; then
                echo '✅ author-site 健康检查通过'
                break
            fi
            if [ \"\$i\" -eq 30 ]; then
                echo '❌ author-site 健康检查失败: http://127.0.0.1:3200'
                docker logs --tail=120 workbench-author-site-1 2>/dev/null || true
                exit 1
            fi
            sleep 1
        done
    fi

    if service_in_deploy agent-service; then
        for i in \$(seq 1 30); do
            if curl -fsS http://127.0.0.1:3201/health >/dev/null 2>&1; then
                echo '✅ agent-service 健康检查通过'
                break
            fi
            if [ \"\$i\" -eq 30 ]; then
                echo '❌ agent-service 健康检查失败: http://127.0.0.1:3201/health'
                docker logs --tail=120 workbench-agent-service-1 2>/dev/null || true
                exit 1
            fi
            sleep 1
        done
    fi

    if service_in_deploy author-site || service_in_deploy agent-service; then
        internal_api_token=\$(awk -F= '\$1 == \"INTERNAL_API_TOKEN\" { print substr(\$0, index(\$0, \"=\") + 1); exit }' .env.docker)
        if [ -z \"\$internal_api_token\" ]; then
            echo '❌ .env.docker 缺少 INTERNAL_API_TOKEN，管理后台模型配置无法同步到 agent-service'
            exit 1
        fi

        for i in \$(seq 1 30); do
            if curl -fsS -H \"x-internal-token: \${internal_api_token}\" http://127.0.0.1:3201/internal/backend-providers >/dev/null 2>&1; then
                echo '✅ agent-service 内部模型配置接口鉴权通过'
                break
            fi
            if [ \"\$i\" -eq 30 ]; then
                echo '❌ agent-service 内部模型配置接口鉴权失败，请确认 author-site 与 agent-service 使用同一个 INTERNAL_API_TOKEN'
                docker logs --tail=120 workbench-agent-service-1 2>/dev/null || true
                exit 1
            fi
            sleep 1
        done
    fi

    if service_in_deploy screenshot-service; then
        for i in \$(seq 1 30); do
            if curl -fsS http://127.0.0.1:3202/health >/dev/null 2>&1; then
                echo '✅ screenshot-service 健康检查通过'
                break
            fi
            if [ \"\$i\" -eq 30 ]; then
                echo '❌ screenshot-service 健康检查失败: http://127.0.0.1:3202/health'
                docker logs --tail=120 workbench-screenshot-service-1 2>/dev/null || true
                exit 1
            fi
            sleep 1
        done
    fi

    if service_in_deploy viewer-site; then
        for i in \$(seq 1 30); do
            if curl -fsS http://127.0.0.1:3300 >/dev/null 2>&1; then
                echo '✅ viewer-site 健康检查通过'
                break
            fi
            if [ \"\$i\" -eq 30 ]; then
                echo '❌ viewer-site 健康检查失败: http://127.0.0.1:3300'
                docker logs --tail=120 workbench-viewer-site-1 2>/dev/null || true
                exit 1
            fi
            sleep 1
        done
    fi
"

echo ""
echo -e "${GREEN}🎉 部署成功（含自检）！${NC}"
echo -e "访问地址: http://${SERVER_IP}:3200"
echo ""
echo -e "${YELLOW}📋 服务端口说明:${NC}"
echo -e "   author-site:       http://${SERVER_IP}:3200  (前端界面)"
echo -e "   agent-service:     http://${SERVER_IP}:3201  (Agent 服务)"
echo -e "   screenshot-service: http://${SERVER_IP}:3202  (截图服务)"
echo -e "   viewer-site:       http://${SERVER_IP}:3300  (预览端)"
