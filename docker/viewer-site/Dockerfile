FROM node:24-bookworm-slim AS builder

ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY}

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    npm_config_disturl=https://npmmirror.com/mirrors/node

RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate \
    && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

ARG NEXT_PUBLIC_DATA_BASE=
ARG NEXT_PUBLIC_VIEWER_DOCKER_MODE=true
ARG NEXT_PUBLIC_AUTHOR_SITE_URL=http://localhost:3200

ENV NEXT_PUBLIC_DATA_BASE=${NEXT_PUBLIC_DATA_BASE}
ENV NEXT_PUBLIC_VIEWER_DOCKER_MODE=${NEXT_PUBLIC_VIEWER_DOCKER_MODE}
ENV NEXT_PUBLIC_AUTHOR_SITE_URL=${NEXT_PUBLIC_AUTHOR_SITE_URL}
ENV CI=true

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches/ ./patches/
COPY packages/agent-client/package.json ./packages/agent-client/
COPY packages/ai-chat-shared/package.json ./packages/ai-chat-shared/
COPY packages/demo-ui/package.json ./packages/demo-ui/
COPY packages/runtime-config/package.json ./packages/runtime-config/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/sketch-react/package.json ./packages/sketch-react/
COPY packages/shared/package.json ./packages/shared/
COPY packages/whiteboard-core/package.json ./packages/whiteboard-core/
COPY packages/viewer-site/package.json ./packages/viewer-site/
# The preview runtime generator reads the author site's canonical SDK policy,
# even though the viewer image only ships the static viewer output.
COPY packages/author-site/src/lib/preview-dependency-policy.ts ./packages/author-site/src/lib/preview-dependency-policy.ts

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --frozen-lockfile --ignore-scripts \
    && pnpm rebuild --store-dir /pnpm/store esbuild

COPY packages/agent-client/ ./packages/agent-client/
COPY packages/ai-chat-shared/ ./packages/ai-chat-shared/
COPY packages/demo-ui/ ./packages/demo-ui/
COPY packages/runtime-config/ ./packages/runtime-config/
COPY packages/sketch-core/ ./packages/sketch-core/
COPY packages/sketch-react/ ./packages/sketch-react/
COPY packages/shared/ ./packages/shared/
COPY packages/whiteboard-core/ ./packages/whiteboard-core/
COPY packages/viewer-site/ ./packages/viewer-site/
COPY scripts/ ./scripts/

RUN pnpm --filter @workbench/viewer-site build \
    && node scripts/check-browser-agent-url-bundle.mjs packages/viewer-site/out

FROM nginx:alpine

COPY --from=builder /app/packages/viewer-site/out /usr/share/nginx/html
COPY docker/viewer-site/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
