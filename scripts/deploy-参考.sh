#!/bin/bash
set -e

# ================= 配置部分 =================
SERVER_IP="10.130.33.131"
SERVER_PORT="22"
SERVER_USER="root"
REMOTE_DIR="/opt/1panel/apps/figma-mirror"

# 本地路径
# scripts/deploy.sh -> scripts -> project_root
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${HOME}/.ssh/figma-mirror-deploy-key"
LOCAL_ENV_FILE="${PROJECT_DIR}/.env"
DEPLOY_ENV_FILE="${PROJECT_DIR}/.deploy.env"

# Cloudflare Tunnel 配置
CLOUDFLARE_TUNNEL_ENABLED=false  # 设置为 true 启用自动部署 Tunnel
CLOUDFLARE_TUNNEL_TOKEN=""  # 从 .env 读取

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 开始一键部署流程...${NC}"

# ================= 0. 读取本地密钥并生成部署环境文件 =================
if [ ! -f "${LOCAL_ENV_FILE}" ]; then
    echo "❌ 未找到本地 .env 文件: ${LOCAL_ENV_FILE}"
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

LOCAL_SYNC_API_KEY="$(read_env_value "LOCAL_SYNC_API_KEY")"
PROXY_SECRET="$(read_env_value "PROXY_SECRET")"
FIGMA_TOKEN="$(read_env_value "FIGMA_TOKEN")"
CLOUDFLARE_TUNNEL_ENABLED="$(read_env_value "CLOUDFLARE_TUNNEL_ENABLED")"
CLOUDFLARE_TUNNEL_TOKEN="$(read_env_value "CLOUDFLARE_TUNNEL_TOKEN")"

if [ -z "${LOCAL_SYNC_API_KEY}" ]; then
    echo "❌ .env 中未配置 LOCAL_SYNC_API_KEY 或值为空"
    exit 1
fi

if [ -z "${FIGMA_TOKEN}" ]; then
    echo "❌ .env 中未配置 FIGMA_TOKEN 或值为空"
    exit 1
fi

# 生成部署环境文件
cat > "${DEPLOY_ENV_FILE}" <<EOF
LOCAL_SYNC_API_KEY=${LOCAL_SYNC_API_KEY}
PROXY_SECRET=${PROXY_SECRET}
FIGMA_TOKEN=${FIGMA_TOKEN}
EOF

# 如果启用了 Cloudflare Tunnel,添加到环境文件
if [ "${CLOUDFLARE_TUNNEL_ENABLED}" = "true" ] && [ -n "${CLOUDFLARE_TUNNEL_TOKEN}" ]; then
    echo "CLOUDFLARE_TUNNEL_ENABLED=true" >> "${DEPLOY_ENV_FILE}"
    echo "CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}" >> "${DEPLOY_ENV_FILE}"
    echo -e "${GREEN}✅ Cloudflare Tunnel 已启用${NC}"
else
    echo -e "${YELLOW}⚠️  Cloudflare Tunnel 未启用 (设置 CLOUDFLARE_TUNNEL_ENABLED=true 启用)${NC}"
fi

trap 'rm -f "${DEPLOY_ENV_FILE}"' EXIT
echo -e "${GREEN}✅ 已读取部署密钥并生成部署环境文件${NC}"

# ================= 获取 Git 版本信息 =================
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo -e "${BLUE}📋 构建信息: commit=${GIT_COMMIT}, branch=${GIT_BRANCH}, time=${BUILD_TIME}${NC}"

# ================= 1. 前端构建 =================
echo -e "${BLUE}📦 [1/4] 正在本地构建前端 (Vite)...${NC}"
cd "${PROJECT_DIR}/src/frontend"
# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi
# 构建
npm run build
echo -e "${GREEN}✅ 前端构建完成！${NC}"

# ================= 2. 检查 SSH Key =================
if [ ! -f "${SSH_KEY}" ]; then
    echo "⚠️ SSH 私钥不存在，尝试生成 (如果您已有其他 key 请自行修改脚本)..."
    # 这里为了演示，如果是首次运行可能需要用户手动配置免密
    # 建议用户手动配置 ssh config，或者首次手动 ssh-copy-id
    echo "❌ 请先配置 SSH 免密登录，确保 ssh root@${SERVER_IP} 可以直接连接"
    exit 1
fi

# ================= 3. 预检远程 Docker 镜像源 =================
echo -e "${BLUE}🔍 [2/5] 正在检查远程 Docker 镜像源配置...${NC}"

REMOTE_DAEMON_JSON="$(ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    if [ -f /etc/docker/daemon.json ]; then
        cat /etc/docker/daemon.json
    fi
")"

if echo "${REMOTE_DAEMON_JSON}" | grep -q 'docker.mirrors.ustc.edu.cn'; then
    echo "❌ 检测到远程 Docker 仍在使用已失效的镜像源: docker.mirrors.ustc.edu.cn"
    echo "请先在服务器上修复 /etc/docker/daemon.json 后重试部署。"
    echo ""
    echo "可参考以下命令移除失效镜像源配置："
    echo "ssh -p ${SERVER_PORT} -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP}"
    echo "cp /etc/docker/daemon.json /etc/docker/daemon.json.bak"
    echo "python3 - <<'PY'"
    echo "import json"
    echo "from pathlib import Path"
    echo "path = Path('/etc/docker/daemon.json')"
    echo "data = json.loads(path.read_text()) if path.exists() else {}"
    echo "mirrors = [m for m in data.get('registry-mirrors', []) if 'docker.mirrors.ustc.edu.cn' not in m]"
    echo "if mirrors:"
    echo "    data['registry-mirrors'] = mirrors"
    echo "else:"
    echo "    data.pop('registry-mirrors', None)"
    echo "path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\\n')"
    echo "PY"
    echo "systemctl restart docker"
    echo ""
    echo "请修复服务器 Docker 镜像源后重试部署。"
    exit 1
fi

echo -e "${GREEN}✅ 远程 Docker 镜像源检查通过${NC}"

# ================= 4. 同步文件 (Rsync) =================
# 使用 rsync 增量同步，比 scp 快得多
# 排除 .git, node_modules, 所有的 data 目录(防止覆盖服务器数据)
echo -e "${BLUE}🔄 [3/5] 正在同步代码到服务器 (${SERVER_IP})...${NC}"
cd "${PROJECT_DIR}"

rsync -avz --progress --delete \
    --exclude '/.git/' \
    --exclude '/.gitignore' \
    --exclude '/.agents/' \
    --exclude '/.env' \
    --exclude '/.venv/' \
    --exclude '/node_modules/' \
    --exclude '/src/frontend/node_modules/' \
    --exclude '/src/frontend/.vite/' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.pytest_cache' \
    --exclude '.mypy_cache' \
    --exclude '.ruff_cache' \
    --exclude '*.tsbuildinfo' \
    --exclude '.DS_Store' \
    --exclude '/data/' \
    --exclude '/pgdata/' \
    --exclude '/redisdata/' \
    --exclude '/logs/' \
    --exclude '/venv/' \
    --exclude '/docs/' \
    --exclude '/tests/' \
    --exclude '/run/' \
    --exclude '/workers/' \
    --exclude '/figma-local-sync/' \
    --exclude '/test_download/' \
    --exclude '/backup.sql' \
    --exclude '/deploy.sh' \
    -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    ./ \
    "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"

echo -e "${GREEN}✅ 代码同步完成！${NC}"

# ================= 5. 重启服务 =================
echo -e "${BLUE}🔄 [4/5] 正在重启远程服务...${NC}"

# 只重启 python 容器，不需要重启数据库和 redis
ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    set -e
    cd ${REMOTE_DIR}
    # 确保目录结构正确 (防止新建文件夹权限问题)
    mkdir -p data/shared_images logs

    # 修复 shared_images 中 0600 权限的文件（tempfile.NamedTemporaryFile 创建的文件默认权限）
    # 这些文件通过 os.replace 移动到共享目录时保留了 0600 权限，导致 nginx 无法读取
    echo '🔧 修复 shared_images 文件权限...'
    find data/shared_images -type f -perm 600 -exec chmod 644 {} \; 2>/dev/null || true
    fixed_count=\$(find data/shared_images -type f -perm 600 2>/dev/null | wc -l)
    echo \"✅ 权限修复完成，剩余 0600 文件: \$fixed_count\"

    # 需要显式 --build：alembic.ini / alembic 这类打进镜像的文件不会被 bind mount 更新
    # 仅 force-recreate 会继续复用旧镜像，导致迁移命令仍读到旧配置
    # 这里只重建 Python 服务，避免无意义触发 postgres/redis 的等待与重建流程
    # 先构建镜像（注入版本信息），再启动容器
    docker-compose --env-file .deploy.env build \
        --build-arg GIT_COMMIT="${GIT_COMMIT}" \
        --build-arg GIT_BRANCH="${GIT_BRANCH}" \
        --build-arg BUILD_TIME="${BUILD_TIME}" \
        app worker-sync worker-image worker-image-convert worker-team-cache
    docker-compose --env-file .deploy.env up -d --force-recreate \
        nginx app worker-sync worker-image worker-image-convert worker-team-cache

    # 执行数据库迁移，确保部署后数据库结构与代码一致
    # 不允许用 alembic stamp 跳过真实 DDL；迁移后必须验证关键列已经落库。
    docker exec -w /app figma_mirror_app python -m alembic -c /app/alembic.ini upgrade head
    docker exec -w /app figma_mirror_app python -m alembic -c /app/alembic.ini current

    if ! docker exec figma_mirror_db psql -U postgres -d figma_mirror -tAc 'SELECT 1 FROM information_schema.columns WHERE table_name = '\''sync_jobs'\'' AND column_name = '\''parent_job_id'\'' LIMIT 1;' | grep -q '^1$'; then
        echo \"❌ 数据库迁移后仍缺少 sync_jobs.parent_job_id，疑似历史错误 stamp 导致 DDL 被跳过\"
        echo \"请在服务器上执行：docker exec -w /app figma_mirror_app python -m alembic -c /app/alembic.ini current\"
        echo \"并核对 alembic_version 与 sync_jobs 表结构后再继续\"
        exit 1
    fi
    echo \"✅ sync_jobs.parent_job_id 已存在\"
"

echo -e "${BLUE}🩺 [5/5] 正在执行部署后自检...${NC}"

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
    set -e
    cd ${REMOTE_DIR}

    check_container_running() {
        local name=\"\$1\"
        local status
        status=\$(docker inspect -f '{{.State.Status}}' \"\$name\" 2>/dev/null || echo 'missing')
        if [ \"\$status\" != \"running\" ]; then
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
        if [ \"\$health\" != \"healthy\" ]; then
            echo \"❌ 容器健康检查失败: \$name (health=\$health)\"
            docker logs --tail=80 \"\$name\" 2>/dev/null || true
            exit 1
        fi
        echo \"✅ 容器健康正常: \$name\"
    }

    check_container_running figma_mirror_nginx
    check_container_running figma_mirror_app
    check_container_running figma_mirror_sync
    check_container_running figma_mirror_image
    check_container_running figma_mirror_image_convert
    check_container_running figma_mirror_team_cache

    check_container_healthy figma_mirror_db
    check_container_healthy figma_mirror_redis

    # API 健康检查重试（最多 30 秒）
    for i in \$(seq 1 30); do
        if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
            echo \"✅ API 健康检查通过\"
            break
        fi
        if [ \"\$i\" -eq 30 ]; then
            echo \"❌ API 健康检查失败: http://127.0.0.1:8000/health\"
            docker logs --tail=120 figma_mirror_app 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done

    # 数据库可读性检查
    if ! docker exec figma_mirror_db psql -U postgres -d figma_mirror -c 'SELECT 1;' >/dev/null 2>&1; then
        echo \"❌ 数据库查询失败\"
        docker logs --tail=80 figma_mirror_db 2>/dev/null || true
        exit 1
    fi
    echo \"✅ 数据库查询正常\"

    if ! docker exec -w /app figma_mirror_app sh -lc '
        set -e

        test -f /app/alembic.ini
        echo \"✅ Alembic 配置文件存在\"

        test -d /app/alembic
        echo \"✅ Alembic 迁移目录存在\"

        python -m alembic -c /app/alembic.ini current >/dev/null 2>&1
        echo \"✅ Alembic 当前版本检查通过\"

        python -c \"import os,sys;sys.exit(0 if os.getenv(\\\"LOCAL_SYNC_API_KEY\\\") else 1)\"
        echo \"✅ LOCAL_SYNC_API_KEY 已注入容器\"
    ' >/dev/null 2>&1; then
        echo \"❌ figma_mirror_app 容器内部署自检失败\"
        docker logs --tail=80 figma_mirror_app 2>/dev/null || true
        exit 1
    fi
    echo \"✅ figma_mirror_app 容器内部署自检通过\"
"

echo -e "${GREEN}🎉 部署成功（含自检）！${NC}"
echo -e "访问地址: http://${SERVER_IP}:8000"

# ================= 6. 部署 Cloudflare Tunnel (如果启用) =================
if [ "${CLOUDFLARE_TUNNEL_ENABLED}" = "true" ] && [ -n "${CLOUDFLARE_TUNNEL_TOKEN}" ]; then
    echo ""
    echo -e "${BLUE}🌐 [6/6] 正在部署 Cloudflare Tunnel...${NC}"

    ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_IP}" "
        set -e
        cd ${REMOTE_DIR}

        echo '📦 检查 Docker 状态...'
        if ! docker info >/dev/null 2>&1; then
            echo '❌ Docker 未运行或无权限'
            exit 1
        fi
        echo '✅ Docker 运行正常'

        echo '🛑 停止旧的 cloudflared 容器 (如果有)...'
        docker rm -f cloudflared 2>/dev/null || true

        echo '🚀 启动 Cloudflare Tunnel 容器...'
        docker run -d \\
          --name cloudflared \\
          --restart unless-stopped \\
          --network host \\
          cloudflare/cloudflared:latest \\
          tunnel --no-autoupdate run \\
          --token '${CLOUDFLARE_TUNNEL_TOKEN}'

        echo '⏳ 等待容器启动...'
        sleep 5

        if docker ps | grep -q cloudflared; then
            echo '✅ cloudflared 容器运行正常'
        else
            echo '❌ cloudflared 容器启动失败'
            docker logs cloudflared 2>/dev/null || true
            exit 1
        fi
    "

    echo ""
    echo -e "${GREEN}✅ Cloudflare Tunnel 部署成功!${NC}"
    echo -e "🌐 公网访问: https://figma-mirror.onlywnn.cn"
    echo -e "📝 OAuth 回调: https://figma-mirror.onlywnn.cn/api/oauth/callback"
else
    echo ""
    echo -e "${YELLOW}⚠️  跳过 Cloudflare Tunnel 部署${NC}"
    echo -e "   如需启用,请在 .env 中设置:"
    echo -e "   CLOUDFLARE_TUNNEL_ENABLED=true"
    echo -e "   CLOUDFLARE_TUNNEL_TOKEN=你的token"
fi
