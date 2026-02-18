FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/ai ./apps/ai
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter ./apps/ai...
RUN pnpm --filter ./apps/ai... build
RUN pnpm prune --production
RUN rm -rf apps/ai/src packages/config/src packages/logger/src packages/types/src

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/ai ./apps/ai
COPY --from=builder /app/packages ./packages
EXPOSE 8081
CMD ["node", "apps/ai/dist/index.js"]
