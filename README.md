# Girlfriend AI Platform

Масштабируемая платформа AI-персонажей с диалоговым интерфейсом, генерацией контента, хранением контекста и микросервисной архитектурой.

Production-ready система для создания и взаимодействия с AI-персонажами — с полноценным фронтендом, бэкендом, фоновой обработкой задач и инфраструктурой, готовой к горизонтальному масштабированию.

---

## Что реализовано

### Платформа и авторизация
- **Регистрация и логин** — email + пароль, хеширование bcrypt, JWT access + refresh токены с ротацией
- **Управление сессиями** — refresh-токены хранятся в БД с привязкой к IP и User-Agent, инвалидация при logout
- **Профиль пользователя** — просмотр, редактирование (nickname, язык, аватар), смена пароля
- **Социальные ссылки** — CRUD для привязки VK, Instagram, X и других соцсетей
- **RBAC** — роли `user` и `admin`, RolesGuard на уровне NestJS, защита эндпоинтов через JwtAuthGuard
- **Фронтенд авторизации** — страницы логина и регистрации, AuthProvider (React Context), автообновление токенов, редирект неавторизованных

### AI-чат с персонажами
- **Интеграция OpenAI** — подключён `openai` SDK, потоковая генерация ответов (SSE streaming) через `POST /ai/chat/completion`
- **Система персонажей** — каждый персонаж имеет имя, системный промпт, личность (JSONB), аватар, голосовой ID и теги
- **Чат-сессии** — создание, список с пагинацией (cursor-based), переименование, soft delete
- **История сообщений** — cursor-based пагинация, сохранение роли (user/assistant/system), типа и метаданных
- **Streaming** — SSE-поток от AI-сервиса через API к фронтенду с поддержкой прерывания генерации (abort)
- **Действия с сообщениями** — удаление (soft delete), регенерация AI-ответа (удаляет старое + стримит новое)
- **Контекст разговора** — последние 20 сообщений передаются в LLM для поддержания контекста диалога

### Фронтенд
- **Каталог персонажей** — главная страница с сеткой карточек, hover-эффекты, фильтрация по тегам, поиск, пагинация
- **Чат-интерфейс** — трёхпанельный layout (сайдбар навигации + список чатов + область сообщений), выбор персонажа для нового чата, отображение стриминга в реальном времени
- **Профиль** — вкладки: аккаунт, подписка, предпочтения, профили для чатов
- **Генерация фото/видео** — страница с выбором сцены, персонажа, позы, фона, декораций и галерея результатов
- **Админ-панель** — настройки AI (ключ API, модель, TTS/STT параметры), CRUD персонажей (создание, редактирование, удаление)

### Инфраструктура
- **Микросервисная архитектура** — 5 сервисов (web, api, ai, worker, migrator)
- **Docker Compose** — три режима: production-like, hot reload, гибридный (инфра в Docker + код локально)
- **База данных** — PostgreSQL 16 с Prisma ORM, автоматические миграции через сервис migrator с advisory-лочкой
- **Фоновая обработка** — BullMQ + Redis (воркер подключён, инфраструктура готова)
- **Объектное хранилище** — MinIO (S3-совместимое) для медиафайлов
- **Аналитика** — ClickHouse подключён как сервис
- **Логирование** — структурированные JSON-логи через Pino, трекинг request-id
- **Конфигурация** — валидация env через Zod, централизованный пакет `@repo/config`
- **Seed-данные** — 5 предустановленных AI-персонажей с уникальными промптами + тестовый админ-пользователь
- **Настройки через БД** — ключи OpenAI API, модели (gpt-4o, tts-1, whisper-1, nova) хранятся в таблице `app_settings` и управляются через админ-панель

---

## Статус реализации по ТЗ (Этап 1 — MVP)

### Блок 1 — Платформа (регистрация, логин, профиль, язык, RBAC)

| Задача | Статус |
| --- | --- |
| 1.1. Расширить Prisma-схему (User, Session, SocialLink) | Выполнено |
| 1.2. Регистрация и логин (register, login, refresh, logout, JWT guard) | Выполнено |
| 1.3. Профиль пользователя (GET/PATCH /users/me, смена пароля, соц. ссылки) | Выполнено |
| 1.4. Базовый RBAC (роли user/admin, RolesGuard, JwtAuthGuard) | Выполнено |
| 1.5. Подключить фронтенд к API (JWT interceptor, формы, AuthProvider) | Выполнено |

### Блок 2 — Демо-режим

| Задача | Статус |
| --- | --- |
| 2.1. Модель демо-лимитов (DemoLimit, UsageCounter) | Не начато (поле `isDemo` в User есть) |
| 2.2. Middleware проверки лимитов (Guard, HTTP 429) | Не начато |
| 2.3. Фронтенд — демо-ограничения (blur, баннеры, дизейбл кнопок) | Не начато |

### Блок 3 — AI Service Node (LLM + STT + TTS)

| Задача | Статус |
| --- | --- |
| 3.1. Интеграция OpenAI — LLM (streaming SSE, system prompt персонажа) | Выполнено |
| 3.2. Интеграция OpenAI — STT (распознавание голоса, Whisper) | Не начато |
| 3.3. Интеграция OpenAI — TTS (генерация голоса, сохранение в S3) | Не начато |
| 3.4. Job-очередь для AI-операций (типизированные job'ы, retry, AiJob) | Частично (воркер подключён, нет типизированных job'ов и таблицы AiJob) |
| 3.5. Лимиты и учёт (подсчёт токенов, ограничения по подписке) | Не начато |

### Блок 4 — Чаты

| Задача | Статус |
| --- | --- |
| 4.1. Модели данных (Character, ChatSession, Message) | Выполнено |
| 4.2. API чатов (CRUD сессий, история, отправка + SSE ответ) | Выполнено |
| 4.3. Действия с сообщениями (delete, regenerate) | Частично (нет copy и edit) |
| 4.4. Streaming SSE (бэкенд + фронтенд, поддержка abort) | Выполнено |
| 4.5. Голосовые сообщения (запись, STT, TTS, аудиоплеер) | Не начато |

### Блок 5 — Авто-очистка

| Задача | Статус |
| --- | --- |
| 5.1. Cron-job для очистки неактивных чатов (>7 дней) | Не начато |

### Блок 6 — Инфраструктурные задачи

| Задача | Статус |
| --- | --- |
| 6.1. Добавить зависимости (openai, bcrypt, JWT, passport, BullMQ) | Выполнено |
| 6.2. Env-конфигурация (OpenAI ключи через admin-панель в БД) | Выполнено (альтернативный подход через AppSettings) |
| 6.3. Seed-данные (5 персонажей + тестовый admin) | Выполнено |
| 6.4. API-документация (Swagger) | Не начато |

### Дополнительно реализовано (вне ТЗ)

- Админ-панель с управлением настройками AI и CRUD персонажей
- Internal API для коммуникации между ai-сервисом и api
- Hot reload режим разработки с автоматической установкой зависимостей
- Гибридный режим (инфра в Docker, код локально)
- Страница генерации фото/видео (UI)

---

## Архитектура

Платформа реализована как набор stateless-микросервисов:

| Сервис | Описание | Технология |
| --- | --- | --- |
| **web** | Фронтенд | Next.js 14, React 18 |
| **api** | Основной backend | NestJS + Prisma |
| **ai** | Сервис интеграции с LLM | Fastify + OpenAI SDK |
| **worker** | Обработчик фоновых задач | BullMQ |
| **migrator** | Автоматические миграции БД | Prisma + pg |

Инфраструктура:

| Компонент | Назначение |
| --- | --- |
| PostgreSQL 16 | Основная база данных |
| Redis 7 | Кэш и очередь задач |
| MinIO | S3-совместимое хранилище |
| ClickHouse 24 | Аналитическая база |

Все сервисы не хранят состояние в памяти, конфигурируются через переменные окружения, логируют в JSON и поддерживают запуск нескольких экземпляров.

---

## Стек

**Frontend:** Next.js 14, React 18, TypeScript

**Backend:** NestJS, Fastify, Prisma ORM, BullMQ, bcrypt, Passport + JWT

**Инфраструктура:** Docker, Docker Compose, PostgreSQL, Redis, MinIO, ClickHouse

**Инструменты:** pnpm 9, tsup, tsx, Zod (валидация конфигурации), Pino (JSON-логирование)

---

## Структура проекта

```
apps/
  web/           Next.js фронтенд (страницы, роутинг, AuthProvider)
  api/           NestJS backend (REST API, Prisma, auth, chats, admin)
  ai/            AI-сервис (Fastify, OpenAI streaming)
  worker/        Обработчик фоновых задач (BullMQ)
  migrator/      Сервис миграций БД

packages/
  config/        Общий модуль конфигурации (Zod-валидация env)
  logger/        JSON-логгер (Pino, request-id)
  types/         Общие TypeScript типы

infra/
  compose/       Docker Compose конфигурации (dev, hotreload, infra)
  docker/        Dockerfile для каждого сервиса
```

---

## База данных

Текущая схема (`apps/api/prisma/schema.prisma`):

| Модель | Назначение |
| --- | --- |
| **User** | Пользователи (email, пароль, роль, подписка, язык, isDemo, soft delete) |
| **Session** | Refresh-токены с привязкой к IP и User-Agent |
| **SocialLink** | Ссылки на соцсети (уникальная пара userId + provider) |
| **AppSetting** | Key-value хранилище настроек (OpenAI API ключ, модели и т.д.) |
| **Character** | AI-персонажи (имя, системный промпт, личность, аватар, голос, теги) |
| **ChatSession** | Чат-сессии (привязка к пользователю и персонажу, soft delete) |
| **Message** | Сообщения (роль, контент, тип, медиа, метаданные, soft delete) |

---

## API-эндпоинты

### Авторизация (`/auth`)
- `POST /auth/register` — регистрация (email + пароль)
- `POST /auth/login` — логин (возвращает access + refresh токены)
- `POST /auth/refresh` — обновление access-токена с ротацией refresh
- `POST /auth/logout` — инвалидация refresh-токена

### Профиль (`/users`) — защищены JWT
- `GET /users/me` — текущий профиль с социальными ссылками
- `PATCH /users/me` — обновление nickname, lang, avatarUrl
- `PATCH /users/me/password` — смена пароля
- `GET /users/me/social-links` — список соц. ссылок
- `PUT /users/me/social-links` — создание/обновление ссылки
- `DELETE /users/me/social-links/:provider` — удаление ссылки

### Персонажи (`/characters`) — защищены JWT
- `GET /characters` — список публичных персонажей
- `GET /characters/:id` — детали персонажа

### Чаты (`/chats`) — защищены JWT
- `POST /chats` — создать чат с персонажем
- `GET /chats` — список чатов (cursor-based пагинация)
- `GET /chats/:id` — детали чата
- `PATCH /chats/:id` — переименовать чат
- `DELETE /chats/:id` — soft delete чата
- `GET /chats/:id/messages` — история сообщений (cursor-based)
- `POST /chats/:id/messages` — отправить сообщение + SSE-ответ от AI
- `DELETE /chats/:id/messages/:msgId` — soft delete сообщения
- `POST /chats/:id/messages/:msgId/regenerate` — регенерация AI-ответа (SSE)

### Админ (`/admin`) — только роль admin
- `GET /admin/settings` — все настройки
- `PUT /admin/settings` — обновление настроек
- `GET /admin/characters` — все персонажи
- `GET /admin/characters/:id` — детали
- `POST /admin/characters` — создать персонажа
- `PATCH /admin/characters/:id` — обновить
- `DELETE /admin/characters/:id` — soft delete

### AI-сервис (порт 8081)
- `POST /ai/chat/completion` — SSE-стриминг ответа от OpenAI с системным промптом персонажа

### Internal API (без авторизации, для межсервисного общения)
- `GET /internal/settings` — настройки для AI-сервиса
- `GET /internal/characters/:id` — данные персонажа для AI-сервиса

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

### Seed-данные

После первого запуска миграций выполните seed для создания тестовых персонажей и админ-пользователя:

```bash
cd apps/api && npx prisma db seed
```

Создаются:
- 5 AI-персонажей (Алиса, Кира, Юки, Марго, Сакура) с уникальными системными промптами
- Админ-пользователь (`admin@example.com` / `admin123`)

### Остановка

```bash
pnpm dev:hot:down     # остановить hot reload
pnpm dev:hot:reset    # остановить, удалить volumes и запустить заново
pnpm dev:infra:down   # остановить инфраструктуру
```

---

## Доступ к сервисам

| Сервис | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:8080 |
| AI Service | http://localhost:8081 |
| MinIO Console | http://localhost:9001 |
| ClickHouse | http://localhost:8123 |
| PostgreSQL | localhost:5433 |
| Redis | localhost:6379 |

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

Настройки OpenAI (API ключ, модели) управляются через админ-панель и хранятся в таблице `app_settings` в БД.

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
- OpenAI API ключ хранится в БД и управляется через защищённую админ-панель (только роль admin)
