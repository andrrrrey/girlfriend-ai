FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/migrator ./apps/migrator
# Only prisma schema/migrations from api — no NestJS, no @prisma/client
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
COPY packages ./packages
# prisma CLI comes from migrator devDependencies — no need to install full apps/api
RUN pnpm install --frozen-lockfile --filter ./apps/migrator... --filter "./packages/**"
RUN pnpm --filter "./packages/**" --if-present run build
RUN pnpm --filter ./apps/migrator build
RUN rm -rf apps/migrator/src packages/config/src packages/logger/src

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/migrator ./apps/migrator
# Only prisma schema/migrations — not the full api app
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages
CMD ["node", "apps/migrator/dist/index.js"]
