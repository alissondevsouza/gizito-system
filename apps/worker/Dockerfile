FROM oven/bun:1.3.11-slim AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
RUN bun install --frozen-lockfile --production --filter @gizito/worker

FROM oven/bun:1.3.11-slim AS runtime
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=dependencies /app /app
RUN bun run --cwd apps/worker browser:install --with-deps \
    && rm -rf /var/lib/apt/lists/*
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/integrations packages/integrations
COPY apps/worker apps/worker
USER bun
CMD ["bun", "apps/worker/src/index.ts"]
