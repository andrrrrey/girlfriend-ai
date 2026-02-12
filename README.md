# Girlfriend AI Platform

Масштабируемая платформа AI-персонажей с поддержкой диалога, хранением контекста, фоновой обработкой задач и сервисной архитектурой.

Проект реализует production-ready инфраструктуру для запуска и масштабирования AI-персонажей.

---

# 1. Обзор

Girlfriend AI Platform — распределённая система, предназначенная для:

- AI-персонажей с диалоговым интерфейсом
- Хранения истории сообщений
- Обработки фоновых задач
- Хранения медиафайлов
- Сбора аналитики
- Горизонтального масштабирования
- Stateless-архитектуры
- Централизованного JSON-логирования
- Автоматического запуска миграций базы данных

Архитектура ориентирована на промышленную эксплуатацию.

---

# 2. Архитектура системы

Платформа состоит из следующих сервисов:

- Web (Next.js фронтенд)
- API (NestJS backend)
- AI Service (сервис интеграции с LLM)
- Worker (обработка фоновых задач)
- Migrator (сервис запуска миграций Prisma)
- PostgreSQL (основная база данных)
- Redis (кэш и очередь задач)
- MinIO (S3-совместимое хранилище)
- ClickHouse (аналитическая база)

Все сервисы:

- Не хранят состояние в памяти
- Конфигурируются через переменные окружения
- Логируют в формате JSON
- Поддерживают запуск нескольких экземпляров
- Работают независимо друг от друга

---

# 3. Технологический стек

## Frontend
- Next.js 14
- React 18
- TypeScript

## Backend
- NestJS
- Prisma ORM
- PostgreSQL

## Инфраструктура
- Docker
- Docker Compose
- Redis
- MinIO
- ClickHouse

---

# 4. Структура проекта

```

apps/
web/         Фронтенд приложение
api/         Основной backend
ai/          AI-сервис
worker/      Обработчик фоновых задач
migrator/    Сервис миграций БД

packages/
config/      Общий модуль конфигурации
logger/      JSON-логгер
types/       Общие типы

infra/
compose/     Конфигурация Docker Compose

scripts/       Вспомогательные скрипты

```

---

# 5. Конфигурация через переменные окружения

Все сервисы настраиваются через `.env`.

Пример:

```

NODE_ENV=development
PORT=8080

DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app

REDIS_HOST=redis
REDIS_PORT=6379

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=9000

````

Стандартизированные имена переменных:

- PORT
- NODE_ENV
- DATABASE_URL
- REDIS_HOST
- REDIS_PORT
- MINIO_ENDPOINT
- CLICKHOUSE_HOST

---

# 6. Формат логирования

Все сервисы выводят логи в stdout в формате JSON.

Пример:

```json
{
  "level": "info",
  "ts": "2026-02-09T18:06:01.765Z",
  "service": "api",
  "env": "development",
  "msg": "server_started"
}
````

Поддерживается интеграция с:

* ELK Stack
* Datadog
* Loki
* Облачными системами логирования

---

# 7. Работа с базой данных

## Prisma

Схема базы данных описана в Prisma.

Миграции запускаются автоматически сервисом `migrator`.

Ручной запуск:

```
docker-compose exec api npx prisma migrate deploy
```

Генерация Prisma Client:

```
npx prisma generate
```

---

# 8. Запуск проекта

## 8.1 Клонирование

```
git clone ...
cd girlfriend-ai
```

## 8.2 Настройка окружения

```
cp .env.example .env
cp .env infra/compose/.env
```

Отредактируйте значения при необходимости.

## 8.3 Запуск через Docker

```
docker-compose -f infra/compose/docker-compose.dev.yml up --build
```

---

# 9. Доступ к сервисам

| Сервис        | URL                                            |
| ------------- | ---------------------------------------------- |
| Web           | [http://localhost:3000](http://localhost:3000) |
| API           | [http://localhost:8080](http://localhost:8080) |
| AI Service    | [http://localhost:8081](http://localhost:8081) |
| MinIO Console | [http://localhost:9001](http://localhost:9001) |
| ClickHouse    | [http://localhost:8123](http://localhost:8123) |
| PostgreSQL    | localhost:5433                                 |
| Redis         | localhost:6379                                 |

---

# 10. Горизонтальное масштабирование

Stateless-сервисы можно масштабировать независимо.

Пример:

```
docker-compose up --scale api=3
```

Ключевые компоненты масштабирования:

* PostgreSQL
* Redis
* Объектное хранилище
* Балансировщик нагрузки (рекомендуется в production)

---

# 11. Разработка без Docker

Установка зависимостей:

```
pnpm install
```

Запуск фронтенда:

```
pnpm --filter web dev
```

Запуск backend:

```
pnpm --filter api start:dev
```

---

# 12. Рекомендации для production

* Использовать reverse proxy (Nginx или Traefik)
* Настроить HTTPS (Let's Encrypt)
* Использовать отдельную production БД
* Заменить стандартные учетные данные MinIO
* Настроить централизованное логирование
* Включить мониторинг (Prometheus / Grafana)
* Разделить окружения (dev / staging / prod)

---

# 13. Замечания по безопасности

* Не добавляйте `.env` в репозиторий
* Замените стандартные пароли
* Отключите trust-авторизацию PostgreSQL в production
* Ограничьте внешние порты в production

---

# 14. Рекомендации по CI/CD

Рекомендуемые этапы пайплайна:

1. Установка зависимостей
2. Проверка линтинга
3. Запуск тестов
4. Сборка
5. Сборка Docker-образов
6. Публикация в registry
7. Деплой