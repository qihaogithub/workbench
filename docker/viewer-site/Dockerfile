FROM node:20-bookworm-slim AS builder

ARG NPM_REGISTRY=https://registry.npmmirror.com

RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate \
    && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

ARG NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201
ARG NEXT_PUBLIC_DATA_BASE=
ARG NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=custom/
ARG NEXT_PUBLIC_MODEL_BLACKLIST=
ARG NEXT_PUBLIC_DEFAULT_MODEL_IDS=
ARG NEXT_PUBLIC_MODEL_NAME_FILTERS=

ENV NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL}
ENV NEXT_PUBLIC_DATA_BASE=${NEXT_PUBLIC_DATA_BASE}
ENV NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=${NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES}
ENV NEXT_PUBLIC_MODEL_BLACKLIST=${NEXT_PUBLIC_MODEL_BLACKLIST}
ENV NEXT_PUBLIC_DEFAULT_MODEL_IDS=${NEXT_PUBLIC_DEFAULT_MODEL_IDS}
ENV NEXT_PUBLIC_MODEL_NAME_FILTERS=${NEXT_PUBLIC_MODEL_NAME_FILTERS}
ENV CI=true

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/agent-client/package.json ./packages/agent-client/
COPY packages/ai-chat-shared/package.json ./packages/ai-chat-shared/
COPY packages/demo-ui/package.json ./packages/demo-ui/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/sketch-react/package.json ./packages/sketch-react/
COPY packages/shared/package.json ./packages/shared/
COPY packages/viewer-site/package.json ./packages/viewer-site/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --no-frozen-lockfile --ignore-scripts \
    && pnpm rebuild --store-dir /pnpm/store esbuild

COPY packages/agent-client/ ./packages/agent-client/
COPY packages/ai-chat-shared/ ./packages/ai-chat-shared/
COPY packages/demo-ui/ ./packages/demo-ui/
COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/sketch-react/ ./packages/sketch-react/
COPY packages/shared/ ./packages/shared/
COPY packages/viewer-site/ ./packages/viewer-site/
COPY scripts/ ./scripts/

RUN pnpm --filter @workbench/viewer-site build

FROM nginx:alpine

COPY --from=builder /app/packages/viewer-site/out /usr/share/nginx/html
COPY docker/viewer-site/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
