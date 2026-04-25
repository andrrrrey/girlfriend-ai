# Codebase Structure

```
apps/
  api/           NestJS backend
    src/
      auth/      JWT auth, register, login, refresh, logout, guards
      users/     User profile, social links, password change
      chats/     Chat sessions, messages, SSE streaming, voice
      admin/     Admin settings, character CRUD, user management
      generation/ Photo/video generation
      demo/      DemoService — usage limits for free tier
      cleanup/   CleanupService — daily cron at 03:00 UTC
      queue/     BullMQ queue definitions
      internal/  Internal API (no auth, inter-service)
      main.ts    NestJS bootstrap, Swagger setup
      app.module.ts  Root module
      prisma.service.ts  PrismaClient singleton
    prisma/
      schema.prisma  DB schema (User, Session, Character, ChatSession, Message, AiJob, etc.)
      seed.ts        Seed script

  web/           Next.js 14 App Router frontend
    app/
      chat/      Chat interface (3-panel layout)
      admin/     Admin panel
      profile/   User profile tabs
      create/    Create Character wizard (9-step)
      generation/ Photo/video generation page
      register/  Registration page
      login/     Login page
      components/ Shared UI components
      api-proxy/ Next.js API proxy routes
    lib/          Utilities, API client helpers
    context/      React contexts (AuthProvider, etc.)
    middleware.ts  Auth redirect middleware

  ai/            Fastify AI service (:8081)
    src/          OpenAI streaming, Whisper STT, ElevenLabs TTS

  worker/        BullMQ worker
    src/          Job handlers: ai:chat, ai:stt, ai:tts

  migrator/      Prisma migration runner

packages/
  config/        Zod env validation, shared config
  logger/        Pino JSON logger with request-id
  types/         Shared TypeScript types

infra/
  compose/       docker-compose.dev.yml, docker-compose.hotreload.yml, docker-compose.infra.yml
  docker/        Dockerfiles per service
```

## Database Models
- **User** — email, passwordHash, role (user/admin), subscription (free/paid), isDemo, lang, soft delete
- **Session** — refresh tokens with IP + User-Agent
- **SocialLink** — userId + provider pairs
- **AppSetting** — key-value store (OpenAI key, ElevenLabs key, models)
- **Character** — name, systemPrompt, personality (JSONB), avatarUrl, voiceId, tags, soft delete
- **ChatSession** — userId + characterId, cursor-based, soft delete
- **Message** — role (user/assistant/system), content, type (text/audio/image), soft delete
- **UsageCounter** — daily counters per user+action, resets at 23:59:59
- **AiJob** — background job tracking (pending/processing/completed/failed)
- **UsageLog** — analytics log per AI operation
- **MessageCopyAudit** — audit log for message copy events
