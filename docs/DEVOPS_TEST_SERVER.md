# Требования к тестовому серверу

## Минимальные системные требования

- **ОС:** Ubuntu 22.04+ / Debian 12+
- **CPU:** 2 vCPU
- **RAM:** 4 GB (рекомендуется 8 GB)
- **Диск:** 40 GB SSD
- **Сеть:** публичный IP или доступ через VPN

## Необходимое ПО

| Компонент       | Версия   |
|-----------------|----------|
| Docker          | 24+      |
| Docker Compose  | v2+      |
| Node.js         | 20 LTS   |
| pnpm            | 9.x      |
| Git             | 2.x      |

## Сервисы, которые поднимает docker-compose

| Сервис      | Образ                             | Порт (host → container) | Назначение                        |
|-------------|-----------------------------------|--------------------------|-----------------------------------|
| PostgreSQL  | `postgres:16`                     | 5433 → 5432             | Основная БД                       |
| Redis       | `redis:7`                         | 6379 → 6379             | Кэш, очереди задач (BullMQ)      |
| ClickHouse  | `clickhouse/clickhouse-server:24` | 8123, 9000               | Аналитика                         |
| MinIO       | `minio/minio:latest`              | 9002 → 9000 (API), 9001 (Console) | S3-совместимое хранилище |

## Приложения (собираются из исходников)

| Сервис   | Фреймворк | Порт | Описание                  |
|----------|-----------|------|---------------------------|
| web      | Next.js   | 3000 | Фронтенд                  |
| api      | NestJS    | 8080 | REST API                   |
| ai       | Fastify   | 8081 | Сервис интеграции с LLM    |
| worker   | BullMQ    | —    | Фоновые задачи             |
| migrator | Prisma    | —    | Миграции БД (запуск → выход)|

## Порты, которые нужно открыть

- **3000** — фронтенд (web)
- **8080** — API
- **8081** — AI-сервис
- **5433** — PostgreSQL (только для внутреннего доступа / дебага)
- **6379** — Redis (только внутренний)
- **8123** — ClickHouse HTTP (только внутренний)
- **9001** — MinIO Console (только внутренний)

> На проде наружу выставлять только 80/443 через reverse proxy. На тестовом сервере можно открыть 3000 и 8080 напрямую.

## Переменные окружения

Скопировать `env.example` в `.env` и заполнить:

```bash
cp env.example .env
```

Ключевые переменные:

```env
ENV=development

# БД
DATABASE_URL=postgresql://app:app@postgres:5432/app?schema=public

# Redis
REDIS_URL=redis://redis:6379/0

# ClickHouse
CLICKHOUSE_URL=http://clickhouse:8123

# S3 / MinIO
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=media

# Auth
JWT_SECRET=<сгенерировать_случайный_ключ>
JWT_TTL_SECONDS=604800

# Логирование
LOG_LEVEL=info
LOG_FORMAT=json
```

> **Важно:** на тестовом сервере обязательно сменить `JWT_SECRET` и пароли MinIO/PostgreSQL.

## Запуск

```bash
# 1. Клонировать репо
git clone <repo-url> && cd girlfriend-ai

# 2. Скопировать и настроить .env
cp env.example .env

# 3. Поднять всё через Docker Compose
pnpm dev
# или напрямую:
docker compose -f infra/compose/docker-compose.dev.yml up --build -d
```

### Порядок старта (docker-compose обеспечивает автоматически)

1. PostgreSQL + Redis запускаются первыми
2. Migrator ждёт готовности PostgreSQL, прогоняет миграции и завершается
3. API стартует после миграций
4. AI и Worker стартуют после Redis
5. Web стартует после API

## Логирование

Все сервисы пишут структурированные JSON-логи (Pino). Формат:

```json
{"level":"info","ts":"2026-02-17T12:00:00.000Z","service":"api","env":"development","msg":"server_started"}
```

Готово к интеграции с ELK / Loki / Datadog.

## Что НЕ нужно

- Kubernetes — для теста хватит одного docker-compose
- Nginx/Traefik — на тестовом можно обращаться к сервисам напрямую по портам
- CI/CD — деплой на тестовый можно делать через `git pull && docker compose up --build -d`
- SSL — на тестовом не обязателен (если доступ через VPN)
