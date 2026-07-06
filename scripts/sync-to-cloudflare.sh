#!/bin/bash
set -e

VIEWER_OUT_DIR="packages/viewer-site/out"
PUBLISHED_DIR="data/published"
DEPLOY_DIR="/tmp/viewer-deploy"

if [ ! -d "$VIEWER_OUT_DIR" ]; then
  echo "错误: viewer-site 构建产物不存在，请先运行 pnpm build:viewer"
  exit 1
fi

if [ ! -d "$PUBLISHED_DIR" ]; then
  echo "错误: 发布数据目录不存在 ($PUBLISHED_DIR)"
  exit 1
fi

rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

cp -r "$VIEWER_OUT_DIR"/* "$DEPLOY_DIR/"

mkdir -p "$DEPLOY_DIR/data"
cp -r "$PUBLISHED_DIR"/* "$DEPLOY_DIR/data/"

if [ -f "$DEPLOY_DIR/data/projects-index.json" ]; then
  mv "$DEPLOY_DIR/data/projects-index.json" "$DEPLOY_DIR/data/projects.json"
fi

cat > "$DEPLOY_DIR/_headers" << 'EOF'
/data/*
  Cache-Control: public, must-revalidate
  Access-Control-Allow-Origin: *

/data/*/demos/*.js
  Cache-Control: public, immutable
  Access-Control-Allow-Origin: *

/data/*/demos/*.html
  Cache-Control: public, immutable
  Access-Control-Allow-Origin: *

/*.html
  Cache-Control: no-cache, must-revalidate

/_next/static/*
  Cache-Control: public, immutable
EOF

CLOUDFLARE_PROJECT_NAME="${CLOUDFLARE_PROJECT_NAME:-workbench-viewer}"

npx wrangler pages deploy "$DEPLOY_DIR" \
  --project-name="$CLOUDFLARE_PROJECT_NAME" \
  --commit-dirty=true

echo "Cloudflare Pages 部署完成"

rm -rf "$DEPLOY_DIR"
