FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/migrator ./apps/migrator
COPY apps/api/prisma ./apps/api/prisma
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter "migrator..."
RUN pnpm -r --filter "./packages/**" --if-present run build
RUN pnpm --filter "migrator" run build

RUN pnpm --filter "migrator" --prod deploy /out
RUN cp -R ./apps/api/prisma /out/prisma

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/ ./
CMD ["node", "dist/index.js"]
