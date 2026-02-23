FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/ai ./apps/ai
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter "ai..."
RUN pnpm -r --filter "./packages/**" --if-present run build
RUN pnpm --filter "ai" run build

RUN pnpm --filter "ai" --prod deploy /out

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/ ./
EXPOSE 8081
CMD ["node", "dist/index.js"]
