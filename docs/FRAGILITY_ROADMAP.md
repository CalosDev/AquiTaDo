# Fragility Roadmap

Fecha: 2026-04-24

## Alcance

Este documento convierte el diagnostico de fragilidad en una base de trabajo segura. No define cambios de producto ni autoriza refactors. Su objetivo es dejar visible que partes del sistema tienen cobertura actual, donde la cobertura es parcial y que pruebas de caracterizacion conviene agregar antes de tocar zonas criticas.

## Reglas de esta fase

- No modificar logica de producto.
- No tocar `apps/web/src/pages/**`.
- No tocar `apps/web/src/api/endpoints.ts`.
- No tocar auth, permisos, `searchParams`, service worker, Prisma, Redis ni Docker.
- No cambiar UI, copy, estilos, rutas, contratos de API ni tracking.
- No implementar tests nuevos en esta fase; solo recomendar tests.

## Lectura de estados

- `pass`: existe una prueba actual que cubre el contrato critico indicado para ese flujo.
- `partial`: existe alguna prueba, pero no cubre todos los estados relevantes del flujo.
- `fail`: hay evidencia actual de fallo. No se detecto ningun flujo con esta etiqueta en esta revision documental.
- `not-covered`: no se encontro prueba directa en la revision documental.

## Matriz de cobertura actual

| Ruta o flujo | Estado actual | Riesgo | Prueba existente | Prueba faltante recomendada |
| --- | --- | --- | --- | --- |
| `/` home publico | partial | Medio: primera impresion, SEO, CTAs y datos dinamicos. | `playwright/specs/acceptance-public.spec.ts`, `navigation.e2e.spec.ts`, `a11y.spec.ts`, `visual.spec.ts`, `apps/web/src/pages/Home.test.tsx` | Caracterizar mobile y estados con datos vacios/lentos para secciones dinamicas. |
| `/businesses` listado publico | partial mejorado | Alto: filtros, mapa, paginacion, tracking y contrato API. | `playwright/specs/acceptance-public.spec.ts` cubre shell inicial publico y vista mapa; `apps/web/src/tests/integration/BusinessesList.integration.test.tsx`, `apps/web/src/pages/businesses-list/*.test.tsx` cubren partes de estado/filtros. | Browser test para combinaciones de filtros, paginacion, error API y no-results con URL estable. |
| `/businesses?view=map` vista mapa | partial | Alto: sincroniza URL, listado, seleccion y negocios sin coordenadas. | `acceptance-public.spec.ts`, `BusinessesList.integration.test.tsx` | Caracterizar seleccion de negocio, retorno a lista y edge case sin coordenadas. |
| `/businesses/:slug` detalle valido | partial | Alto: detalle publico, SEO, imagenes, reviews, favoritos y tracking. | `apps/web/src/pages/BusinessDetails.test.tsx`, `business-details/helpers.test.ts` | Acceptance con slug seed real y contrato minimo de contenido visible. |
| `/businesses/:slug` slug inexistente | pass | Medio: recuperacion publica sin pantalla rota. | `playwright/specs/acceptance-public.spec.ts` reforzado con URL estable y href de CTAs. | No hay siguiente test inmediato; si cambia el contrato de error, agregar status/API y estado de tracking. |
| `/negocios/provincia/:provinceSlug` | partial | Alto: SEO route sincroniza slug a `provinceId` y query. | `BusinessesList.integration.test.tsx`, `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para provincia seed real y filtros persistentes. |
| `/negocios/categoria/:categorySlug` | partial | Alto: SEO, canonical y filtro fijo. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para categoria seed real, clear filters y canonical esperado. |
| `/negocios/intencion/:intentSlug` | partial | Alto: intencion mapea feature y copy SEO. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para intencion seed real y salida segura a `/businesses`. |
| `/negocios/:provinceSlug/:categorySlug` | partial | Alto: combina dos filtros SEO y query state. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para combinacion provincia + categoria. |
| `/login` formulario | partial | Alto: entrada a sesion, errores y redirect. | `acceptance-auth.spec.ts`, `auth.e2e.spec.ts`, `Login.integration.test.tsx`, `a11y.spec.ts`, `visual.spec.ts` | Caracterizar 2FA, refresh fallido y retorno a ruta protegida. |
| Login invalido | pass | Alto: errores auth no deben dejar boton bloqueado ni navegar. | `auth.e2e.spec.ts`, `Login.integration.test.tsx` | Agregar variante 429/throttle si se cambia auth. |
| Sesion admin reload/logout multi-tab | pass | Alto: refresh, storage y sync entre tabs. | `playwright/specs/auth.e2e.spec.ts` | Agregar variante token expirado y refresh cookie ausente. |
| `/register` formulario | partial | Medio: alta de usuario y seleccion de rol. | `acceptance-auth.spec.ts` | Caracterizar registro exitoso USER y BUSINESS_OWNER, y errores backend. |
| `/forgot-password` | partial | Medio: recuperacion de cuenta y mensajes de seguridad. | `playwright/specs/acceptance-auth.spec.ts` cubre render basico sin submit. | Mensaje neutral post-submit y error backend sin filtrar existencia de cuenta. |
| `/reset-password` | not-covered | Medio: token invalido/expirado y cambio de password. | No encontrada. | Acceptance para token invalido y contrato visual del formulario. |
| `/app` shell autenticado | partial | Medio: landing post-login y redireccion por rol. | `Login.integration.test.tsx`, helpers de auth Playwright. | Acceptance por rol para destino final tras login. |
| `/app/customer` | not-covered | Medio: panel cliente y permisos USER. | No encontrada. | Acceptance con USER seed y bloqueo para roles no esperados. |
| `/profile` | partial | Medio: perfil autenticado, avatar y datos de usuario. | `apps/web/src/pages/Profile.test.tsx` | Acceptance autenticada con render basico, update error y estado vacio. |
| `/dashboard` fresh business owner | partial | Alto: rol BUSINESS_OWNER, organizacion activa y CTA inicial. | `playwright/specs/acceptance-business.spec.ts` | Caracterizar dashboard con organizacion/negocio existente. |
| `/register-business` | partial | Alto: formulario multi-step, org context, uploads y validacion. | `playwright/specs/acceptance-business.spec.ts` | Characterization por pasos con datos invalidos y sin cambiar backend. |
| `/dashboard/businesses/:businessId/edit` | not-covered | Alto: ownership, org context, mutaciones y cache. | No encontrada. | Acceptance con negocio seed propiedad del usuario y caso no autorizado. |
| `/suggest-business` | not-covered | Medio: usuario final crea sugerencia y evita spam/errores. | No encontrada. | Acceptance USER con formulario vacio, validacion y submit mock/seed. |
| `/app/invite` | partial | Alto: token de invitacion, membresia, roles frontend/backend y org context. | `apps/web/src/routes/Router.test.tsx` caracteriza que `USER`, `BUSINESS_OWNER` y `ADMIN` autenticados llegan a la ruta. `apps/api/src/auth/role-access.e2e.spec.ts` agrega caracterizacion backend/API pendiente de validacion runtime. | Ejecutar el test backend/API en entorno QA/CI con DB disponible; luego acceptance con token invalido y token valido seed. |
| `/admin` consola | partial | Alto: permisos ADMIN, tabla operacional y acciones sensibles. | `acceptance-admin.spec.ts`, `visual.spec.ts`, `auth.e2e.spec.ts` | Acceptance de estados vacio/error y una accion admin no destructiva. |
| `/security` admin security | not-covered | Alto: 2FA/admin security y permisos. | No encontrada. | Acceptance basica ADMIN y bloqueo USER/BUSINESS_OWNER. |
| Observability metrics | pass | Alto: endpoint sensible debe bloquear anonimo/no-admin. | `playwright/specs/admin-observability.e2e.spec.ts`, `apps/api/src/observability/observability.e2e.spec.ts` | Agregar summary/reset si se modifican metricas publicas. |
| PWA offline/reconnect | partial | Alto: contenido stale, SW activo y refetch. | `offline.e2e.spec.ts`, `AppRuntimeStatus.integration.test.tsx` | Caracterizar update disponible y navegacion offline a ruta no cacheada. |
| Visual baselines | partial | Medio: protege cambios accidentales en home, login mobile y admin. | `playwright/specs/visual.spec.ts` | Agregar businesses desktop/mobile antes de refactors visuales. |
| Accessibility baseline | partial | Medio: solo home y login. | `playwright/specs/a11y.spec.ts` | Agregar businesses, register-business y admin. |
| Public API businesses/search | partial | Alto: contratos publicos, filtros y ranking. | `apps/api/src/businesses/businesses.e2e.spec.ts`, `apps/api/src/search/discovery-ranking.spec.ts` | Snapshot contractual de shape publico para lista/detalle/search. |
| Claims, ownership y catalogo admin | partial | Alto: permisos, auditoria, org ownership y mutaciones. | `apps/api/src/businesses/*helpers.spec.ts`, `businesses.e2e.spec.ts` | E2E de permisos por rol y org con payload minimo por endpoint critico. |
| Organization active context | partial | Alto: `x-organization-id` cruza frontend y backend. | `organization-access.service.spec.ts`, usos indirectos en e2e. | Acceptance de cambio de organizacion y bloqueo por membresia. |
| Payments y webhooks | partial | Critico: dinero, Stripe, reportes y export CSV. | `apps/api/src/payments/payments.service.spec.ts` | E2E contractual de webhook Stripe y permisos de reportes/export. |
| Uploads/storage | partial | Alto: archivos, permisos, storage local/S3 y limpieza. | `apps/api/src/uploads/uploads.service.spec.ts` | E2E de upload rechazado por tipo/tamano y permisos por org. |
| Redis/cache invalidation | partial | Alto: datos stale tras mutaciones. | Cobertura indirecta por QA stack con Redis real. | Test de caracterizacion para invalidacion tras business changed/promotions update. |
| Prisma/PostGIS/migrations | partial | Critico: integridad de datos y queries geoespaciales. | `run-with-qa-stack.mjs` ejecuta migrate deploy en QA; e2e usa DB real. | Migration status/check y casos geograficos extremos antes de tocar schema. |
| Lighthouse/PWA/performance | partial | Medio: performance y PWA pueden degradar sin romper tests funcionales. | `pnpm test:lighthouse` existe. | Ejecutar y registrar resultado antes de usarlo como gate de release. |

## Primeros tests de caracterizacion recomendados

Fase 1 queda cerrada con tres tests de bajo riesgo: recuperacion de slug inexistente, formulario basico de recuperacion de acceso y shell inicial de listado publico. Orden recomendado para fases futuras:

1. Proximo test recomendado: `/reset-password` con token invalido, solo si se puede caracterizar la pantalla/error sin modificar producto ni depender de backend real.
2. Alternativa segura: `/login` invalido en acceptance, reforzando que no navega y muestra error, sin tocar helpers ni cambiar semantica de auth.
3. Browser acceptance para `/businesses` con SEO routes: provincia, categoria, intencion y provincia+categoria. Debe verificar heading/contexto visible, URL final, clear filters y estado no-results.
4. Browser acceptance para `/businesses/:slug` con un slug seed real. Debe esperar hasta que exista un negocio seed real; no inventar fixture ni modificar Prisma solo para habilitar el test.
5. Matriz de roles en Playwright para rutas protegidas: USER, BUSINESS_OWNER y ADMIN contra `/app/customer`, `/dashboard`, `/register-business`, `/admin`, `/security` y `/suggest-business`.
6. Caracterizacion de auth refresh: token expirado, refresh ausente y logout multi-tab manteniendo destino final esperado.
7. Acceptance de PWA/update: banner de update disponible y navegacion offline a una ruta previamente visitada.
8. API contract tests para lista/detalle/search de negocios: status, campos publicos minimos, paginacion y filtros.
9. Cache invalidation tests para cambios de negocio/promocion: crear o actualizar entidad, invalidar prefijo esperado y comprobar lectura fresca.
10. Admin safe-route tests: `/admin` y `/security` render basico, bloqueo no-admin y estados de error sin ejecutar acciones destructivas.

## Cobertura actualizada en Fase 1

| Flujo | Antes | Ahora | Evidencia |
| --- | --- | --- | --- |
| `/businesses/:slug` slug inexistente | pass | pass reforzado | Fase 1.1 agrego contrato de URL estable y href de CTAs en `acceptance-public.spec.ts`. |
| `/forgot-password` | not-covered | partial | Fase 1.2 agrego render basico sin submit en `acceptance-auth.spec.ts`. |
| `/businesses` listado publico | partial | partial mejorado | Fase 1.3 agrego shell inicial sin filtros complejos en `acceptance-public.spec.ts`. |

## Cierre de Fase 1

| Paso | Comando ejecutado | Resultado |
| --- | --- | --- |
| Fase 1 documental | `pnpm audit:architecture` | Pass. |
| Fase 1 documental | `pnpm check:encoding` | Fail por estado previo del worktree: `README.md` aparece eliminado y el script intenta leerlo. No fue causado por este documento. |
| Fase 1.1 alternativa | `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/acceptance-public.spec.ts -g "business detail recovers from a missing slug"` | Pass: `1 passed`. |
| Fase 1.2 | `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/acceptance-auth.spec.ts -g "forgot password shows the recovery form"` | Pass: `1 passed`. |
| Fase 1.3 | `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/acceptance-public.spec.ts -g "businesses loads the public directory shell"` | Pass: `1 passed`. |

## Avance de Fase 2: extracciones visuales puras

Fase 2 inicio con extracciones presentacionales de bajo riesgo. No se movio logica de producto, `useEffect`, `searchParams`, API calls, auth, permisos, tracking, rutas, formularios complejos ni cache. Las constantes/datos resueltos permanecen en las paginas padre y se pasan como props.

### Componentes extraidos

| Fase | Componente extraido | Bloque original | Archivos tocados | Limite de seguridad |
| --- | --- | --- | --- | --- |
| 2.1 | `HowItWorksSection` | `Home.tsx` - seccion `Como funciona AquiTa.do` | `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/home/HowItWorksSection.tsx` | Solo JSX presentacional; `HOW_IT_WORKS_STEPS` permanece en `Home.tsx`. |
| 2.2 | `HomeDifferenceSection` | `Home.tsx` - seccion `Por que AquiTa.do es diferente` | `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/home/HomeDifferenceSection.tsx` | Solo JSX presentacional; `OPERATING_POINTS` permanece en `Home.tsx`. |
| 2.3 | `BusinessFeaturesSection` | `BusinessDetails.tsx` - seccion `Caracteristicas` | `apps/web/src/pages/BusinessDetails.tsx`, `apps/web/src/pages/business-details/BusinessFeaturesSection.tsx` | Solo render de chips; el guard `business.features && business.features.length > 0` permanece en `BusinessDetails.tsx`. |
| 2.4 | `BusinessCheckInStatsGrid` | `BusinessDetails.tsx` - grilla de metricas en `Actividad local` | `apps/web/src/pages/BusinessDetails.tsx`, `apps/web/src/pages/business-details/BusinessCheckInStatsGrid.tsx` | Solo render de metricas; el guard de check-ins, auth, boton y mensajes permanecen en `BusinessDetails.tsx`. |

### QA focalizado ejecutado

| Fase | Comando | Resultado |
| --- | --- | --- |
| 2.1 | `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 test / 1 file`. |
| 2.2 | `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 test / 1 file`. |
| 2.3 | `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/BusinessDetails.test.tsx` | Pass: `1 test / 1 file`. |
| 2.4 | `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/BusinessDetails.test.tsx` | Pass: `1 test / 1 file`. |

### QA amplio ejecutado

| Fase | Comando | Resultado |
| --- | --- | --- |
| 2.1 | `pnpm --filter @aquita/web typecheck` | Pass. |
| 2.1 | `pnpm --filter @aquita/web test` | Pass: unit `19 files / 53 tests`, integration `22 files / 65 tests`. |
| 2.1 | `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 113 tests`. |
| 2.2 | `pnpm --filter @aquita/web typecheck` | Pass. |
| 2.2 | `pnpm --filter @aquita/web test` | Pass: unit `19 files / 53 tests`, integration `22 files / 65 tests`. |
| 2.2 | `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 113 tests`. |
| 2.3 | `pnpm --filter @aquita/web typecheck` | Pass. |
| 2.3 | `pnpm --filter @aquita/web test` | Pass: unit `19 files / 53 tests`, integration `22 files / 65 tests`. |
| 2.3 | `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 113 tests`. |
| 2.4 | `pnpm --filter @aquita/web typecheck` | Pass. |
| 2.4 | `pnpm --filter @aquita/web test` | Pass: unit `19 files / 53 tests`, integration `22 files / 65 tests`. |
| 2.4 | `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 113 tests`. |

### Nota de QA

En los cierres amplios aparecio el warning conocido `Geoapify geocoding failed (HTTP 503)` dentro de tests unitarios de API. Es no bloqueante: las suites terminaron en pass y el warning no esta relacionado con las extracciones visuales de Fase 2.1, 2.2, 2.3 o 2.4.

## Avance de Fase 3: contrato frontend/API

Fase 3 inicio como auditoria sin modificar producto. El foco fue detectar riesgo de drift entre `apps/web/src/api/endpoints.ts`, los controllers criticos del API y los DTOs backend, especialmente en el contrato publico `GET /businesses`.

### Fase 3.4: check manual report-only

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-businesses-contract.mjs` |
| Contrato cubierto | `businessApi.getAll(params)` contra `BusinessQueryDto` para `GET /businesses` |
| Comando | `node scripts/check-businesses-contract.mjs` |
| Resultado actual | `Findings: none` |
| Modo | Manual/report-only; no esta conectado a CI y no bloquea builds |

Hallazgos actuales del check:

- `view` existe como param UI en `useBusinessesListFilters`, pero no se envia a `GET /businesses`.
- `search/q` esta controlado para este contrato: el listado envia `search`, no `q`.
- `latitude/lat` y `longitude/lng` estan controlados para este contrato: el listado envia `latitude`/`longitude`, no `lat`/`lng`.

Limites deliberados:

- No valida response shape.
- No hace requests reales.
- No depende de seeds.
- No cubre `/search/businesses`.
- No cubre auth, admin, roles ni org context.
- No cubre cache, ranking ni paginacion real.
- No esta conectado a CI.

Recomendacion: mantener este check fuera de CI hasta cerrar la tanda completa de checks manuales y decidir un gate con bajo ruido.

### Fase 3.6: check manual report-only

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-telemetry-growth-contract.mjs` |
| Contrato cubierto | `analyticsApi.trackGrowthEvent` contra `TrackGrowthEventDto` y `GrowthEventType` para `POST /telemetry/growth` |
| Comando | `node scripts/check-telemetry-growth-contract.mjs` |
| Resultado actual | `Findings: none` |
| Modo | Manual/report-only; no esta conectado a CI y no bloquea builds |

Hallazgos actuales del check:

- `/telemetry/growth` esta alineado con el controller alias: `@Controller` incluye `telemetry` y existe `@Post("growth")`.
- `TrackGrowthEventDto` importa, valida y tipa `eventType` con `GrowthEventType`.
- Los 20 valores frontend de `eventType` coinciden con los 20 valores backend de `GrowthEventType`.

Limites deliberados:

- No valida response shape.
- No valida metadata shape.
- No valida persistencia en DB.
- No valida rate limit.
- No inspecciona `AnalyticsService`.
- No hace requests reales.
- No esta conectado a CI.

Recomendacion: mantener este check fuera de CI hasta cerrar la tanda completa de checks manuales y decidir un gate con bajo ruido.

### Fase 3.7: check manual report-only

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-business-detail-contract.mjs` |
| Contrato cubierto | Wrappers publicos de detalle contra `GET /businesses/:identifier` |
| Comando | `node scripts/check-business-detail-contract.mjs` |
| Resultado actual | `Findings: none` |
| Modo | Manual/report-only; no esta conectado a CI y no bloquea builds |

Hallazgos actuales del check:

- `businessApi.getByIdentifier`, `businessApi.getById` y `businessApi.getBySlug` apuntan a `/businesses/${...}`.
- `prefetchPublicDetail` prefiere `slug`, usa `id` como fallback si falla el prefetch por slug y usa `id` cuando no hay `slug`.
- El backend expone `@Get(":identifier")` y usa `@Param("identifier")`.
- El detalle publico mantiene `OptionalJwtAuthGuard` y `OptionalOrgContextGuard`.
- No hay `JwtAuthGuard`, `RolesGuard` ni `@Roles` obligatorios en el detalle publico.

Limites deliberados:

- No valida response shape.
- No hace requests reales.
- No depende de seeds.
- No valida cache.
- No valida SEO, imagenes, reviews ni favoritos.
- No inspecciona Prisma/DB.
- No esta conectado a CI.

### Cierre de Fase 3

Fase 3 queda con tres checks estaticos manuales/report-only:

- `scripts/check-businesses-contract.mjs`: `GET /businesses`.
- `scripts/check-telemetry-growth-contract.mjs`: `POST /telemetry/growth`.
- `scripts/check-business-detail-contract.mjs`: `GET /businesses/:identifier`.

Los tres tienen resultado actual `Findings: none` y siguen fuera de CI. No se modificaron contratos, endpoints, controllers, DTOs ni `package.json`.

## Riesgos pendientes

- Fase 4.4 agrego `scripts/check-business-cache-events.mjs`, un check manual/read-only/report-only para mutaciones de negocio que cambian campos publicos sin publicar `business.changed`.
- Comando de ejecucion: `node scripts/check-business-cache-events.mjs`.
- Resultado inicial de Fase 4.4: `Findings (3)` report-only.
- Fase 4.6 corrigio `createClaimRequest` con `business.changed` despues de una claim request exitosa.
- `ClaimRequestCreated` sigue intacto en `createClaimRequest`.
- Resultado actual posterior a Fase 4.6: `Findings (1)` report-only.
- `scripts/check-business-cache-events.mjs` ahora reporta `publishBusinessChangedEvent: yes` para `createClaimRequest`.
- Fase 4.8 corrigio `expireStaleClaimRequests` con un patron diferido: el helper retorna `affectedBusinesses`, no publica eventos internamente, y sus callers publican `business.changed` despues de commit/operacion exitosa.
- Fase 4.9 ajusto `scripts/check-business-cache-events.mjs` para reconocer ese patron seguro.
- Resultado actual posterior a Fase 4.9: `Findings: none`.
- `scripts/check-business-cache-events.mjs` reporta `publishBusinessChangedEvent: no` y `deferred business.changed via callers: yes` para `expireStaleClaimRequests`.
- Fase 4.10 agrego un test unitario en `apps/api/src/businesses/businesses.service.spec.ts`: `expires stale claims during createClaimRequest and publishes deduped business.changed after commit`.
- El test protege que `createClaimRequest` publique `business.changed` una sola vez cuando hay claims stale del mismo negocio, con `businessId`, `slug`, `operation: "updated"` y despues del commit.
- El test confirma que `publishClaimRequestCreated` sigue llamandose y que la operacion retorna la claim request creada.
- Controles positivos detectados con `business.changed`: `createClaimRequest`, `reviewClaimRequest`, `updateAdminPublicationState`, `markBusinessClaimedAdmin`, `unclaimBusinessAdmin`, `revokeBusinessOwnership`, `delete`, `verify`, `update`, `create` y `resolveDuplicateCase`.
- El check sale con exit code `0`, no esta conectado a CI y no bloquea builds.
- QA de Fase 4.6: `node scripts/check-business-cache-events.mjs` pass; `pnpm --filter @aquita/api test` pass (`24 files / 113 tests`); `pnpm qa:smoke` pass.
- QA de Fase 4.8/4.9: `node scripts/check-business-cache-events.mjs` pass (`Findings: none`); `pnpm --filter @aquita/api typecheck` pass; `pnpm --filter @aquita/api test` pass en Fase 4.8 (`24 files / 113 tests`); `pnpm qa:smoke` pass.
- QA de Fase 4.10: `pnpm --filter @aquita/api exec vitest run src/businesses/businesses.service.spec.ts` pass (`1 file / 4 tests`); `pnpm --filter @aquita/api test` pass (`24 files / 114 tests`); `pnpm qa:smoke` pass.
- Warning conocido no bloqueante: `Geoapify geocoding failed (HTTP 503)` en tests de `IntegrationsService`.
- Estado actual: `check-business-cache-events` queda en `Findings: none` y el test unitario protege el cruce `createClaimRequest` / `expireStaleClaimRequests` para dedupe y publicacion post-commit.
- Proxima fase recomendada: cubrir `reviewClaimRequest` o un caller no transaccional de `expireStaleClaimRequests` antes de tocar TTLs, Redis real, response shape o CI.
- Fase 5.2 agrego `docs/AUTH_ORG_CONTEXT_RISK_MAP.md`, un mapa documental de riesgo de auth, permisos, roles y contexto de organizacion.
- Fase 5.4 agrego `scripts/check-auth-org-routes.mjs`, un check manual/read-only/report-only para mapear rutas protegidas, guards, roles y org context.
- Comando de ejecucion: `node scripts/check-auth-org-routes.mjs`.
- Resultado actual de Fase 5.4: backend routes mapeadas `181`, frontend routes mapeadas `25`, findings report-only `4`.
- `scripts/check-auth-org-routes.mjs` sale con exit code `0`, no esta conectado a CI y no bloquea builds.
- Findings actuales de Fase 5.4: `GET /businesses/:identifier` usa `OptionalJwtAuthGuard + OptionalOrgContextGuard`; `/app/invite` es authenticated-only en frontend con posible choque por rol backend; `/app/invite` puede chocar con `POST /organizations/invites/:token/accept` restringido a `USER` y `BUSINESS_OWNER`; `api/client.ts` inyecta `x-organization-id` globalmente desde `localStorage.activeOrganizationId`.
- Fase 5.6 agrego el test `allows every authenticated role to reach /app/invite` en `apps/web/src/routes/Router.test.tsx`.
- Comportamiento caracterizado en Fase 5.6: `USER`, `BUSINESS_OWNER` y `ADMIN` autenticados llegan a `/app/invite` en frontend.
- El backend mantiene la aceptacion de invitaciones restringida por rol en `POST /organizations/invites/:token/accept`: `USER` y `BUSINESS_OWNER`.
- El mismatch de `/app/invite` no se resolvio todavia; solo quedo caracterizado el comportamiento frontend actual.
- QA de Fase 5.6: `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/routes/Router.test.tsx -t "allows every authenticated role to reach /app/invite"` -> pass (`1 passed`, `3 skipped`, `1 file passed`).
- Fase 5.8 agrego el test `enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role` en `apps/api/src/auth/role-access.e2e.spec.ts`.
- Contrato caracterizado en Fase 5.8: `POST /api/organizations/invites/:token/accept` debe devolver `403` para `ADMIN`; `USER` y `BUSINESS_OWNER` no deben fallar por rol y, con invite token inexistente, deben recibir `404`.
- Resultado local de Fase 5.8: no validado por infraestructura.
- Causa del intento local: DB local no disponible, `ECONNREFUSED localhost:5432`.
- Intento con `node scripts/run-with-qa-stack.mjs -- pnpm --filter @aquita/api exec vitest run src/auth/role-access.e2e.spec.ts -t "enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role"` fallo porque Docker daemon no esta disponible (`dockerDesktopLinuxEngine` no encontrado).
- Estado de Fase 5.8: test implementado, pendiente de ejecutar en entorno con DB/Docker disponible.
- No hay evidencia de fallo del assert nuevo; el fallo local ocurrio antes de ejecutar el cuerpo del test.
- Fase 5.10 reforzo `scripts/check-auth-org-routes.mjs` para cubrir `/app/invite` de forma estatica/manual/report-only, sin DB runtime.
- El check reforzado valida estaticamente que `/app/invite` existe en `Router.tsx`, esta protegida por `ProtectedRoute` sin roles explicitos, `AcceptOrganizationInvite` usa `organizationApi.acceptInvite`, `organizationApi.acceptInvite` apunta a `POST /organizations/invites/${token}/accept`, `OrganizationsController` expone `@Post("invites/:token/accept")`, el endpoint usa `JwtAuthGuard` y `RolesGuard`, permite `USER` y `BUSINESS_OWNER`, y `RolesGuard` usa `getAllAndOverride`.
- Findings actuales de Fase 5.10: `4`.
- `/app/invite` mismatch queda explicito: frontend authenticated-only incluye `ADMIN`, pero backend accept invite excluye `ADMIN` y permite `USER`, `BUSINESS_OWNER`.
- El check de Fase 5.10 complementa, no sustituye, el e2e de `apps/api/src/auth/role-access.e2e.spec.ts`.
- El e2e `role-access` sigue pendiente por infraestructura DB/Docker; no hay validacion runtime de `403/404` todavia.
- QA de Fase 5.10: `node scripts/check-auth-org-routes.mjs` -> pass, exit `0`, findings report-only `4`.
- QA de Fase 5.10: `node --check scripts/check-auth-org-routes.mjs` -> pass, sintaxis valida.
- QA de Fase 5.10: `pnpm qa:smoke` -> pass.
- Warning conocido no bloqueante de Fase 5.10: `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API.
- Proximo paso recomendado de Fase 5: ejecutar el test backend/API en entorno QA/CI con DB disponible antes de decidir si se ajusta frontend, backend o permisos.
- Riesgos pendientes de Fase 5: `/app/invite` rol mismatch, `x-organization-id` global, combinacion `OptionalJwtAuthGuard + OptionalOrgContextGuard`, y session sync/refresh.
- `/reset-password` sigue `not-covered`; antes de implementarlo hay que confirmar si un token invalido puede cubrirse sin backend real ni cambios de producto.
- `/businesses` sigue `partial mejorado`, no `pass`; faltan filtros complejos, paginacion, errores API, SEO routes y no-results con URL estable.
- `/businesses/:slug` valido sigue bloqueado por falta de negocio seed real; no crear fixtures ni tocar Prisma solo para habilitarlo.
- El check 3.4 no cubre response shape, `/search/businesses`, auth/admin, cache, ranking ni paginacion real.
- El check 3.6 no cubre response shape, metadata shape, persistencia, rate limit, `AnalyticsService` ni CI gate.
- El check 3.7 no cubre response shape, requests reales, seeds, cache, SEO, imagenes, reviews, favoritos, Prisma/DB ni CI gate.
- Auth avanzado sigue incompleto: refresh expirado, refresh ausente, 2FA y throttling deben abordarse en fases separadas por riesgo.
- Rutas protegidas y permisos siguen siendo zona de alto riesgo: `/app/customer`, `/suggest-business`, `/security` y casos por rol no deben mezclarse con refactors.
- PWA/service worker, Redis/cache, Prisma/PostGIS y Docker siguen fuera de alcance hasta tener una fase dedicada y validacion mas amplia.
- Antes de tocar logica en `Home.tsx` o `BusinessDetails.tsx`, agregar caracterizacion del flujo que se vaya a modificar. Las extracciones actuales solo prueban que el render sigue compilando y que las rutas cubiertas siguen verdes.
- Antes de tocar `searchParams`, SEO routes o filtros, mantener una fase dedicada para `BusinessesList` y sus pruebas de URL/canonical/dependent cleanup.
- Antes de tocar auth o permisos, validar matriz por rol y no mezclar cambios con refactors visuales.
- Antes de tocar guards, `AuthContext`, `OrganizationContext`, `ProtectedRoute`, `api/client.ts` o `x-organization-id`, usar la salida de `scripts/check-auth-org-routes.mjs` y agregar caracterizacion acotada del flujo afectado.
- Antes de tocar API o cache, agregar contratos de respuesta e invalidacion especifica; no asumir que `qa:smoke` cubre datos stale o Redis.
- Riesgos pendientes de contrato tras Fase 3: response shape, auth avanzado, admin, cache, ranking, paginacion real, seeds y CI gate.

## QA recomendado para futuras fases

Para cambios documentales futuros no hace falta levantar la pila completa. Comandos recomendados:

```powershell
pnpm audit:architecture
pnpm check:encoding
```

Si se quiere una foto mas fuerte antes de iniciar Fase 2:

```powershell
pnpm qa:smoke
```

## Validacion manual recomendada

- Abrir `docs/FRAGILITY_ROADMAP.md` y confirmar que la matriz no marca como `pass` ningun flujo sin prueba directa.
- Confirmar que no hubo cambios en `apps/web/src/pages/**`, `apps/web/src/api/endpoints.ts`, auth, permisos, `searchParams`, service worker, Prisma, Redis ni Docker.
- Antes de implementar cualquier test recomendado, elegir una sola fila `partial` o `not-covered` y convertirla en un test de caracterizacion aislado.
