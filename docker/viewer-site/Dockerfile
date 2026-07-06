# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

ARG NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201
ARG NEXT_PUBLIC_DATA_BASE=

ENV NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL}
ENV NEXT_PUBLIC_DATA_BASE=${NEXT_PUBLIC_DATA_BASE}

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/demo-ui/package.json ./packages/demo-ui/
COPY packages/sketch-core/package.json ./packages/sketch-core/
COPY packages/sketch-react/package.json ./packages/sketch-react/
COPY packages/shared/package.json ./packages/shared/
COPY packages/viewer-site/package.json ./packages/viewer-site/

RUN --mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --no-frozen-lockfile

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
