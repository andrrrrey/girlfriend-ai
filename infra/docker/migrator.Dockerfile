FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/migrator ./apps/migrator
COPY apps/api ./apps/api
COPY packages ./packages
# Install both migrator and api deps — api brings in the prisma CLI (devDep)
RUN pnpm install --frozen-lockfile --filter ./apps/migrator... --filter ./apps/api...
RUN pnpm --filter ./apps/migrator... build
# No pnpm prune: prisma is in api's devDependencies and must stay for migrate deploy
RUN rm -rf apps/migrator/src packages/config/src packages/logger/src

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/migrator ./apps/migrator
# Needed for prisma schema, migrations, and local node_modules/.bin/prisma
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
CMD ["node", "apps/migrator/dist/index.js"]
