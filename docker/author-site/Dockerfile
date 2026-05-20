FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# 构建时参数：前端模型白名单前缀（逗号分隔，如 "custom/,deepseek/"）
ARG NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=custom/

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-client/package.json ./packages/agent-client/
COPY packages/author-site/package.json ./packages/author-site/

RUN pnpm install --no-frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/agent-client/ ./packages/agent-client/
COPY packages/author-site/ ./packages/author-site/

RUN pnpm --filter @opencode-workbench/author-site build

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/packages/author-site/.next/standalone ./
COPY --from=builder /app/packages/author-site/.next/static ./packages/author-site/.next/static
COPY --from=builder /app/packages/author-site/public ./packages/author-site/public
COPY --from=builder /app/packages/author-site/scripts/init-db.js ./packages/author-site/scripts/init-db.js
# bcrypt 原生模块不在 standalone 输出中，需要从 builder 阶段复制
COPY --from=builder /app/node_modules/.pnpm/bcrypt@6.0.0/node_modules/bcrypt /app/node_modules/.pnpm/bcrypt@6.0.0/node_modules/bcrypt

EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3200').then(r=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "packages/author-site/server.js"]
