# Girlfriend AI Platform — Project Overview

## Purpose
A scalable AI character platform with conversational UI, voice interaction, content generation, context storage, and microservice architecture. Users can chat with AI characters (girlfriends), send voice messages, generate images/videos, and manage subscriptions.

## Tech Stack
- **Frontend:** Next.js 14, React 18, TypeScript (`apps/web`)
- **Backend API:** NestJS 10, Prisma ORM, PostgreSQL 16, JWT/Passport (`apps/api`)
- **AI Service:** Fastify, OpenAI SDK (GPT-4o, Whisper STT), ElevenLabs TTS (`apps/ai`)
- **Worker:** BullMQ + Redis for background jobs (`apps/worker`)
- **Migrator:** Prisma migrations service (`apps/migrator`)
- **Shared packages:** `@repo/config` (Zod env validation), `@repo/logger` (Pino JSON), `@repo/types`
- **Infrastructure:** Docker Compose, PostgreSQL 16, Redis 7, MinIO (S3), ClickHouse 24
- **Package manager:** pnpm 9 (workspaces monorepo)

## Architecture
5 stateless microservices:
```
web (Next.js :3000) → api (NestJS :8080) → ai (Fastify :8081)
                                          → worker (BullMQ)
postgres → migrator → api
redis → ai, worker
```

## Key Features
- JWT auth (access + refresh with rotation), RBAC (user/admin)
- AI chat with characters: SSE streaming, 20-message context window
- Voice: STT via Whisper, TTS via ElevenLabs, stored in MinIO
- Background jobs: BullMQ typed jobs (ai:chat, ai:stt, ai:tts) with retry/backoff
- Demo limits: 20 messages/day free tier, voice locked on free
- Admin panel: manage characters, users, API keys (stored in app_settings table)
- Swagger/OpenAPI at `/api/docs`
