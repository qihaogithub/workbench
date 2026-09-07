FROM node:24-bookworm-slim AS builder

ARG DEBIAN_MIRROR=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY

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
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}

RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate \
    && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches/ ./patches/
COPY packages/knowledge-core/package.json ./packages/knowledge-core/
COPY packages/knowledge-service/package.json ./packages/knowledge-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --frozen-lockfile

COPY packages/knowledge-core/ ./packages/knowledge-core/
COPY packages/knowledge-service/ ./packages/knowledge-service/

RUN pnpm --filter @workbench/knowledge-service build:docker

FROM node:24-bookworm-slim AS runtime-deps

ARG DEBIAN_MIRROR=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY
ENV npm_config_registry=${NPM_REGISTRY}
ENV npm_config_disturl=https://npmmirror.com/mirrors/node
# Use the Node headers shipped in the base image when native prebuilds are unavailable.
ENV npm_config_nodedir=/usr/local

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

WORKDIR /app

RUN npm init -y \
    && npm install --registry="$NPM_REGISTRY" --omit=dev fastify@4.29.1 better-sqlite3@13.0.3 dotenv@17.4.2 \
    && npm cache clean --force

FROM node:24-bookworm-slim

WORKDIR /app

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/knowledge-service/dist/server.js ./server.js

EXPOSE 3203

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3203/health').then(async r=>r.ok&&(await r.json()).status==='ok'?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
