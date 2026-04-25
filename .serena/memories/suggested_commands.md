# Suggested Commands

## Setup
```bash
cp env.example .env           # copy env template (Docker mode)
cp env.local.example .env     # copy env template (local mode)
pnpm dev:setup                # install deps, build packages, generate Prisma client
```

## Development
```bash
pnpm dev                      # full stack in Docker (production-like)
pnpm dev:hot                  # Docker with hot reload (mounts source)
pnpm dev:local                # hybrid: infra in Docker, code runs locally
pnpm dev:infra                # start only infra (postgres, redis, minio, clickhouse)
pnpm dev:infra:down           # stop infra
pnpm dev:hot:down             # stop hot reload stack
pnpm dev:hot:reset            # stop + delete volumes + restart
```

## Per-service dev (local mode, from repo root)
```bash
pnpm --filter api dev         # NestJS API with watch
pnpm --filter web dev         # Next.js frontend on :3000
pnpm --filter ai dev          # Fastify AI service
pnpm --filter worker dev      # BullMQ worker
```

## Build
```bash
pnpm build                    # build all packages/apps
pnpm --filter api build       # build API only (nest build)
pnpm --filter web build       # build Next.js
pnpm -r --filter './packages/*' build  # build shared packages only
```

## Database
```bash
cd apps/api && npx prisma generate          # regenerate Prisma client
cd apps/api && npx prisma db seed           # seed: 5 characters + admin user
cd apps/api && npx prisma migrate dev       # create and apply new migration
pnpm migrate                                # run migrator service (production)
```

## Seed credentials
- Admin: `admin@example.com` / `admin123`

## Service URLs (dev)
- Web: http://localhost:3000
- API: http://localhost:8080
- AI Service: http://localhost:8081
- Swagger: http://localhost:8080/api/docs
- MinIO Console: http://localhost:9001
- ClickHouse: http://localhost:8123
- PostgreSQL: localhost:5433
- Redis: localhost:6379

## Scaling
```bash
docker compose up --scale api=3 --scale worker=5
```
