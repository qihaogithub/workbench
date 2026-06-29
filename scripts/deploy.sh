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

with open(out_path, "w", encoding="utf-8") as f:
    for key in order:
        f.write(f"{key}={values[key]}\n")
PY

trap 'rm -f "${DEPLOY_ENV_FILE}"' EXIT
echo -e "${GREEN}✅ 已从 .env.docker 生成部署环境文件${NC}"

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
    --exclude '/.codegraph/' \
    --exclude '/.env' \
    --exclude '/.env.docker' \
    --exclude '/.tmp/' \
    --exclude '/.pnpm-store/' \
    --exclude '/.venv/' \
    --exclude '/data/' \
    --exclude '/node_modules/' \
    --exclude '/OPS/CLI/dist/' \
    --exclude '/OPS/CLI/node_modules/' \
    --exclude '/packages/*/node_modules/' \
    --exclude '/packages/*/dist/' \
    --exclude '/packages/*/out/' \
    --exclude '/packages/*/tsconfig.tsbuildinfo' \
    --exclude '/packages/author-site/.next/' \
    --exclude '/packages/viewer-site/.next/' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '*.png' \
    --exclude '.DS_Store' \
    --exclude '/docs/' \
    --exclude '/test/' \
    --exclude '/tests/' \
    --exclude '/tmp/' \
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

    # 构建并启动全部服务
    docker compose --env-file .env.docker build \
        --build-arg GIT_COMMIT='${GIT_COMMIT}' \
        --build-arg GIT_BRANCH='${GIT_BRANCH}' \
        --build-arg BUILD_TIME='${BUILD_TIME}' \
        agent-service author-site screenshot-service viewer-site

    docker compose --env-file .env.docker up -d --force-recreate \
        agent-service author-site screenshot-service viewer-site

    echo '✅ 全部服务已启动'
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
        for name in opencode-workbench-agent-service-1 opencode-workbench-author-site-1 opencode-workbench-screenshot-service-1 opencode-workbench-viewer-site-1; do
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
    check_container_running opencode-workbench-agent-service-1
    check_container_running opencode-workbench-author-site-1
    check_container_running opencode-workbench-screenshot-service-1
    check_container_running opencode-workbench-viewer-site-1

    # 等待健康检查（最多 90 秒）
    echo '⏳ 等待健康检查...'
    for i in \$(seq 1 90); do
        all_healthy=true
        for name in opencode-workbench-agent-service-1 opencode-workbench-author-site-1 opencode-workbench-screenshot-service-1; do
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
            for name in opencode-workbench-agent-service-1 opencode-workbench-author-site-1 opencode-workbench-screenshot-service-1; do
                check_container_healthy \"\$name\"
            done
            exit 1
        fi
        sleep 1
    done

    # 健康检查
    check_container_healthy opencode-workbench-agent-service-1
    check_container_healthy opencode-workbench-author-site-1
    check_container_healthy opencode-workbench-screenshot-service-1

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
        if curl -fsS http://127.0.0.1:3202/health >/dev/null 2>&1; then
            echo '✅ screenshot-service 健康检查通过'
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo '❌ screenshot-service 健康检查失败: http://127.0.0.1:3202/health'
            docker logs --tail=120 opencode-workbench-screenshot-service-1 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done

    for i in \$(seq 1 30); do
        if curl -fsS http://127.0.0.1:3300 >/dev/null 2>&1; then
            echo '✅ viewer-site 健康检查通过'
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo '❌ viewer-site 健康检查失败: http://127.0.0.1:3300'
            docker logs --tail=120 opencode-workbench-viewer-site-1 2>/dev/null || true
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
echo -e "   author-site:       http://${SERVER_IP}:3200  (前端界面)"
echo -e "   agent-service:     http://${SERVER_IP}:3201  (Agent 服务)"
echo -e "   screenshot-service: http://${SERVER_IP}:3202  (截图服务)"
echo -e "   viewer-site:       http://${SERVER_IP}:3300  (预览端)"
