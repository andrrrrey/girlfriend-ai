FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter "api..."
RUN pnpm --filter "./packages/**" --if-present run build
RUN pnpm --filter "api" run build

# соберёт /out с node_modules только для api
RUN pnpm --filter "api" --prod deploy /out

# pnpm --prod deploy запускает postinstall (prisma generate) в контексте workspace
# (/app/apps/api), поэтому сгенерированный .prisma/client попадает в /app/node_modules,
# а не в /out/node_modules. Копируем сгенерированные файлы в production-деплой.
RUN pkg=$(ls /app/node_modules/.pnpm | grep -m1 '^@prisma+client@') && \
    cp -rL \
        "/app/node_modules/.pnpm/${pkg}/node_modules/.prisma" \
        "/out/node_modules/.pnpm/${pkg}/node_modules/"

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/ ./
EXPOSE 8080
CMD ["node", "dist/main.js"]