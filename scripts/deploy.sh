#!/bin/bash
set -e

# ================= 配置部分 =================
SERVER_IP="10.130.33.131"
SERVER_PORT="22"
SERVER_USER="root"
REMOTE_DIR="/opt/opencode-workbench"

# 本地路径
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${HOME}/.ssh/figma-mirror-deploy-key"
LOCAL_ENV_FILE="${PROJECT_DIR}/.env.docker"
DEPLOY_ENV_FILE="${PROJECT_DIR}/.deploy.env"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 开始一键部署流程...${NC}"

# ================= 0. 读取本地环境变量并生成部署环境文件 =================
if [ ! -f "${LOCAL_ENV_FILE}" ]; then
    echo -e "${RED}❌ 未找到环境变量文件: ${LOCAL_ENV_FILE}${NC}"
    echo -e "${YELLOW}   请复制 .env.docker 为模板并填写实际配置${NC}"
    exit 1
fi

read_env_value() {
    local key="$1"
    python3 - "${LOCAL_ENV_FILE}" "${key}" <<'PY'
import sys

env_path = sys.argv[1]
target_key = sys.argv[2]
value = ""
with open(env_path, "r", encoding="utf-8") as f:
    for raw_line in f:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        if key.strip() == target_key:
            value = val.strip().strip('"').strip("'")
            break
print(value)
PY
}

OPENCODE_PROVIDER_NAME="$(read_env_value "OPENCODE_PROVIDER_NAME")"
OPENCODE_API_KEY="$(read_env_value "OPENCODE_API_KEY")"
OPENCODE_API_BASE="$(read_env_value "OPENCODE_API_BASE")"
OPENCODE_MODELS="$(read_env_value "OPENCODE_MODELS")"
NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES="$(read_env_value "NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES")"
NEXT_PUBLIC_MODEL_NAME_FILTERS="$(read_env_value "NEXT_PUBLIC_MODEL_NAME_FILTERS")"
NEXT_PUBLIC_AGENT_SERVICE_URL="$(read_env_value "NEXT_PUBLIC_AGENT_SERVICE_URL")"
NEXT_PUBLIC_WEB_URL="$(read_env_value "NEXT_PUBLIC_WEB_URL")"
CORS_ORIGINS="$(read_env_value "CORS_ORIGINS")"
JWT_SECRET="$(read_env_value "JWT_SECRET")"
USE_SECURE_COOKIE="$(read_env_value "USE_SECURE_COOKIE")"

if [ -z "${OPENCODE_API_KEY}" ] || [ "${OPENCODE_API_KEY}" = "sk-your-api-key-here" ]; then
    echo -e "${RED}❌ .env.docker 中未配置 OPENCODE_API_KEY${NC}"
    exit 1
fi

if [ -z "${OPENCODE_API_BASE}" ] || [ "${OPENCODE_API_BASE}" = "https://api.example.com/v1" ]; then
    echo -e "${RED}❌ .env.docker 中未配置 OPENCODE_API_BASE${NC}"
    exit 1
fi

if [ -z "${OPENCODE_MODELS}" ] || [ "${OPENCODE_MODELS}" = "your-model-name" ]; then
    echo -e "${RED}❌ .env.docker 中未配置 OPENCODE_MODELS${NC}"
    exit 1
fi

# 生成部署环境文件
cat > "${DEPLOY_ENV_FILE}" <<EOF
OPENCODE_PROVIDER_NAME=${OPENCODE_PROVIDER_NAME:-custom}
OPENCODE_API_KEY=${OPENCODE_API_KEY}
OPENCODE_API_BASE=${OPENCODE_API_BASE}
OPENCODE_MODELS=${OPENCODE_MODELS}
NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=${NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES}
NEXT_PUBLIC_MODEL_NAME_FILTERS=${NEXT_PUBLIC_MODEL_NAME_FILTERS}
NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL}
NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}
CORS_ORIGINS=${CORS_ORIGINS}
JWT_SECRET=${JWT_SECRET}
USE_SECURE_COOKIE=${USE_SECURE_COOKIE:-false}
EOF

trap 'rm -f "${DEPLOY_ENV_FILE}"' EXIT
echo -e "${GREEN}✅ 已读取部署配置并生成环境文件${NC}"

# ================= 获取 Git 版本信息 =================
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo -e "${BLUE}📋 构建信息: commit=${GIT_COMMIT}, branch=${GIT_BRANCH}, time=${BUILD_TIME}${NC}"

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

rsync -avz --progress --delete \
    --exclude '/.git/' \
    --exclude '/.gitignore' \
    --exclude '/.agents/' \
    --exclude '/.env' \
    --exclude '/.env.docker' \
    --exclude '/.venv/' \
    --exclude '/node_modules/' \
    --exclude '/packages/*/node_modules/' \
    --exclude '/packages/author-site/.next/' \
    --exclude '/packages/viewer-site/.next/' \
    --exclude '/packages/agent-service/dist/' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.DS_Store' \
    --exclude '/docs/' \
    --exclude '/tests/' \
    --exclude 'deploy.sh' \
    -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    ./ \
    "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"

echo -e "${GREEN}✅ 代码同步完成${NC}"

# ================= 4. 远程构建并启动服务 =================
echo -e "${BLUE}🔄 [4/4] 远程构建并启动服务...${NC}"

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    set -e
    cd ${REMOTE_DIR}

    # 复制部署环境文件
    cp -f .deploy.env .env.docker

    # 构建并启动核心服务（不含 viewer-site）
    docker compose --env-file .env.docker build \
        --build-arg GIT_COMMIT='${GIT_COMMIT}' \
        --build-arg GIT_BRANCH='${GIT_BRANCH}' \
        --build-arg BUILD_TIME='${BUILD_TIME}' \
        opencode-serve agent-service author-site

    docker compose --env-file .env.docker up -d --force-recreate \
        opencode-serve agent-service author-site

    echo '✅ 核心服务已启动'
"

# ================= 5. 部署后自检 =================
echo -e "${BLUE}🩺 部署后自检...${NC}"

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    set -e
    cd ${REMOTE_DIR}

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
        for name in opencode-workbench-opencode-serve-1 opencode-workbench-agent-service-1 opencode-workbench-author-site-1; do
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
    check_container_running opencode-workbench-opencode-serve-1
    check_container_running opencode-workbench-agent-service-1
    check_container_running opencode-workbench-author-site-1

    # 等待健康检查（最多 90 秒）
    echo '⏳ 等待健康检查...'
    for i in \$(seq 1 90); do
        all_healthy=true
        for name in opencode-workbench-opencode-serve-1 opencode-workbench-agent-service-1 opencode-workbench-author-site-1; do
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
            for name in opencode-workbench-opencode-serve-1 opencode-workbench-agent-service-1 opencode-workbench-author-site-1; do
                check_container_healthy \"\$name\"
            done
            exit 1
        fi
        sleep 1
    done

    # 健康检查
    check_container_healthy opencode-workbench-opencode-serve-1
    check_container_healthy opencode-workbench-agent-service-1
    check_container_healthy opencode-workbench-author-site-1

    # API 端点检查（重试 30 秒）
    for i in \$(seq 1 30); do
        if curl -fsS http://127.0.0.1:3200 >/dev/null 2>&1; then
            echo '✅ author-site 健康检查通过'
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo '❌ author-site 健康检查失败: http://127.0.0.1:3200'
            docker logs --tail=120 opencode-workbench-author-site-1 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done

    for i in \$(seq 1 30); do
        if curl -fsS http://127.0.0.1:3201/health >/dev/null 2>&1; then
            echo '✅ agent-service 健康检查通过'
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo '❌ agent-service 健康检查失败: http://127.0.0.1:3201/health'
            docker logs --tail=120 opencode-workbench-agent-service-1 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done

    for i in \$(seq 1 30); do
        if curl -fsS http://127.0.0.1:4096/global/health >/dev/null 2>&1; then
            echo '✅ opencode-serve 健康检查通过'
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo '❌ opencode-serve 健康检查失败: http://127.0.0.1:4096/global/health'
            docker logs --tail=120 opencode-workbench-opencode-serve-1 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done
"

echo ""
echo -e "${GREEN}🎉 部署成功（含自检）！${NC}"
echo -e "访问地址: http://${SERVER_IP}:3200"
echo ""
echo -e "${YELLOW}📋 服务端口说明:${NC}"
echo -e "   author-site:    http://${SERVER_IP}:3200  (前端界面)"
echo -e "   agent-service:  http://${SERVER_IP}:3201  (Agent 服务)"
echo -e "   opencode-serve: http://${SERVER_IP}:4096  (LLM 服务)"
echo ""
echo -e "${YELLOW}💡 可选: 启动预览端 viewer-site:${NC}"
echo -e "   ssh ${SERVER_USER}@${SERVER_IP}"
echo -e "   cd ${REMOTE_DIR}"
echo -e "   docker compose --env-file .env.docker --profile viewer up -d viewer-site"
