FROM node:20-bookworm AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/knowledge-core/package.json ./packages/knowledge-core/
COPY packages/knowledge-service/package.json ./packages/knowledge-service/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --no-frozen-lockfile

COPY packages/knowledge-core/ ./packages/knowledge-core/
COPY packages/knowledge-service/ ./packages/knowledge-service/

RUN pnpm --filter @workbench/knowledge-service build:docker

FROM node:20-bookworm AS runtime-deps

WORKDIR /app

RUN npm init -y \
    && npm install --omit=dev fastify@4.29.1 better-sqlite3@12.11.1 \
    && npm cache clean --force

FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/knowledge-service/dist/server.js ./server.js

EXPOSE 3203

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3203/health').then(async r=>r.ok&&(await r.json()).status==='ok'?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
