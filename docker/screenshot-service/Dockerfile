FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS builder

ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG DEBIAN_MIRROR=
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY}

RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      find /etc/apt -type f \( -name 'sources.list' -o -name '*.sources' \) -print0 \
        | xargs -0 sed -i \
          -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
          -e "s|http://deb.debian.org/debian-security|${DEBIAN_MIRROR}-security|g" \
          -e "s|http://security.debian.org/debian-security|${DEBIAN_MIRROR}-security|g"; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    npm_config_disturl=https://npmmirror.com/mirrors/node

RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate \
    && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches/ ./patches/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/project-core/package.json ./packages/project-core/
COPY packages/runtime-config/package.json ./packages/runtime-config/
COPY packages/preview-contract/package.json ./packages/preview-contract/
COPY packages/shared/package.json ./packages/shared/
COPY packages/whiteboard-core/package.json ./packages/whiteboard-core/
COPY packages/screenshot-service/package.json ./packages/screenshot-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    PUPPETEER_SKIP_DOWNLOAD=true pnpm install --store-dir /pnpm/store --frozen-lockfile

COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/project-core/ ./packages/project-core/
COPY packages/runtime-config/ ./packages/runtime-config/
COPY packages/preview-contract/ ./packages/preview-contract/
COPY packages/shared/ ./packages/shared/
COPY packages/whiteboard-core/ ./packages/whiteboard-core/
COPY packages/screenshot-service/ ./packages/screenshot-service/

RUN pnpm --filter @workbench/screenshot-service build:docker

FROM --platform=$TARGETPLATFORM node:24-bookworm-slim

WORKDIR /app

ARG DEBIAN_MIRROR=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY

# 安装 Chromium
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      find /etc/apt -type f \( -name 'sources.list' -o -name '*.sources' \) -print0 \
        | xargs -0 sed -i \
          -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
          -e "s|http://deb.debian.org/debian-security|${DEBIAN_MIRROR}-security|g" \
          -e "s|http://security.debian.org/debian-security|${DEBIAN_MIRROR}-security|g"; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --registry=https://registry.npmmirror.com --no-save fastify @fastify/cors @fastify/rate-limit pino pino-pretty puppeteer-core

COPY --from=builder /app/packages/screenshot-service/dist/server.js ./server.js

EXPOSE 3202

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3202/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.js"]
