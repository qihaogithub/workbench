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

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/packages/viewer-site/.next/standalone ./
COPY --from=builder /app/packages/viewer-site/.next/static ./packages/viewer-site/.next/static

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3300').then(r=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "packages/viewer-site/server.js"]
