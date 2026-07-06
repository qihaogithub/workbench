# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/screenshot-service/package.json ./packages/screenshot-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    PUPPETEER_SKIP_DOWNLOAD=true pnpm install --store-dir /pnpm/store --no-frozen-lockfile

COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/shared/ ./packages/shared/
COPY packages/screenshot-service/ ./packages/screenshot-service/

RUN pnpm --filter @workbench/screenshot-service build:docker

FROM node:20-bookworm-slim

WORKDIR /app

# 安装 Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --no-save fastify @fastify/cors pino pino-pretty puppeteer-core

COPY --from=builder /app/packages/screenshot-service/dist/server.js ./server.js

EXPOSE 3202

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3202/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.js"]
