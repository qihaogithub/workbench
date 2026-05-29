FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/viewer-site/package.json ./packages/viewer-site/

RUN pnpm install --no-frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/viewer-site/ ./packages/viewer-site/

RUN pnpm --filter @opencode-workbench/viewer-site build

FROM nginx:alpine

COPY --from=builder /app/packages/viewer-site/out /usr/share/nginx/html
COPY docker/viewer-site/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
