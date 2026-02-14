# Girlfriend AI Platform

Масштабируемая платформа AI-персонажей с диалоговым интерфейсом, генерацией контента, хранением контекста и микросервисной архитектурой.

Проект строю как production-ready систему для создания и взаимодействия с AI-персонажами — с полноценным фронтендом, бэкендом, фоновой обработкой задач и инфраструктурой, готовой к горизонтальному масштабированию.

---

## Что умеет платформа

- **Каталог персонажей** — главная страница с сеткой карточек, фильтрацией по тегам (Romantic, Athletic, Caring и др.), поиском и пагинацией
- **Чат** — мультичат-интерфейс с панелью диалогов, сообщениями, профилем персонажа в боковой панели и генерацией изображений внутри чата
- **Генерация фото/видео** — вкладки фото и видео, управление сценами, выбор персонажа, позы, фона, декораций, галерея с управлением результатами
- **Профиль пользователя** — управление аккаунтом (email, пароль, никнейм), привязка соцсетей (VK, Instagram, X), подписки (Basic/Premium), настройка предпочтений
- **Фоновая обработка задач** через BullMQ
- **S3-хранилище** для медиафайлов
- **Аналитика** через ClickHouse
- **JWT-авторизация**

---

## Архитектура

Платформа реализована как набор stateless-микросервисов:

| Сервис     | Описание                        | Технология       |
| ---------- | ------------------------------- | ---------------- |
| **web**    | Фронтенд                       | Next.js 14       |
| **api**    | Основной backend                | NestJS + Prisma  |
| **ai**     | Сервис интеграции с LLM         | Fastify           |
| **worker** | Обработчик фоновых задач        | BullMQ           |
| **migrator** | Автоматические миграции БД    | Prisma + pg      |

Инфраструктура:

| Компонент      | Назначение                    |
| -------------- | ----------------------------- |
| PostgreSQL 16  | Основная база данных          |
| Redis 7        | Кэш и очередь задач          |
| MinIO          | S3-совместимое хранилище      |
| ClickHouse 24  | Аналитическая база            |

Все сервисы не хранят состояние в памяти, конфигурируются через переменные окружения, логируют в JSON и поддерживают запуск нескольких экземпляров.

---

## Стек

**Frontend:** Next.js 14, React 18, TypeScript

**Backend:** NestJS, Fastify, Prisma ORM, BullMQ

**Инфраструктура:** Docker, Docker Compose, PostgreSQL, Redis, MinIO, ClickHouse

**Инструменты:** pnpm 9, tsup, tsx, Zod (валидация конфигурации), Pino (JSON-логирование)

---

## Структура проекта

```
apps/
  web/           Next.js фронтенд (страницы, роутинг)
  api/           NestJS backend (REST API, Prisma)
  ai/            AI-сервис (Fastify)
  worker/        Обработчик фоновых задач (BullMQ)
  migrator/      Сервис миграций БД

packages/
  config/        Общий модуль конфигурации (Zod-валидация env)
  logger/        JSON-логгер (Pino, request-id)
  types/         Общие TypeScript типы

infra/
  compose/       Docker Compose конфигурации
  docker/        Dockerfile для каждого сервиса

scripts/         Вспомогательные скрипты
```

---

## Запуск

### Требования

- Docker и Docker Compose
- Node.js 20
- pnpm 9

### Полный запуск в Docker (production-like)

```bash
cp env.example .env
pnpm dev
```

### Режим hot reload (для разработки)

```bash
cp env.example .env
pnpm dev:hot
```

Исходники монтируются внутрь контейнеров — изменения в коде применяются автоматически. Отдельный setup-сервис автоматически устанавливает зависимости, собирает пакеты и генерирует Prisma Client.

### Гибридный режим (инфра в Docker, код локально)

```bash
cp env.local.example .env
pnpm dev:infra       # поднять PostgreSQL, Redis, ClickHouse, MinIO
pnpm dev:setup       # установить зависимости и сгенерировать Prisma Client
pnpm dev:local       # запустить все сервисы локально
```

### Остановка

```bash
pnpm dev:hot:down     # остановить hot reload
pnpm dev:hot:reset    # остановить, удалить volumes и запустить заново
pnpm dev:infra:down   # остановить инфраструктуру
```

---

## Доступ к сервисам

| Сервис         | URL                       |
| -------------- | ------------------------- |
| Web            | http://localhost:3000      |
| API            | http://localhost:8080      |
| AI Service     | http://localhost:8081      |
| MinIO Console  | http://localhost:9001      |
| ClickHouse     | http://localhost:8123      |
| PostgreSQL     | localhost:5433             |
| Redis          | localhost:6379             |

---

## Конфигурация

Все параметры задаются через `.env`. Шаблоны:

- `env.example` — для Docker-режимов
- `env.local.example` — для гибридного режима (localhost)

Основные переменные:

```env
ENV=development

WEB_PORT=3000
API_PORT=8080
AI_PORT=8081

DATABASE_URL=postgresql://app:app@postgres:5432/app?schema=public
REDIS_URL=redis://redis:6379/0
CLICKHOUSE_URL=http://clickhouse:8123

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=media

JWT_SECRET=dev_secret_change_me
JWT_TTL_SECONDS=604800

LOG_LEVEL=info
LOG_FORMAT=json
REQUEST_ID_HEADER=x-request-id
```

Конфигурация валидируется через Zod-схему в пакете `@repo/config`.

---

## Логирование

Все сервисы выводят структурированные JSON-логи через Pino:

```json
{
  "level": "info",
  "ts": "2026-02-09T18:06:01.765Z",
  "service": "api",
  "env": "development",
  "msg": "server_started"
}
```

Каждый запрос трекается через заголовок `x-request-id`. Логи готовы к интеграции с ELK Stack, Datadog, Loki или облачными системами.

---

## База данных

Схема описана в Prisma (`apps/api/prisma/schema.prisma`). Миграции запускаются автоматически сервисом `migrator` при старте платформы с advisory-лочкой для предотвращения гонок при нескольких экземплярах.

Ручной запуск миграций:

```bash
docker compose exec api npx prisma migrate deploy
```

Генерация Prisma Client:

```bash
cd apps/api && npx prisma generate
```

---

## Масштабирование

Все сервисы stateless — можно масштабировать горизонтально:

```bash
docker compose up --scale api=3 --scale worker=5
```

PostgreSQL и Redis выступают точками координации. Для production рекомендуется добавить балансировщик нагрузки.

---

## Зависимости между сервисами

```
postgres (healthcheck) → migrator → api
redis (healthcheck) → ai, worker
api → web
```

Setup-сервис (в hot reload режиме) гарантирует, что зависимости установлены и пакеты собраны до запуска приложений.

---

## Shared-пакеты

Монорепо использует pnpm workspaces. Общие пакеты:

- **@repo/config** — валидация переменных окружения через Zod
- **@repo/logger** — Pino-логгер с поддержкой request-id
- **@repo/types** — общие TypeScript-типы (HealthResponse и др.)

Все пакеты собираются через tsup и экспортируются как CommonJS с TypeScript-декларациями.

---

## Production-рекомендации

- Reverse proxy (Nginx / Traefik) с HTTPS (Let's Encrypt)
- Отдельная production-БД с отключённой trust-авторизацией
- Замена стандартных учетных данных MinIO и JWT_SECRET
- Централизованное логирование и мониторинг (Prometheus / Grafana)
- Разделение окружений: dev / staging / prod
- Ограничение внешних портов

---

## CI/CD

Рекомендуемый пайплайн:

1. Установка зависимостей (`pnpm install`)
2. Сборка пакетов (`pnpm build`)
3. Линтинг и тесты
4. Сборка Docker-образов
5. Публикация в registry
6. Деплой

---

## Безопасность

- Не коммитьте `.env` в репозиторий
- Замените стандартные пароли и секреты для production
- Ограничьте внешние порты контейнеров
- Ротируйте JWT_SECRET
