# Code Style & Conventions

## Language
- TypeScript throughout (strict mode implied by tsconfig)
- No `any` types preferred

## Naming
- **camelCase** for variables, functions, methods
- **PascalCase** for classes, interfaces, types, React components
- **kebab-case** for file names (NestJS modules follow NestJS conventions: `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`)
- **snake_case** for DB column names in Prisma (`@map("column_name")`)
- Prisma model fields use camelCase in code but map to snake_case in DB

## NestJS (apps/api)
- Module-per-feature structure (auth, users, chats, admin, etc.)
- DTOs with `class-validator` decorators for request validation
- `class-transformer` for serialization
- Guards: `JwtAuthGuard` (JWT), `RolesGuard` (RBAC)
- Swagger decorators on controllers/DTOs
- Soft deletes via `deletedAt` field (never hard delete)
- Cursor-based pagination for lists

## Next.js (apps/web)
- App Router (app/ directory)
- React Server Components where possible
- AuthProvider via React Context
- API calls go through `app/api-proxy/` or direct fetch with JWT headers

## AI Service (apps/ai)
- Fastify framework
- Rate limiting: 60 req/min per IP via `@fastify/rate-limit`
- SSE streaming for chat completions
- `x-request-id` header propagated for tracing

## Shared Packages
- Built with `tsup` → CommonJS output with `.d.ts` declarations
- Env validation with Zod schemas in `@repo/config`
- Pino JSON logger in `@repo/logger`

## Logging
- JSON format, structured via Pino
- Every request has `x-request-id` for cross-service tracing
- Log fields: `level`, `ts`, `service`, `env`, `msg`

## No Tests
- No test files exist yet (linting/testing scripts are TODO placeholders)
