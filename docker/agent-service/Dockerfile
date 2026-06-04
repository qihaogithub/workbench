FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-service/package.json ./packages/agent-service/

RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --no-frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/agent-service/ ./packages/agent-service/

RUN pnpm --filter @opencode-workbench/agent-service build:docker

FROM node:20-bookworm

WORKDIR /app

COPY --from=builder /app/packages/agent-service/dist/server.js ./server.js

# 安装 Chromium（Puppeteer 截图依赖）
RUN apt-get update && apt-get install -y \
  chromium \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --no-save fastify @fastify/cors @fastify/rate-limit @fastify/websocket pino pino-pretty undici ws eventsource puppeteer

EXPOSE 3201

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3201/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
