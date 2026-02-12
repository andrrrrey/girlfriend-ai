FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN pnpm -w install
RUN rm -rf apps/web/.next && pnpm --filter "./apps/web..." build
EXPOSE 3000
CMD ["pnpm","--filter","./apps/web...","start"]
