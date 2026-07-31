FROM node:20-bookworm-slim AS builder

ARG DEBIAN_MIRROR=

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
ENV npm_config_disturl=https://npmmirror.com/mirrors/node

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/knowledge-core/package.json ./packages/knowledge-core/
COPY packages/knowledge-service/package.json ./packages/knowledge-service/
COPY packages/preview-contract/package.json ./packages/preview-contract/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-service/package.json ./packages/agent-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --no-frozen-lockfile

COPY packages/knowledge-core/ ./packages/knowledge-core/
COPY packages/knowledge-service/ ./packages/knowledge-service/
COPY packages/preview-contract/ ./packages/preview-contract/
COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/shared/ ./packages/shared/
COPY packages/agent-service/ ./packages/agent-service/

RUN pnpm --filter @workbench/agent-service build:docker

FROM node:20-bookworm-slim

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=${NPM_REGISTRY}

WORKDIR /app

COPY --from=builder /app/packages/agent-service/dist/server.js ./server.js
COPY --from=builder /app/packages/agent-service/src/preinstalled-skills ./preinstalled-skills

RUN npm install --no-save fastify @fastify/cors @fastify/multipart @fastify/rate-limit @fastify/websocket mammoth pdf-parse pino pino-pretty undici ws eventsource

EXPOSE 3201

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3201/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
