# AquiTa.do

AquiTa.do is a production-oriented local business directory for the Dominican Republic.

## Stack

- Frontend: React, Vite, TypeScript, TailwindCSS
- Backend: NestJS, TypeScript
- Data: PostgreSQL, Prisma, PostGIS
- Cache: Redis
- QA: Playwright, Vitest, Lighthouse CI
- Infra: Docker, Docker Compose, pnpm workspaces

## Basic commands

```powershell
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm qa:smoke
pnpm qa:pr
pnpm qa:release
pnpm check:encoding
pnpm audit:architecture
```

## Project guidance

Read `AGENTS.md` before changing code. It defines the engineering rules for safe work in this repository.

Read `ARCHITECTURE.md` before touching behavior across frontend, backend, data, cache, PWA, or infrastructure.

All changes should follow safe refactor practices: keep scope small, preserve existing behavior, avoid mixing refactors with features, and validate changes before moving to higher-risk areas.
