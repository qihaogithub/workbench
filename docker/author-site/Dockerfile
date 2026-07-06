# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# 构建时参数：前端模型白名单前缀（逗号分隔，如 "custom/,deepseek/"）
ARG NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=custom/
ARG NEXT_PUBLIC_MODEL_BLACKLIST=
ARG NEXT_PUBLIC_DEFAULT_MODEL_IDS=
ARG NEXT_PUBLIC_MODEL_NAME_FILTERS=
ARG NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201
ARG NEXT_PUBLIC_SCREENSHOT_SERVICE_URL=http://localhost:3202

ENV NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=${NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES}
ENV NEXT_PUBLIC_MODEL_BLACKLIST=${NEXT_PUBLIC_MODEL_BLACKLIST}
ENV NEXT_PUBLIC_DEFAULT_MODEL_IDS=${NEXT_PUBLIC_DEFAULT_MODEL_IDS}
ENV NEXT_PUBLIC_MODEL_NAME_FILTERS=${NEXT_PUBLIC_MODEL_NAME_FILTERS}
ENV NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL}
ENV NEXT_PUBLIC_SCREENSHOT_SERVICE_URL=${NEXT_PUBLIC_SCREENSHOT_SERVICE_URL}

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/agent-client/package.json ./packages/agent-client/
COPY packages/demo-ui/package.json ./packages/demo-ui/
COPY packages/knowledge-core/package.json ./packages/knowledge-core/
COPY packages/knowledge-service/package.json ./packages/knowledge-service/
COPY packages/preview-contract/package.json ./packages/preview-contract/
COPY packages/project-core/package.json ./packages/project-core/
COPY packages/project-scaffold/package.json ./packages/project-scaffold/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/sketch-react/package.json ./packages/sketch-react/
COPY packages/shared/package.json ./packages/shared/
COPY packages/author-site/package.json ./packages/author-site/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --no-frozen-lockfile

COPY packages/agent-client/ ./packages/agent-client/
COPY packages/demo-ui/ ./packages/demo-ui/
COPY packages/knowledge-core/ ./packages/knowledge-core/
COPY packages/knowledge-service/ ./packages/knowledge-service/
COPY packages/preview-contract/ ./packages/preview-contract/
COPY packages/project-core/ ./packages/project-core/
COPY packages/project-scaffold/ ./packages/project-scaffold/
COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/sketch-react/ ./packages/sketch-react/
COPY packages/shared/ ./packages/shared/
COPY packages/author-site/ ./packages/author-site/
COPY scripts/ ./scripts/

RUN pnpm --filter @workbench/author-site build

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
