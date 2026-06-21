FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/screenshot-service/package.json ./packages/screenshot-service/

RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --no-frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/screenshot-service/ ./packages/screenshot-service/

RUN pnpm --filter @opencode-workbench/screenshot-service build:docker

FROM node:20-bookworm

WORKDIR /app

COPY --from=builder /app/packages/screenshot-service/dist/server.js ./server.js

# 安装 Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm install --no-save fastify @fastify/cors pino pino-pretty puppeteer-core

EXPOSE 3202

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3202/health?deep=1').then(async r=>{const j=await r.json();process.exit(r.ok&&j.deepCheck?.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
