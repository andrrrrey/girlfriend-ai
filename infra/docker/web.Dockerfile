# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy manifests first — layer is cached until deps change
COPY package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install only web and its dependencies
RUN pnpm install --frozen-lockfile --filter "./apps/web..."

# Copy source and build
COPY apps/web ./apps/web
RUN pnpm --filter "./apps/web" build

# Create isolated production deployment folder (prod deps only)
# pnpm deploy copies the built .next/ directory along with package files
RUN pnpm --filter "./apps/web" deploy /deploy --prod

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /deploy .

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
