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
ENV npm_config_disturl=https://npmmirror.com/mirrors/node

RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate \
    && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches/ ./patches/
COPY packages/knowledge-core/package.json ./packages/knowledge-core/
COPY packages/knowledge-service/package.json ./packages/knowledge-service/
COPY packages/preview-contract/package.json ./packages/preview-contract/
COPY packages/project-core/package.json ./packages/project-core/
COPY packages/runtime-config/package.json ./packages/runtime-config/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/whiteboard-core/package.json ./packages/whiteboard-core/
COPY packages/agent-service/package.json ./packages/agent-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --frozen-lockfile --ignore-scripts

COPY packages/knowledge-core/ ./packages/knowledge-core/
COPY packages/knowledge-service/ ./packages/knowledge-service/
COPY packages/preview-contract/ ./packages/preview-contract/
COPY packages/project-core/ ./packages/project-core/
COPY packages/runtime-config/ ./packages/runtime-config/
COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/shared/ ./packages/shared/
COPY packages/whiteboard-core/ ./packages/whiteboard-core/
COPY packages/agent-service/ ./packages/agent-service/

RUN pnpm --filter @workbench/agent-service build:docker

FROM node:24-bookworm-slim

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG DEBIAN_MIRROR=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY
ENV npm_config_registry=${NPM_REGISTRY}
ENV npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
# The official Node image ships matching headers; use them instead of
# downloading from nodejs.org when node-gyp falls back to a native build.
ENV npm_config_nodedir=/usr/local

WORKDIR /app

# sharp 0.32.x is pulled transitively by @xenova/transformers. Its prebuilt
# binary endpoint is not consistently reachable from the test network, so keep
# the native build fallback available in the runtime image.
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

COPY --from=builder /app/packages/agent-service/dist/server.js ./server.js
COPY --from=builder /app/packages/agent-service/src/preinstalled-skills ./preinstalled-skills

RUN npm init -y \
    && npm pkg set 'overrides.sharp=0.35.3' \
    && npm install --no-save fastify @fastify/cors @fastify/multipart @fastify/rate-limit @fastify/websocket mammoth pdf-parse pino pino-pretty undici ws eventsource sharp@0.35.3 @xenova/transformers

EXPOSE 3201

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3201/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
