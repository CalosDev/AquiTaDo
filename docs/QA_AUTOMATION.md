# QA Automation

## Objetivo

Esta base de automatizacion cubre cuatro frentes del producto:

- regresiones funcionales entre `web` y `api`
- auth, permisos y observability
- comportamiento PWA/offline/reconectividad
- regresiones visuales y accesibilidad basica

## Estructura

```text
apps/
  web/
    src/
      tests/integration/
  api/
    src/**/*.spec.ts
    src/**/*.e2e.spec.ts
docker/
  docker-compose.test.yml
playwright/
  fixtures/
  helpers/
  pages/
  specs/
lighthouse/
  lighthouserc.json
scripts/
  run-with-qa-stack.mjs
```

## Suites

- `pnpm test:unit`: unit y component tests de workspaces.
- `pnpm test:integration`: integra frontend con Testing Library y backend con Nest + Supertest + DB real.
- `pnpm test:e2e`: Playwright para auth, navegacion, offline y observability.
- `pnpm test:a11y`: Playwright + axe para home y login.
- `pnpm test:visual`: baseline visual de home, login mobile y dashboard admin.
- `pnpm test:lighthouse`: performance, accessibility, best practices y PWA sobre rutas criticas.

## Gates recomendados

- `pnpm qa:smoke`: lint + typecheck + unit.
- `pnpm qa:pr`: smoke + integration + e2e + a11y.
- `pnpm qa:release`: qa:pr + visual + lighthouse.

## Stack de QA

`scripts/run-with-qa-stack.mjs` levanta un entorno reproducible para Playwright y Lighthouse:

- `PostgreSQL + PostGIS` en `docker/docker-compose.test.yml`
- `Redis` real en el mismo compose
- `Prisma migrate deploy`
- `Prisma seed`
- build de `api` y `web`
- API en `http://127.0.0.1:3300`
- Web en `http://127.0.0.1:4173`

Variables utiles:

- `QA_DB_PORT`
- `QA_REDIS_PORT`
- `QA_API_PORT`
- `QA_WEB_PORT`
- `PLAYWRIGHT_ADMIN_EMAIL`
- `PLAYWRIGHT_ADMIN_PASSWORD`

## Cobertura actual

- auth: login invalido, login admin, recarga, logout y multi-tab sync
- rutas: home, businesses, login y register
- observability: bloqueo anonimo/no-admin y acceso admin a metrics
- offline: banner de desconexion, recuperacion y SW activo
- visual: home desktop, login mobile, admin dashboard
- a11y: home y login

## Notas

- Los snapshots visuales viven en `playwright/specs/__snapshots__`.
- La suite visual debe regenerarse deliberadamente cuando cambie el baseline esperado.
- El runner QA destruye el compose de test al terminar para evitar estado persistente entre corridas.
