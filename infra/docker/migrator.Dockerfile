# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first — layer is cached until deps change
COPY package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml ./
COPY apps/migrator/package.json ./apps/migrator/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/logger/package.json ./packages/logger/package.json

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install only migrator and its workspace dependencies
RUN pnpm install --frozen-lockfile --filter "./apps/migrator..."

# Copy source and build
COPY apps/migrator ./apps/migrator
COPY packages ./packages
RUN pnpm --filter "./apps/migrator..." build

# Create isolated production deployment folder (inlines workspace packages, prod deps only)
RUN pnpm --filter "./apps/migrator" deploy /deploy --prod

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /deploy .

CMD ["node", "dist/index.js"]
