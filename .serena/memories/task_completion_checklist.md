# Task Completion Checklist

After completing any coding task:

1. **Build check** — verify the affected app/package still builds:
   ```bash
   pnpm --filter <app-name> build
   # or for shared packages:
   pnpm -r --filter './packages/*' build
   ```

2. **Prisma** — if schema changed:
   ```bash
   cd apps/api && npx prisma generate
   cd apps/api && npx prisma migrate dev --name <migration_name>
   ```

3. **Type check** — TypeScript should compile without errors (build step covers this for NestJS/tsup apps; Next.js build also type-checks)

4. **Linting/Formatting** — currently TODO placeholders (`pnpm lint` / `pnpm format` echo TODO). No lint step needed until implemented.

5. **No tests** — test suite doesn't exist yet; skip.

6. **Git** — follow branch naming from CLAUDE.md:
   - `feature/TICKET-123-description`
   - `fix/bug-description`
   - Never prefix with "claude"

7. **Soft deletes** — never hard-delete records; always set `deletedAt` timestamp.

8. **Env vars** — if new env vars added, update both `env.example` and `env.local.example`, and add to Zod schema in `packages/config`.
