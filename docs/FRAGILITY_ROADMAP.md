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
| `/` home publico | partial mejorado | Medio: primera impresion, SEO, CTAs y datos dinamicos. | `playwright/specs/acceptance-public.spec.ts`, `navigation.e2e.spec.ts`, `a11y.spec.ts`, `visual.spec.ts` ahora cubre baseline visual desktop y mobile, `apps/web/src/pages/Home.test.tsx` | Caracterizar estados con datos vacios/lentos para secciones dinamicas y cualquier cambio futuro en busqueda/tracking. |
| `/businesses` listado publico | partial mejorado | Alto: filtros, mapa, paginacion, tracking y contrato API. | `playwright/specs/acceptance-public.spec.ts` cubre shell inicial publico y vista mapa; `apps/web/src/tests/integration/BusinessesList.integration.test.tsx`, `apps/web/src/pages/businesses-list/*.test.tsx` cubren partes de estado/filtros; `playwright/specs/visual.spec.ts` ahora cubre baseline visual desktop y mobile. | Browser test para combinaciones de filtros, paginacion, error API y no-results con URL estable. |
| `/businesses?view=map` vista mapa | partial | Alto: sincroniza URL, listado, seleccion y negocios sin coordenadas. | `acceptance-public.spec.ts`, `BusinessesList.integration.test.tsx` | Caracterizar seleccion de negocio, retorno a lista y edge case sin coordenadas. |
| `/businesses/:slug` detalle valido | partial mejorado | Alto: detalle publico, SEO, imagenes, reviews, favoritos y tracking. | `apps/web/src/pages/BusinessDetails.test.tsx`, `business-details/helpers.test.ts`, `playwright/specs/visual.spec.ts` ahora cubre baseline visual desktop y mobile con mocks deterministas. | Acceptance con slug seed real y contrato minimo de contenido visible; luego ampliar a estados con reviews reales/favoritos si se toca esa UX. |
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
| `/profile` | partial mejorado | Medio: perfil autenticado, avatar y datos de usuario. | `apps/web/src/pages/Profile.test.tsx`, `playwright/specs/visual.spec.ts` ahora cubre baseline visual desktop y mobile con payload determinista. | Acceptance autenticada con update error, estado vacio y roles USER/BUSINESS_OWNER si se redisenan secciones especificas. |
| `/dashboard` fresh business owner | partial | Alto: rol BUSINESS_OWNER, organizacion activa y CTA inicial. | `playwright/specs/acceptance-business.spec.ts` | Caracterizar dashboard con organizacion/negocio existente. |
| `/register-business` | partial | Alto: formulario multi-step, org context, uploads y validacion. | `playwright/specs/acceptance-business.spec.ts` | Characterization por pasos con datos invalidos y sin cambiar backend. |
| `/dashboard/businesses/:businessId/edit` | not-covered | Alto: ownership, org context, mutaciones y cache. | No encontrada. | Acceptance con negocio seed propiedad del usuario y caso no autorizado. |
| `/suggest-business` | not-covered | Medio: usuario final crea sugerencia y evita spam/errores. | No encontrada. | Acceptance USER con formulario vacio, validacion y submit mock/seed. |
| `/app/invite` | partial | Alto: token de invitacion, membresia, roles frontend/backend y org context. | `apps/web/src/routes/Router.test.tsx` ya valida que `USER` y `BUSINESS_OWNER` llegan a la ruta y que `ADMIN` redirige a `/admin`. `apps/api/src/auth/role-access.e2e.spec.ts` sigue validando runtime: `ADMIN` recibe `403`, `USER` y `BUSINESS_OWNER` reciben `404`, no `403`, con token inexistente. | Siguiente paso: acceptance con token invalido y token valido seed para cerrar UX, sin tocar roles ni backend. |
| `/admin` consola | partial | Alto: permisos ADMIN, tabla operacional y acciones sensibles. | `acceptance-admin.spec.ts`, `visual.spec.ts`, `auth.e2e.spec.ts` | Acceptance de estados vacio/error y una accion admin no destructiva. |
| `/security` admin security | not-covered | Alto: 2FA/admin security y permisos. | No encontrada. | Acceptance basica ADMIN y bloqueo USER/BUSINESS_OWNER. |
| Observability metrics | pass | Alto: endpoint sensible debe bloquear anonimo/no-admin. | `playwright/specs/admin-observability.e2e.spec.ts`, `apps/api/src/observability/observability.e2e.spec.ts` | Agregar summary/reset si se modifican metricas publicas. |
| PWA offline/reconnect | partial | Alto: contenido stale, SW activo y refetch. | `offline.e2e.spec.ts`, `AppRuntimeStatus.integration.test.tsx`, `scripts/check-pwa-offline-contract.mjs` como check estatico report-only. | Caracterizar hard refresh offline en `/` y `/businesses`, luego offline privado con sesion valida. |
| Visual baselines | partial mejorado | Medio: protege cambios accidentales en home desktop/mobile, Login/Register desktop/mobile, admin, `/profile` desktop/mobile, `/businesses` desktop/mobile y `BusinessDetails` desktop/mobile. | `playwright/specs/visual.spec.ts` | Ampliar cobertura visual a Dashboard, RegisterBusiness y vistas auth/profile por rol antes de refactors visuales mayores. |
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
- Resultado actual del check: backend routes mapeadas `181`, frontend routes mapeadas `25`, findings report-only `2`.
- `scripts/check-auth-org-routes.mjs` sale con exit code `0`, no esta conectado a CI y no bloquea builds.
- Findings actuales del check: `GET /businesses/:identifier` usa `OptionalJwtAuthGuard + OptionalOrgContextGuard`; `api/client.ts` inyecta `x-organization-id` globalmente desde `localStorage.activeOrganizationId`.
- Fase 5.12 alineo el contrato frontend de `/app/invite` con backend sin tocar backend ni auth global.
- Roles frontend permitidos en `/app/invite`: `USER` y `BUSINESS_OWNER`.
- `ADMIN` ya no llega a `/app/invite` y redirige temprano a `/admin` mediante `ProtectedRoute` / `resolveRoleHomePath`.
- `apps/web/src/routes/Router.test.tsx` quedo actualizado y verde.
- QA de Fase 5.12: `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/routes/Router.test.tsx` -> pass (`1 file passed`, `6 tests passed`).
- Fase 5.8 agrego el test `enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role` en `apps/api/src/auth/role-access.e2e.spec.ts`.
- Contrato caracterizado en Fase 5.8: `POST /api/organizations/invites/:token/accept` debe devolver `403` para `ADMIN`; `USER` y `BUSINESS_OWNER` no deben fallar por rol y, con invite token inexistente, deben recibir `404`.
- Validacion runtime ejecutada con: `node scripts/run-with-qa-stack.mjs -- pnpm --filter @aquita/api exec vitest run src/auth/role-access.e2e.spec.ts -t "enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role"`.
- Resultado runtime de Fase 5.8: pass.
- `ADMIN` recibe `403`.
- `USER` recibe `404`, no `403`.
- `BUSINESS_OWNER` recibe `404`, no `403`.
- Docker levanto DB y Redis correctamente.
- Migraciones, seed, build API/web y e2e completaron sin fallo.
- Aviso no bloqueante: Prisma `7.4.1 -> 7.8.0`.
- El e2e backend sigue conceptualmente valido y no cambio en Fase 5.12.
- Fase 5.10/5.12 dejan `scripts/check-auth-org-routes.mjs` alineado con el contrato actual de `/app/invite`.
- El check estatico valida ahora que `/app/invite` usa `ProtectedRoute` con roles explicitos `USER` y `BUSINESS_OWNER`, mientras `AcceptOrganizationInvite` sigue usando `organizationApi.acceptInvite` y el backend mantiene `JwtAuthGuard`, `RolesGuard` y roles `USER`, `BUSINESS_OWNER`.
- El finding de mismatch de `/app/invite` desaparecio del check.
- El check de Fase 5.10 complementa, no sustituye, el e2e de `apps/api/src/auth/role-access.e2e.spec.ts`.
- El e2e `role-access` ya quedo validado runtime; el check estatico sigue siendo complementario y no sustituye la validacion real de `403/404`.
- QA de Fase 5.12: `node scripts/check-auth-org-routes.mjs` -> pass, exit `0`, findings report-only `2`.
- QA de Fase 5.12: `pnpm qa:smoke` -> pass.
- Warning conocido no bloqueante de Fase 5.12: `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API.
- Nota no bloqueante de Fase 5.12: el primer intento local de `pnpm qa:smoke` agoto timeout; el rerun amplio termino en pass y no estuvo relacionado con producto.
- Estado actual de Fase 5: el contrato `/app/invite` queda caracterizado en frontend, backend y check estatico.
- Riesgos pendientes de Fase 5: `x-organization-id` global, combinacion `OptionalJwtAuthGuard + OptionalOrgContextGuard`, session sync/refresh y UX de token valido/invalido en `/app/invite`.
- Fase 6.2 agrego `docs/PWA_OFFLINE_RISK_MAP.md`, un mapa documental de riesgo PWA/cache/offline.
- Fase 6.4 agrego `scripts/check-pwa-offline-contract.mjs`, un check manual/read-only/report-only para caracterizar el contrato PWA/offline actual.
- Fase 6.6 corrigio el header de `service-worker.js` en `apps/web/nginx.conf` con una `location = /service-worker.js` dedicada.
- Politica esperada actual para `service-worker.js`: `Cache-Control: no-cache, no-store, must-revalidate` y `expires -1`.
- Comando de ejecucion: `node scripts/check-pwa-offline-contract.mjs`.
- Resultado actual: `exit 0`, report-only.
- Findings actuales del check:
  - `HIGH`: `CACHE_VERSION` fijo en `aquita-v1`.
  - `HIGH`: `APP_SHELL_ASSETS` no incluye bundles Vite hashados.
  - `INFO`: el service worker excluye `/api/*`.
  - `INFO`: `service-worker.js` tiene override dedicada en `nginx.conf`.
  - `MEDIUM`: el registro del service worker se difiere hasta `window.load`.
- El check no bloquea CI y no esta conectado a CI.
- Desaparecio el finding `HIGH` de `service-worker.js` heredando `immutable`.
- Fase 6.6 no corrigio todavia `CACHE_VERSION`, precache de bundles, timing de registro, offline privado ni hard refresh offline.
- QA de Fase 6.6: `node scripts/check-pwa-offline-contract.mjs` -> pass; `pnpm qa:smoke` -> pass.
- Warnings no bloqueantes de Fase 6.6: timeout local inicial de `pnpm qa:smoke`, `Geoapify geocoding failed (HTTP 503)` y warning `LF/CRLF` en `apps/web/nginx.conf`.
- Proxima fase recomendada de PWA/offline: caracterizar hard refresh offline en `/` y `/businesses`, y luego offline privado con sesion valida antes de tocar runtime.
- Fase 7.2 agrego baseline visual determinista para `/businesses` desktop y mobile en `playwright/specs/visual.spec.ts`.
- Snapshots creados en Fase 7.2: `playwright/specs/__snapshots__/visual.spec.ts/businesses-desktop.png` y `playwright/specs/__snapshots__/visual.spec.ts/businesses-mobile.png`.
- Mocks deterministas agregados en Fase 7.2 para `GET /api/businesses?*`, `GET /api/categories`, `GET /api/provinces` y `GET /api/ads/**` defensivo.
- Comando de generacion inicial de snapshots: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop|mobile) baseline" --update-snapshots` -> pass (`2 passed`).
- Comando de verificacion normal: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop|mobile) baseline"` -> pass (`2 passed`).
- Fase 7.2 no toco UI, estilos, filtros, `searchParams`, map view, tracking, API real ni seed; solo agrego caracterizacion visual.
- Fase 7.3 aplico una mejora visual minima en `apps/web/src/pages/BusinessesList.tsx` para limpiar el primer viewport sin tocar logica.
- Bloques tocados en Fase 7.3: intro superior, wrapper inmediato de `ListingControlsBar` y results header.
- Ajustes visuales aplicados en Fase 7.3: agrupacion local de intro + controls con spacing consistente, compactacion local de chips en `ActionBar` y reemplazo del wrapper pesado del results header por una superficie mas liviana.
- Comportamiento preservado en Fase 7.3: filtros, `searchParams`, mapa/view mode, tracking, API, hooks de datos y `BusinessCard`.
- QA de Fase 7.3: `pnpm --filter @aquita/web exec vitest run --config vitest.integration.config.ts src/tests/integration/BusinessesList.integration.test.tsx` -> pass (`8/8`).
- QA visual inicial de Fase 7.3: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop|mobile) baseline"` -> diff esperado contra baseline previo.
- Snapshots actualizados en Fase 7.3 con `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop|mobile) baseline" --update-snapshots` -> pass (`2/2`).
- QA visual final de Fase 7.3: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop|mobile) baseline"` -> pass (`2/2`).
- Warning no bloqueante de Fase 7.3: el primer rerun del wrapper `run-with-qa-stack` agoto timeout local durante el cierre del stack, pero el rerun con mas margen termino en pass limpio.
- Fase 7.4 agrego baseline visual determinista para `BusinessDetails` desktop y mobile en `playwright/specs/visual.spec.ts`, usando la ruta publica `/businesses/cafe-aquita`.
- Snapshots creados en Fase 7.4: `playwright/specs/__snapshots__/visual.spec.ts/business-details-desktop.png` y `playwright/specs/__snapshots__/visual.spec.ts/business-details-mobile.png`.
- Mocks deterministas agregados en Fase 7.4 para `GET /api/businesses/cafe-aquita`, fallback defensivo `GET /api/businesses/biz-1`, `POST /api/telemetry/business`, `GET /api/reputation/business/biz-1`, `GET /api/checkins/business/biz-1/stats`, `GET /api/promotions?businessId=biz-1&limit=6`, `GET /api/businesses/nearby?*` y `GET /api/reviews/business/biz-1`.
- Fase 7.4 tambien agrego un stub defensivo para `export/embed.html?*` para evitar ruido de red del mapa embebido durante el baseline visual.
- QA inicial de Fase 7.4 con snapshots: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop|mobile) baseline" --update-snapshots` -> pass (`2/2`).
- QA final de Fase 7.4: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop|mobile) baseline"` -> pass (`2/2`).
- Fase 7.4 no toco UI, estilos, logica, API real, seed, favoritos, reviews, claim states, `MobileContactBar` ni tracking; solo agrego caracterizacion visual determinista.
- Nota de Fase 7.4: hubo una ambiguedad de selector dentro del propio test visual y se corrigio solo en `playwright/specs/visual.spec.ts`, sin tocar producto.
- Fase 7.6 aplico una mejora visual minima al hero mobile de `BusinessDetails` en `apps/web/src/pages/BusinessDetails.tsx`.
- Cambios principales de Fase 7.6: `min-height` mobile ajustado, pill de galeria mas compacta, overlay inferior con mejor padding, layout interno mobile mas respirable y rating card mas controlada en mobile.
- Comportamiento preservado en Fase 7.6: logica, copy, handlers, estados, tracking, API, favoritos, reviews, claim states, `SidebarPanel`, `MobileContactBar` y thumbnails.
- QA de Fase 7.6: `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/BusinessDetails.test.tsx` -> pass (`1/1`).
- QA visual inicial de Fase 7.6: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop|mobile) baseline"` -> diff esperado contra baseline previo.
- Snapshots actualizados en Fase 7.6 con `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop|mobile) baseline" --update-snapshots` -> pass (`2/2`).
- QA visual final de Fase 7.6: `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop|mobile) baseline"` -> pass (`2/2`).
- Snapshots actualizados en Fase 7.6: `playwright/specs/__snapshots__/visual.spec.ts/business-details-desktop.png` y `playwright/specs/__snapshots__/visual.spec.ts/business-details-mobile.png`.
- Fase 7.6 no toco CSS global, API real, seed, favoritos, reviews, claim states, `SidebarPanel`, `MobileContactBar`, tarjeta de resumen, tracking, thumbnails ni logica de producto.
- `/reset-password` sigue `not-covered`; antes de implementarlo hay que confirmar si un token invalido puede cubrirse sin backend real ni cambios de producto.
- `/businesses` sigue `partial mejorado`, no `pass`; faltan filtros complejos, paginacion, errores API, SEO routes y no-results con URL estable.
- `/businesses/:slug` valido sigue bloqueado por falta de negocio seed real; no crear fixtures ni tocar Prisma solo para habilitarlo.
- El check 3.4 no cubre response shape, `/search/businesses`, auth/admin, cache, ranking ni paginacion real.
- El check 3.6 no cubre response shape, metadata shape, persistencia, rate limit, `AnalyticsService` ni CI gate.
- El check 3.7 no cubre response shape, requests reales, seeds, cache, SEO, imagenes, reviews, favoritos, Prisma/DB ni CI gate.
- Auth avanzado sigue incompleto: refresh expirado, refresh ausente, 2FA y throttling deben abordarse en fases separadas por riesgo.
- Rutas protegidas y permisos siguen siendo zona de alto riesgo: `/app/customer`, `/suggest-business`, `/security` y casos por rol no deben mezclarse con refactors.
- PWA/service worker, Redis/cache, Prisma/PostGIS y Docker siguen fuera de alcance hasta tener una fase dedicada y validacion mas amplia.
- PWA/offline sigue sin caracterizacion de hard refresh offline, primer arranque offline, update real del SW y bootstrap offline de `AuthContext`.
- Antes de tocar logica en `Home.tsx` o `BusinessDetails.tsx`, agregar caracterizacion del flujo que se vaya a modificar. Las extracciones actuales solo prueban que el render sigue compilando y que las rutas cubiertas siguen verdes.
- Antes de tocar `searchParams`, SEO routes o filtros, mantener una fase dedicada para `BusinessesList` y sus pruebas de URL/canonical/dependent cleanup.
- Antes de tocar auth o permisos, validar matriz por rol y no mezclar cambios con refactors visuales.
- Antes de tocar guards, `AuthContext`, `OrganizationContext`, `ProtectedRoute`, `api/client.ts` o `x-organization-id`, usar la salida de `scripts/check-auth-org-routes.mjs` y agregar caracterizacion acotada del flujo afectado.
- Antes de tocar API o cache, agregar contratos de respuesta e invalidacion especifica; no asumir que `qa:smoke` cubre datos stale o Redis.
- Riesgos pendientes de contrato tras Fase 3: response shape, auth avanzado, admin, cache, ranking, paginacion real, seeds y CI gate.

## Cierre temporal de Fase 7 visual

Fase 7 queda cerrada temporalmente como una tanda visual acotada y verificable. No se recomienda abrir otra fase visual grande antes de dejar este lote limpio, revisado y commiteable.

### Trabajo completado

| Item | Resultado |
| --- | --- |
| Baseline visual de `/businesses` | Agregado para desktop y mobile en `playwright/specs/visual.spec.ts`. Snapshots: `businesses-desktop.png` y `businesses-mobile.png`. |
| Baseline visual de `BusinessDetails` | Agregado para desktop y mobile en `playwright/specs/visual.spec.ts`. Snapshots: `business-details-desktop.png` y `business-details-mobile.png`. |
| Mejora visual en `BusinessesList` | Aplicada en el primer viewport: intro superior, wrapper de `ListingControlsBar` y results header. Se preservaron filtros, `searchParams`, mapa/view mode, tracking, API, hooks de datos y `BusinessCard`. |
| Mejora visual en `BusinessDetails` | Aplicada solo al hero mobile: mas aire vertical, pill de galeria mas compacta, overlay inferior con mejor padding, layout interno mas respirable y rating card mas controlada. Se preservaron logica, copy, handlers, estados, tracking, API, favoritos, reviews, claim states, `SidebarPanel`, `MobileContactBar` y thumbnails. |

### QA amplio ejecutado

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `pnpm --filter @aquita/web test` | Pass: unit `19 files / 56 tests`, integration `22 files / 68 tests`. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses|business details"` | Pass: `4 passed` (`/businesses` desktop/mobile y `BusinessDetails` desktop/mobile). |

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` sigue apareciendo en tests unitarios de API y no esta relacionado con Fase 7.

Estado: Fase 7 visual cerrada temporalmente, con snapshots actualizados y sin regresiones detectadas por QA amplio.

### Riesgos visuales pendientes

- `Home` sigue combinando varios lenguajes visuales; no tocar sin una fase visual dedicada.
- `AdminDashboard` no debe tocarse sin fase dedicada por riesgo de permisos, datos operacionales y estados admin.
- `BusinessesList` no debe tocar filtros, `searchParams`, mapa/view mode, tracking ni API sin fase especifica.
- `BusinessDetails` no debe tocar reviews, claim states, sidebar, `MobileContactBar`, favoritos ni tracking sin fase especifica.

## Avance de Fase 8: response shapes frontend/backend

Fase 8 inicio con auditoria y documentacion de response shapes sin modificar runtime. El objetivo es proteger contratos de salida antes de tocar envelopes, `endpoints.ts`, auth, admin dashboards o response DTOs.

### Fase 8.2: mapa documental

| Item | Resultado |
| --- | --- |
| Documento agregado | `docs/API_RESPONSE_SHAPE_RISK_MAP.md` |
| Alcance | Riesgos de response shape entre frontend y backend. |
| Runtime | Sin cambios. |

### Fase 8.4: check manual para GET /businesses

| Item | Resultado |
| --- | --- |
| Check agregado | `scripts/check-businesses-response-shape.mjs` |
| Comando de ejecucion | `node scripts/check-businesses-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none`. |
| Modo | Manual/read-only/report-only; exit `0`; no conectado a CI. |

Contrato `GET /businesses` validado y alineado:

- `data`
- `total`
- `page`
- `limit`
- `totalPages`

Notas del check:

- `source` aparece como metadata extra permitida y no requerida por `BusinessesList`.
- `JSON_API_RESPONSE_ENABLED` se reporta como warning informativo: si se activa sin adaptadores frontend, `GET /businesses` podria pasar de `response.data.data` a `response.data.data.data`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/check-businesses-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warning no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 8.4.

### Fase 8.6: check manual para auth session shape

| Item | Resultado |
| --- | --- |
| Check agregado | `scripts/check-auth-response-shape.mjs` |
| Comando de ejecucion | `node scripts/check-auth-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none`. |
| Modo | Manual/read-only/report-only; exit `0`; no conectado a CI. |

Contratos auth validados y alineados:

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`

Shape validado:

- `accessToken`
- `user`
- `securityWarnings` como extra opcional permitido

Notas del check:

- `authApi.login`, `authApi.register` y `authApi.refresh` apuntan a las rutas esperadas.
- Los wrappers no transforman `response.data`.
- `AuthContext` consume `accessToken` y `user` desde la raiz de `response.data`.
- `applySession` espera `accessToken` y `user`.
- `AuthController` expone `@Post("login")`, `@Post("register")` y `@Post("refresh")`.
- Los controller methods delegan a `AuthService`.
- `AuthService.login`, `AuthService.register` y `AuthService.refresh` usan `issueAuthSession`.
- `issueAuthSession` retorna `accessToken` y `user` en la raiz.
- `JSON_API_RESPONSE_ENABLED` se reporta como warning informativo: si se activa sin adaptadores frontend, auth podria pasar de `response.data.accessToken` / `response.data.user` a `response.data.data.accessToken` / `response.data.data.user`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/check-auth-response-shape.mjs` | Pass, `Findings: none`. |
| `node --check scripts/check-auth-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warning no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 8.6.

### Fase 8.8: check manual para GET /businesses/:identifier response shape

| Item | Resultado |
| --- | --- |
| Check agregado | `scripts/check-business-detail-response-shape.mjs` |
| Comando de ejecucion | `node scripts/check-business-detail-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none`. |
| Modo | Manual/read-only/report-only; exit `0`; no conectado a CI. |

Contrato validado y alineado:

- `GET /businesses/:identifier`

Shape validado:

- `response.data` es un objeto `Business` directo.
- `response.data.data` no se usa para el payload principal de `BusinessDetails`.

Notas del check:

- `businessApi.getByIdentifier`, `businessApi.getById` y `businessApi.getBySlug` apuntan a `/businesses/${...}`.
- Los wrappers no transforman `response.data`.
- `BusinessDetails` usa `getBySlug` con fallback `getByIdentifier`.
- `BusinessDetails` carga el negocio principal con `setBusiness(res.data)`.
- `BusinessesController` expone `@Get(":identifier")` y usa `@Param("identifier")`.
- El branch UUID delega a `findById`; el branch no UUID delega a `findBySlug`.
- La ruta mantiene `OptionalJwtAuthGuard` y `OptionalOrgContextGuard`.
- `findById` y `findBySlug` retornan `decorateBusinessProfile(...)` directamente.
- `businessDetailBaseSelect` existe y mantiene los campos principales de detalle.
- `decorateBusinessProfile` conserva el objeto con `...business` y agrega extras derivados sin envolver en `{ data }`.
- Extras permitidos actuales: `profileCompletenessScore`, `missingCoreFields`, `openNow`, `todayHoursLabel`.
- `JSON_API_RESPONSE_ENABLED` se reporta como warning informativo: si se activa sin adaptadores frontend, detalle publico podria pasar de `response.data` a `response.data.data`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/check-business-detail-response-shape.mjs` | Pass, `Findings: none`. |
| `node --check scripts/check-business-detail-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warning no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 8.8.

### Fase 9.2: mapa documental de admin/dashboard response shapes

| Item | Resultado |
| --- | --- |
| Documento agregado | `docs/ADMIN_RESPONSE_SHAPE_RISK_MAP.md` |
| Alcance | Solo documentacion; no se modifico producto. |

El mapa registra los riesgos de response shape en `AdminDashboard`:

- `GET /businesses/admin/all` como envelope paginado `{ data, total, page, limit, totalPages }`.
- `GET /verification/admin/moderation-queue` como `{ summary, items }`.
- Arrays directos en pending businesses, market reports y flagged reviews.
- Snapshots directos en catalog quality, market/growth insights, observability y health dashboard.
- Envelopes `{ data, summary }` en claim requests, business suggestions y duplicate cases.
- Riesgo transversal de `JSON_API_RESPONSE_ENABLED` para admin.

No se tocaron `AdminDashboard`, `endpoints.ts`, backend, controllers, DTOs, tests, runtime ni `JSON_API_RESPONSE_ENABLED`.

### Fase 9.4: check manual para GET /businesses/admin/all response shape

| Item | Resultado |
| --- | --- |
| Check agregado | `scripts/check-admin-businesses-response-shape.mjs` |
| Comando de ejecucion | `node scripts/check-admin-businesses-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none`. |
| Modo | Manual/read-only/report-only; exit `0`; no conectado a CI. |

Contrato validado y alineado:

- `GET /businesses/admin/all`

Shape validado:

- `data`
- `total`
- `page`
- `limit`
- `totalPages`

Notas del check:

- `businessApi.getAllAdmin` apunta a `api.get('/businesses/admin/all', { params })`.
- El wrapper no transforma `response.data`.
- `AdminDashboard.loadData` llama a `businessApi.getAllAdmin({ limit: 100 })`.
- `AdminDashboard.loadData` consume `businessesResponse.data.data`.
- `AdminDashboard.loadData` no consume `businessesResponse.data.items` ni array directo para este endpoint.
- `BusinessesController.findAllAdmin` expone `@Get('admin/all')`.
- `BusinessesController.findAllAdmin` mantiene `JwtAuthGuard`, `RolesGuard` y `@Roles('ADMIN')` como contexto informativo.
- El controller delega a `businessesService.findAllAdmin(query)`.
- `BusinessesService.findAllAdmin` retorna `data`, `total`, `page`, `limit` y `totalPages`.
- `data` deriva de `decorateBusinessProfiles(...)`.
- `JSON_API_RESPONSE_ENABLED` se reporta como warning informativo: si se activa sin adaptadores frontend, admin businesses podria pasar de `response.data.data` a `response.data.data.data`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/check-admin-businesses-response-shape.mjs` | Pass, `Findings: none`. |
| `node --check scripts/check-admin-businesses-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warnings no bloqueantes:

- Primer intento local de `pnpm qa:smoke` supero el timeout de 120s; rerun con timeout ampliado paso.
- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 9.4.

Riesgos pendientes antes de tocar response shapes:

- `GET /verification/admin/moderation-queue` con shape `{ items }`.
- Endpoints admin con `{ data, summary }`: claim requests, business suggestions y duplicate cases.
- Snapshots admin directos: catalog quality, market/growth insights, observability y health dashboard.
- Activacion futura de `JSON_API_RESPONSE_ENABLED` sin adaptadores frontend.

Proximo paso recomendado: disenar el check manual/report-only para `GET /verification/admin/moderation-queue` response shape.

## Fase 10.2: baseline visual de Home mobile

Fase 10.2 agrego el baseline visual faltante de Home mobile antes de cualquier rediseño. El alcance fue solo testing visual; no se modifico UI, estilos, logica, busqueda, tracking, rutas, copy, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshot creado | `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png` |
| Viewport | `390 x 844` |
| Mock reutilizado | `mockHomeVisualApi(page)` |

El test reutiliza los helpers visuales existentes del spec: `forceImmediateIntersections`, `stabilizeVisualRuntime`, `disableMotionForVisuals` y `disableDeferredRenderingForVisuals`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home mobile baseline" --update-snapshots` | Pass: `1 passed`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home mobile baseline"` | Pass: `1 passed`. |

Warning no bloqueante:

- Aviso de actualizacion Prisma `7.4.1 -> 7.8.0`; no esta relacionado con Fase 10.2.

## Fase 10.3: rediseño visual controlado de Home

Fase 10.3 aplico el primer slice de rediseño visual controlado de Home. El alcance fue visual-only: estructura local, spacing, jerarquia y superficies. No se modifico busqueda, tracking, rutas, copy, API, handlers, estado ni logica de producto.

| Item | Resultado |
| --- | --- |
| Archivos de UI tocados | `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/home/HowItWorksSection.tsx`, `apps/web/src/pages/home/HomeDifferenceSection.tsx` |
| Snapshots actualizados | `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png` |
| Bloques visuales tocados | Hero, radar local, `HowItWorksSection`, tarjetas de intencion, categorias/provincias, ranking, negocios recientes, `HomeDifferenceSection` y CTA final. |
| Comportamiento preservado | Busqueda, sugerencias, tracking, rutas, copy, API, carga de datos, estados, handlers y links existentes. |

Cambios principales:

- Hero mas compacto y respirable en desktop/mobile, sin cambiar el formulario ni el submit.
- CTAs del hero apilados en mobile y alineados en desktop sin cambiar destino ni copy.
- Radar local con padding y ritmo interno mas controlados.
- `HowItWorksSection` y `HomeDifferenceSection` con spacing y jerarquia mas consistentes.
- Bloques de intencion, categorias, provincias, ranking y negocios recientes compactados para reducir exceso de tarjetas apiladas.
- CTA final corregido a una superficie clara y estable; se corrigio antes de aceptar snapshots porque el primer diff visual exponia un problema de contraste.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop|mobile) baseline"` | Diff esperado contra baseline previo antes de actualizar snapshots. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots `home-desktop.png` y `home-mobile.png` actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop|mobile) baseline"` | Pass: `2 passed` con baseline actualizado. |

Warnings no bloqueantes:

- Aviso de actualizacion Prisma `7.4.1 -> 7.8.0`; no esta relacionado con Fase 10.3.
- Warning local de Git `LF will be replaced by CRLF` en archivos tocados; no esta relacionado con runtime ni producto.

Riesgos pendientes antes de continuar rediseño:

- No tocar busqueda, tracking, rutas, copy, API ni carga de datos de Home sin fase especifica.
- No tocar `AdminDashboard` sin baseline visual y fase dedicada.
- No extender el rediseño a Login/Register, Profile o Dashboard sin baseline y QA focalizado por vista.
- Si se sigue con Home, el proximo slice debe ser pequeno y visual-only, preferiblemente estados dinamicos o responsive edge cases.

## Fase 11.3: mejora visual controlada de BusinessDetails summary

Fase 11.3 aplico un slice visual acotado al summary card de `BusinessDetails`. El objetivo fue reducir la duplicacion visual entre hero y resumen sin tocar comportamiento, datos ni flujos sensibles.

| Item | Resultado |
| --- | --- |
| Archivo de UI tocado | `apps/web/src/pages/BusinessDetails.tsx` |
| Snapshots actualizados | `playwright/specs/__snapshots__/visual.spec.ts/business-details-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/business-details-mobile.png` |
| Bloque visual tocado | Summary card bajo el hero: CTAs, metadata, nombre repetido, rating secundario y caja de descripcion. |
| Comportamiento preservado | Logica, copy, handlers, estados, tracking, API, auth, favoritos, reviews, claim states, `SidebarPanel`, `MobileContactBar`, thumbnails y rutas. |

Cambios principales:

- Summary card con padding y spacing mas compactos.
- Nombre repetido con menor jerarquia que el hero.
- Rating secundario menos dominante y mas contenido.
- Separador interno antes de descripcion para ordenar metadata vs contenido.
- Descripcion en superficie neutral para no competir con el hero ni con el sidebar.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/BusinessDetails.test.tsx` | Pass: `1 file / 1 test`. |
| `pnpm --filter @aquita/web build` | Pass. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop\|mobile) baseline"` con `PLAYWRIGHT_BASE_URL=http://localhost:4173` | Diff esperado contra baseline previo antes de actualizar snapshots. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop\|mobile) baseline" --update-snapshots` con `PLAYWRIGHT_BASE_URL=http://localhost:4173` | Pass: `2 passed`; snapshots actualizados. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop\|mobile) baseline"` con `PLAYWRIGHT_BASE_URL=http://localhost:4173` | Pass: `2 passed` con baseline actualizado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "business details (desktop\|mobile) baseline"` | Pass: `2 passed`; levanto DB y Redis, ejecuto migraciones, seed, build API/web y visual baseline. |

Warnings no bloqueantes:

- Aviso de actualizacion Prisma `7.4.1 -> 7.8.0`; no esta relacionado con Fase 11.3.
- Warning local de Git `LF will be replaced by CRLF` en `apps/web/src/pages/BusinessDetails.tsx`; no esta relacionado con runtime ni producto.

Riesgos pendientes antes de continuar `BusinessDetails`:

- No tocar hero gallery, thumbnails, `SidebarPanel`, `MobileContactBar`, favoritos, reviews, claim states, contact/booking/message forms, tracking, API, auth ni `searchParams` sin fase especifica.
- Si se sigue con `BusinessDetails`, el proximo slice debe ser solo diagnostico o una mejora visual muy acotada sobre sidebar/contacto con baseline y caracterizacion previa.

## Fase 12.3: mejora visual controlada de BusinessCard

Fase 12.3 aplico un slice visual acotado a las cards del listado publico de negocios. El objetivo fue reducir ruido visual en badges/chips y mejorar jerarquia interna sin tocar filtros, URL state, mapa, tracking ni datos.

| Item | Resultado |
| --- | --- |
| Archivo de UI tocado | `apps/web/src/pages/businesses-list/BusinessCard.tsx` |
| Snapshots actualizados | `playwright/specs/__snapshots__/visual.spec.ts/businesses-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/businesses-mobile.png` |
| Bloque visual tocado | Contenido textual de la card: titulo, precio, categoria, ubicacion/distancia y fila de badges. |
| Comportamiento preservado | Props, handlers, favoritos, seleccion de mapa, `Link`, prefetch, rutas, filtros, `searchParams`, tracking, API, copy y estados. |

Cambios principales:

- Titulo y precio con jerarquia mas controlada.
- Categoria principal truncada y menos dominante.
- Ubicacion/distancia con alineacion mas estable.
- Badges secundarios mas compactos y separados del contenido principal.
- Trust chip con peso visual menor y ring contextual.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/businesses-list/BusinessCard.test.tsx` | Pass: `1 file / 2 tests`. |
| `pnpm --filter @aquita/web exec vitest run --config vitest.integration.config.ts src/tests/integration/BusinessesList.integration.test.tsx` | Pass: `1 file / 8 tests`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop\|mobile) baseline"` | Diff esperado contra baseline previo antes de actualizar snapshots. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "businesses (desktop\|mobile) baseline"` | Pass: `2 passed` con baseline actualizado. |

Warnings no bloqueantes:

- Aviso de actualizacion Prisma `7.4.1 -> 7.8.0`; no esta relacionado con Fase 12.3.
- Warning local de Git `LF will be replaced by CRLF` en `apps/web/src/pages/businesses-list/BusinessCard.tsx`; no esta relacionado con runtime ni producto.

Riesgos pendientes antes de continuar `BusinessesList`:

- No tocar filtros, `searchParams`, SEO routes, mapa/view mode, tracking, API ni hooks de datos sin fase especifica.
- No tocar `BusinessCard` para cambios funcionales sin caracterizacion focalizada de favorito, link, seleccion de mapa y prefetch.

## Mantenimiento Prisma 7.8.0

Se actualizo Prisma dentro del mismo major para eliminar el warning recurrente de `7.4.1 -> 7.8.0`. El cambio fue acotado a dependencias/tooling; no se modifico Prisma schema, migraciones, queries, `PrismaService`, controllers, services, DTOs, cache, Redis ni contratos API.

| Item | Resultado |
| --- | --- |
| Paquetes actualizados | `prisma`, `@prisma/client`, `@prisma/adapter-pg` de `7.4.1` a `7.8.0`. |
| Archivos tocados | `apps/api/package.json`, `pnpm-lock.yaml`, `apps/web/src/vite-env.d.ts`, `docs/FRAGILITY_ROADMAP.md`. |
| Ajuste auxiliar | `apps/web/src/vite-env.d.ts` declara `VITE_DISCOVERY_CORE_MODE` y `VITE_FEATURE_MESSAGING`, ya usadas por `apps/web/src/config/features.ts`; es type-only y no cambia runtime. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/api prisma:generate` | Pass; genero Prisma Client `7.8.0`. |
| `pnpm --filter @aquita/api typecheck` | Pass. |
| `pnpm --filter @aquita/api test` | Pass: `24 files / 114 tests`. |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm --filter @aquita/api exec prisma migrate status` | Pass; levanto DB y Redis, ejecuto `prisma generate`, `migrate deploy`, seed, build API/web, API start y `migrate status`; schema al dia. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests web/API. |

Warnings no bloqueantes:

- Durante `pnpm up` hubo warnings de red lenta/`ECONNRESET` recuperados por retry.
- `pnpm install` mantiene el warning conocido de build scripts ignorados para `@nestjs/core`, `@prisma/engines` y `prisma`; `prisma generate`, migraciones, seed y build pasaron despues.
- Warning local `Failed to create bin ... @sentry/node/node.exe.EXE`; no bloqueo install ni QA.
- `Geoapify geocoding failed (HTTP 503)` sigue apareciendo en tests unitarios de API y no esta relacionado con Prisma.

## Fase 13.2: baseline visual de Register mobile

Fase 13.2 agrego un baseline visual mobile para `/register` antes de tocar UI/auth. El alcance fue solo test visual; no se modifico UI, estilos, copy, auth, tracking, rutas, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshot creado | `playwright/specs/__snapshots__/visual.spec.ts/register-mobile.png` |
| Viewport | `390 x 844` |
| Ruta | `/register` |
| Mocking | No hizo falta mocking adicional; el baseline no depende de API real ni seed. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "register mobile baseline" --update-snapshots` | Pass: `1 passed`; snapshot creado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "register mobile baseline"` | Pass: `1 passed` con baseline actualizado. |

No se toco:

- UI, estilos, copy, busqueda, tracking, rutas, API real ni seed.
- `Register.tsx`, `Login.tsx`, `AuthPageShell`, `AuthContext`, `api/client.ts`, Google auth, formularios ni validaciones.

Proximo paso recomendado:

- Agregar baselines desktop para Login/Register antes de cualquier rediseño auth.

## Fase 13.3: baseline visual desktop de Login/Register

Fase 13.3 agrego baselines visuales desktop para `/login` y `/register` antes de tocar UI/auth. El alcance fue solo test visual; no se modifico UI, estilos, copy, auth, tracking, rutas, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshots creados | `playwright/specs/__snapshots__/visual.spec.ts/login-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/register-desktop.png` |
| Viewport | `1440 x 1200` |
| Rutas | `/login`, `/register` |
| Mocking | No hizo falta mocking adicional; los baselines no dependen de API real ni seed. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) desktop baseline" --update-snapshots` | Pass: `2 passed`; snapshots creados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) desktop baseline"` | Pass: `2 passed` con baseline actualizado. |

No se toco:

- UI, estilos, copy, busqueda, tracking, rutas, API real ni seed.
- `Register.tsx`, `Login.tsx`, `AuthPageShell`, `AuthContext`, `api/client.ts`, Google auth, formularios ni validaciones.

Proximo paso recomendado:

- Auditar visualmente Login/Register con los cuatro baselines existentes antes de cualquier cambio de UI.

## Fase 13.5: ajuste visual minimo de Register mobile

Fase 13.5 aplico un ajuste visual acotado al CTA final de `/register`. El objetivo fue evitar que el boton principal aparezca como accion adelantada en el baseline mobile por el contenedor sticky global, manteniendo el CTA en su posicion logica al final del formulario.

| Item | Resultado |
| --- | --- |
| Archivo de UI tocado | `apps/web/src/pages/Register.tsx` |
| Snapshot actualizado | `playwright/specs/__snapshots__/visual.spec.ts/register-mobile.png` |
| Bloque visual tocado | CTA final del formulario de registro. |
| Comportamiento preservado | Auth, validaciones, submit handler, estado `loading`, Google auth, tracking, rutas, API, copy, campos y enlaces. |

Cambios principales:

- `Register` deja de usar `StickyFormActions` global para su CTA final.
- El boton queda en un contenedor local no sticky con separador superior y el mismo ancho responsive.
- Mobile muestra el CTA despues de contrasena, confirmacion y terminos, sin competir con campos pendientes.
- Desktop se mantuvo estable en el baseline visual.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "register (desktop\|mobile) baseline"` | Diff esperado inicial en `register-mobile`; `register-desktop` pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "register (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshot mobile actualizado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "register (desktop\|mobile) baseline"` | Pass: `2 passed` con baseline actualizado. |

No se toco:

- `AuthContext`, `api/client.ts`, `endpoints.ts`, handlers, validaciones, Google auth, tracking, rutas, copy ni estilos globales.
- `StickyFormActions` global ni otras pantallas que lo usan.

Proximo paso recomendado:

- Hacer QA amplio de auth visual o pasar a una fase de diseno para `Login/Register` desktop sin tocar comportamiento.

## Fase 13.6: reduccion de peso visual del panel lateral auth

Fase 13.6 aplico la Opcion A del diseno visual de Login/Register: bajar el peso del panel lateral desktop para que el formulario sea el foco principal, manteniendo la estructura y comportamiento existentes.

| Item | Resultado |
| --- | --- |
| Archivo de estilo tocado | `apps/web/src/styles/blueprint.css` |
| Snapshots actualizados | `playwright/specs/__snapshots__/visual.spec.ts/login-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/register-desktop.png` |
| Bloques visuales tocados | `.auth-grid`, `.auth-aside-card`, `.auth-aside-card::after`, `.auth-mini-card`, `.auth-point` |
| Comportamiento preservado | Auth, rutas, API, tracking, copy, validaciones, Google auth, refresh/logout/session sync, roles, links y handlers. |

Cambios principales:

- El grid desktop reduce el peso relativo del panel lateral frente al formulario.
- El panel lateral cambia a un gradiente lineal mas sobrio.
- Se elimina el pseudo-elemento decorativo radial del panel lateral.
- Se suaviza el shadow del panel lateral.
- `auth-point` y `auth-mini-card` bajan ligeramente su intensidad visual.
- Mobile queda estable porque el panel lateral sigue oculto bajo `lg`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) (desktop\|mobile) baseline"` | Primer intento: timeout local esperando `/api/health/ready`; no ejecuto Playwright. Reintento: mobile pass, desktop diff esperado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) (desktop\|mobile) baseline" --update-snapshots` | Pass: `4 passed`; snapshots desktop actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) (desktop\|mobile) baseline"` | Pass final: `4 passed`. |

No se toco:

- `Login.tsx`, `Register.tsx`, `AuthPageShell.tsx`, `AuthContext`, `api/client.ts`, `endpoints.ts`, Google auth, validaciones, handlers, rutas, copy ni backend.

Warnings:

- Timeout local inicial de `run-with-qa-stack` esperando `/api/health/ready`; el reintento levanto DB/Redis, migraciones, seed, build API/web y previews correctamente.
- Git puede avisar LF/CRLF en `blueprint.css`; no bloqueante.

## Cierre temporal Fase 13: auth visual

El bloque visual de auth queda cerrado temporalmente con baselines para `/login` y `/register` en mobile y desktop, el ajuste visual minimo del CTA final de `/register` mobile y la reduccion controlada del peso visual del panel lateral desktop.

| Item | Resultado |
| --- | --- |
| Baselines cubiertos | `login-mobile.png`, `login-desktop.png`, `register-mobile.png`, `register-desktop.png` |
| Cambio visual aplicado | CTA final de `/register` mobile deja de usar el contenedor sticky global y queda al final logico del formulario; el panel lateral auth desktop baja su peso visual frente al formulario. |
| Estado del runtime | Sin cambios de auth, rutas, API, tracking, copy, validaciones, Google auth ni estilos globales. |

QA amplio ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "(login\|register) (desktop\|mobile) baseline"` | Pass final: `4 passed`. |

Warnings:

- No se observaron warnings bloqueantes en el cierre. Hubo un timeout local inicial de `run-with-qa-stack` esperando readiness del API, pero el reintento y el baseline final pasaron. La pila QA levanto DB/Redis, migraciones, seed, build API/web y previews correctamente.

Estado:

- Fase 13 auth visual cerrada temporalmente.
- Worktree limpio tras la validacion.

Riesgos pendientes:

- No redisenar `Login`/`Register` completo sin fase dedicada y baseline visual comparado.
- No tocar `AuthContext`, `api/client.ts`, `endpoints.ts`, Google auth, refresh/logout/session sync ni roles desde una fase visual.
- Si se continua con auth, el siguiente paso seguro es diseno visual desktop/mobile antes de otro cambio.

## Fase 14.1: baseline visual de Profile

Fase 14.1 agrego un baseline visual autenticado para `/profile` antes de redisenar la vista. El alcance fue solo test visual; no se modifico UI, estilos, logica, auth, rutas, backend, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshots creados | `playwright/specs/__snapshots__/visual.spec.ts/profile-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/profile-mobile.png` |
| Viewports | Desktop `1440 x 1200`; mobile `390 x 844` |
| Ruta | `/profile` |
| Sesion | `loginAsAdmin(page)` para usar el flujo autenticado existente. |
| Mocking determinista | `GET /api/users/me` y `GET /api/users/me/profile` para evitar variabilidad de seed en los datos visibles del perfil. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots creados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline"` | Pass: `2 passed` con baseline estable. |

No se toco:

- `apps/web/src/pages/Profile.tsx`, `AuthContext`, `api/client.ts`, `endpoints.ts`, `Router.tsx`, backend, auth, roles, rutas, copy, estilos, handlers, API real ni seed.

Warnings:

- No se observaron warnings bloqueantes. La pila QA levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.

Proximo paso recomendado:

- Auditar visualmente `/profile` desktop/mobile con los nuevos baselines antes de tocar UI. Si se mejora, empezar por un slice pequeno del primer viewport o de la jerarquia de cards, sin tocar avatar upload, update profile, auth ni permisos.

## Fase 14.3: mejora visual minima del top section de Profile

Fase 14.3 aplico un ajuste visual acotado al top section de `/profile`. El objetivo fue reducir la sensacion de card anidada en mobile y bajar el peso visual de las metricas iniciales sin tocar comportamiento ni formularios.

| Item | Resultado |
| --- | --- |
| Archivo de UI tocado | `apps/web/src/pages/Profile.tsx` |
| Snapshot actualizado | `playwright/specs/__snapshots__/visual.spec.ts/profile-mobile.png` |
| Bloque visual tocado | `AppCard` superior, `Toolbar` del top section y grid de metricas iniciales. |
| Comportamiento preservado | CTAs, handlers, copy, roles, auth, API, rutas, avatar upload/remove, update profile, cambio de contrasena y secciones admin profundas. |

Cambios principales:

- El `AppCard` superior reduce ligeramente su separacion vertical en mobile.
- El `Toolbar` deja de verse como card anidada en mobile; en desktop conserva una superficie suave.
- Las metricas iniciales usan una superficie mas liviana y sin shadow adicional.
- El baseline mobile queda mas corto y respirable; desktop se mantuvo estable.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Profile.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline"` | Diff esperado en `profile-mobile`; desktop pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshot mobile actualizado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

No se toco:

- `AuthContext`, `api/client.ts`, `endpoints.ts`, `Router.tsx`, backend, auth, roles, permisos, API real, seed, `ChangePasswordCard`, avatar upload/remove ni submit de perfil.

Warnings:

- No se observaron warnings bloqueantes. La pila QA levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.

Proximo paso recomendado:

- Antes de seguir puliendo `/profile`, disenar un slice separado para reducir duplicacion entre `Resumen de tu cuenta`, `Panorama rapido` y `Vista operativa`; no tocar formularios ni auth en esa fase.

## Fase 14.5: compactacion visual del lateral de Profile

Fase 14.5 aplico un ajuste visual acotado al lateral de `/profile` para reducir peso visual entre `Resumen de tu cuenta` y `Panorama rapido`. El alcance fue solo layout/clases locales; no se tocaron formularios, auth, API, roles ni secciones admin profundas.

| Item | Resultado |
| --- | --- |
| Archivo de UI tocado | `apps/web/src/pages/Profile.tsx` |
| Snapshots actualizados | `playwright/specs/__snapshots__/visual.spec.ts/profile-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/profile-mobile.png` |
| Bloque visual tocado | `secondary` del `DashboardContentLayout`: `StatusCard` de resumen, avatar/resumen, `InfoList`, `InsightCard` y `StatGroup` de panorama rapido. |
| Comportamiento preservado | CTAs, handlers, copy, roles, auth, API, rutas, avatar upload/remove, update profile, cambio de contrasena, `ChangePasswordCard` y secciones admin profundas. |

Cambios principales:

- El bloque lateral reduce spacing vertical entre cards en mobile.
- `Resumen de tu cuenta` usa padding local mas contenido y avatar ligeramente mas compacto en mobile.
- `InfoList` del resumen baja peso visual con items mas compactos y fondo mas ligero.
- `Panorama rapido` conserva su contenido, pero usa cards internas menos pesadas.
- En desktop, `Panorama rapido` queda en dos columnas dentro del lateral para no alargar demasiado la vista; en mobile mantiene una columna legible.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Profile.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline"` | Diff esperado en `profile-desktop` y `profile-mobile`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots desktop/mobile actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "profile (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

No se toco:

- `AuthContext`, `api/client.ts`, `endpoints.ts`, `Router.tsx`, backend, auth, roles, permisos, API real, seed, formularios, `ChangePasswordCard`, avatar upload/remove, submit de perfil, `Seguridad y acceso`, `Vista operativa`, reviews ni organizaciones recientes.

Warnings:

- No se observaron warnings bloqueantes. La pila QA levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.

Proximo paso recomendado:

- Hacer commit/push de este slice antes de abrir otra vista. Si se continua con `Profile`, disenar una fase separada para la zona admin profunda (`Seguridad y acceso`, `Vista operativa`, reviews y organizaciones recientes`) o cerrar temporalmente Profile y pasar a otra vista con baseline.

## Fase 15.1: diagnostico visual de Dashboard owner

Fase 15.1 reviso `/dashboard` owner sin modificar archivos. El objetivo fue confirmar riesgo antes de tocar una pantalla protegida por rol `BUSINESS_OWNER`.

Hallazgos:

- `/dashboard` esta protegido para `BUSINESS_OWNER`.
- No existia baseline visual para dashboard owner antes de Fase 15.2.
- `DashboardBusiness.tsx` combina `searchParams` para workspaces, `useOrganization`, organizacion activa, varios endpoints y workspaces lazy.
- La primera mejora segura no es tocar UI, sino capturar baseline visual determinista.

No tocar todavia:

- `DashboardBusiness.tsx`.
- `searchParams`, tabs/workspaces, `OrganizationContext`, `AuthContext`, `api/client.ts`, `endpoints.ts`, backend, permisos, org context ni contratos API.

## Fase 15.2: baseline visual de Dashboard owner

Fase 15.2 agrego baseline visual determinista para `/dashboard` owner en desktop y mobile. El alcance fue solo test visual; no se modifico producto, UI runtime, rutas, auth real, `searchParams`, backend, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshots creados | `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-mobile.png` |
| Viewports | Desktop `1440 x 1200`; mobile `390 x 844` |
| Ruta | `/dashboard` |
| Sesion | Sesion visual local con token no vencido y usuario `BUSINESS_OWNER`; sin login real ni seed. |
| Mocking determinista | `GET /api/users/me`, `GET /api/organizations/mine`, `GET /api/businesses/my`, `GET /api/analytics/dashboard/my`, `GET /api/businesses/me/claim-requests`, `GET /api/verification/businesses/:businessId/status` y `GET /api/verification/documents/my`. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots creados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed` con baseline estable. |

No se toco:

- `DashboardBusiness.tsx`, `Router.tsx`, `AuthContext`, `OrganizationContext`, `api/client.ts`, `endpoints.ts`, backend, permisos, org context, `searchParams`, rutas, copy, estilos runtime, handlers, API real ni seed.

Warnings:

- En el primer run, el seed uso fallback de provincias por fuente externa abortada; no bloqueante.
- Git puede avisar LF/CRLF en `visual.spec.ts`; no bloqueante.

Riesgo visual/IA pendiente:

- Los dashboards de los tres roles (`DashboardBusiness`, `CustomerDashboard`, `AdminDashboard`) se perciben demasiado amplios, con exceso de informacion y jerarquia visual poco clara.
- El producto aun necesita sentirse menos como pantallas con colores y mas como una experiencia de producto: flujos por prioridad, menos ruido, acciones principales claras y paneles con proposito.
- No corregir esto dentro de una fase puntual sin baseline y sin separar por rol. Debe abordarse como redisenio por vistas y por rol, empezando por diagnostico/baseline antes de cualquier UI.

Proximo paso recomendado:

- Cerrar/commitear Fase 15.2 antes de tocar dashboard UI.
- Luego iniciar una fase separada de diagnostico IA/visual para dashboards por rol:
  - owner dashboard primero por impacto operativo.
  - customer dashboard despues por menor riesgo.
  - admin dashboard al final, con baseline dedicado y contratos mas fuertes.

## Fase 15.3: diagnostico IA/visual de dashboards por rol

Fase 15.3 reviso los dashboards de los tres roles sin modificar archivos. El objetivo fue separar el problema visual de fondo antes de seguir aplicando cambios de UI.

Hallazgos:

- El problema principal no es solo color o componentes; es arquitectura de informacion.
- `DashboardBusiness` muestra demasiadas prioridades juntas: negocio activo, metricas, claim, verificacion, documentos, selector, tabs y siguientes pasos.
- `CustomerDashboard` combina favoritos, listas, reservas, check-ins e inbox en una vista larga; aun necesitaba baseline visual antes de tocar UI.
- `AdminDashboard` sigue siendo el mas riesgoso por tabs, permisos, contratos, tablas y acciones administrativas sensibles.
- Los dashboards deben migrar desde "todo visible" hacia "que hago ahora" por rol.

Principio de producto:

- Cliente: descubrir, guardar, comparar y volver a negocios.
- Owner: operar negocio, completar perfil, resolver claim/verificacion y atender clientes.
- Admin: revisar cola, resolver riesgo, mantener catalogo sano y observar sistema.

No tocar todavia:

- `AdminDashboard.tsx`, permisos, auth, `searchParams`, org context, `x-organization-id`, endpoints/API, tablas admin, acciones destructivas ni workspaces lazy.

## Fase 15.4: baseline visual de CustomerDashboard

Fase 15.4 agrego baseline visual determinista para `/app/customer` en desktop y mobile. El alcance fue solo test visual; no se modifico producto, UI runtime, rutas, auth real, backend, API real ni seed.

| Item | Resultado |
| --- | --- |
| Archivo modificado | `playwright/specs/visual.spec.ts` |
| Snapshots creados | `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-desktop.png`, `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-mobile.png` |
| Viewports | Desktop `1440 x 1200`; mobile `390 x 844` |
| Ruta | `/app/customer` |
| Sesion | Sesion visual local con token no vencido y usuario `USER`; sin login real ni seed. |
| Mocking determinista | `GET /api/users/me`, `GET /api/favorites/businesses/my`, `GET /api/favorites/lists/my`, `GET /api/bookings/me`, `GET /api/checkins/my`, `GET /api/messaging/conversations/me` y `GET /api/messaging/conversations/me/:id`. |

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots creados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed` con baseline estable. |

No se toco:

- `CustomerDashboard.tsx`, `CustomerActivityWorkspace.tsx`, `Router.tsx`, `AuthContext`, `api/client.ts`, `endpoints.ts`, backend, permisos, rutas, copy, estilos runtime, handlers, API real ni seed.

Hallazgo visual pendiente:

- Mobile queda muy largo y evidencia que el panel cliente tambien necesita priorizacion: primero continuidad de busqueda/favoritos, luego listas, y despues actividad profunda.
- La vista mezcla herramientas de decision (`favoritos/listas`) con historial operativo (`reservas/check-ins/inbox`) sin una jerarquia de producto clara.

Proximo paso recomendado:

- Commit/push de Fase 15.4 antes de tocar UI.
- Luego disenar una fase documental de arquitectura de informacion de dashboards por rol, con owner como primer candidato de redisenio controlado.

## Fase 15.5: arquitectura de informacion para dashboards por rol

Fase 15.5 convirtio el diagnostico visual de dashboards en una ruta documental de arquitectura de informacion. El objetivo fue evitar redisenar por estetica aislada y ordenar cada dashboard por el trabajo real del rol.

Documento creado:

- `docs/DASHBOARD_INFORMATION_ARCHITECTURE_PLAN.md`

Alcance:

- Solo documentacion.
- No se toco UI runtime, componentes, estilos, copy, rutas, auth, permisos, `searchParams`, API, backend, seed ni snapshots.

Hallazgos consolidados:

- El problema transversal de dashboards no es solo visual; es exceso de informacion con poca prioridad de accion.
- Owner debe responder primero: "que necesita atencion en mi negocio hoy".
- Customer debe responder primero: "que negocio guardado, lista o actividad debo retomar".
- Admin debe responder primero: "que riesgo operativo necesita revision o accion ahora".
- Mobile debe mostrar prioridad antes que amplitud; no basta con apilar todo el desktop.
- Desktop debe usar el espacio para comparacion y decision, no para sumar mas modulos con el mismo peso.

Modelo IA recomendado:

| Orden | Bloque | Proposito |
| --- | --- | --- |
| 1 | Contexto actual | Rol, negocio/usuario/consola activa. |
| 2 | Siguiente accion primaria | Una tarea clara, no varias CTAs equivalentes. |
| 3 | Estado critico | Solo blockers o senales que cambian la decision. |
| 4 | Area principal de trabajo | Contenido del rol o workspace activo. |
| 5 | Historial/detalle secundario | Debajo de la decision principal. |

Orden seguro propuesto:

| Fase | Objetivo | Alcance |
| --- | --- | --- |
| 15.6 | Disenar slice visual owner first viewport | Solo diseno; elegir bloques exactos y QA. |
| 15.7 | Implementar slice visual owner overview | `DashboardBusiness.tsx` local layout/classes, sin tocar `searchParams` ni workspaces. |
| 15.8 | QA/documentacion owner | Visual baseline, tests focalizados si existen, docs. |
| 15.9 | Disenar slice customer saved-discovery | Solo diseno; mantener `CustomerActivityWorkspace` intacto. |
| 15.10 | Implementar slice customer visual-only | `CustomerDashboard.tsx` local layout/classes. |
| 15.11 | Agregar admin mobile baseline | Test-only antes de tocar consola admin. |
| 15.12+ | Disenar IA admin por tab | Sin codigo hasta reforzar baseline/contratos. |

Que NO tocar todavia:

- `AdminDashboard.tsx`, tablas admin, acciones destructivas, permisos, roles, auth, org context, `x-organization-id`, `searchParams`, endpoints/API, contratos backend, workspaces lazy, tracking, seed ni PWA.
- En owner: no tocar `readWorkspace`, `handleWorkspaceChange`, `useOrganization`, llamadas API, verification upload/submit ni selector de negocio.
- En customer: no tocar favorite/list mutations, inbox, booking payment, conversation reply, React Query keys ni `CustomerActivityWorkspace` en el primer slice.

QA documental ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm check:encoding` | Pass: no suspicious mojibake patterns found. |

Proximo paso recomendado:

- Ejecutar QA documental.
- Commit/push de Fase 15.5 si el worktree queda limitado a docs.
- Luego iniciar Fase 15.6: diseno del primer slice owner first viewport, sin codigo todavia.

## Fase 15.6: diseno del slice owner first viewport

Fase 15.6 definio el primer cambio seguro para el dashboard owner sin modificar archivos. El objetivo fue elegir una mejora visual pequena antes de tocar una vista protegida por `BUSINESS_OWNER`.

Slice aprobado:

- Vista: `/dashboard`.
- Archivo candidato: `apps/web/src/pages/DashboardBusiness.tsx`.
- Bloques: header principal, grid de `SummaryCard`, y seccion `Control de claim y readiness`.
- Tipo de cambio: solo layout/clases locales para reducir ruido visual del primer viewport.

No tocar:

- `useSearchParams`, `readWorkspace`, `handleWorkspaceChange`, `useOrganization`, `activeOrganizationId`, API calls, response parsing, handlers, copy, rutas, workspaces lazy, selector de negocio, upload/submit de verificacion ni permisos.

QA recomendado:

- `pnpm --filter @aquita/web typecheck`
- `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop|mobile) baseline"`

## Fase 15.7: ajuste visual owner first viewport

Fase 15.7 implemento el slice visual aprobado para `/dashboard` owner. El cambio fue local y visual-only.

Archivo UI tocado:

- `apps/web/src/pages/DashboardBusiness.tsx`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-mobile.png`

Cambios principales:

- Header owner mas compacto y con acciones alineadas de forma mas estable en mobile/desktop.
- Chips de contexto con menor peso visual.
- Grid de metricas con menos separacion y menor sombra.
- `Control del negocio` y `Documentos y sello` con menos peso de card y padding interno mas contenido.
- Checklist rapido mas compacto y respirable, especialmente en mobile.
- Altura total del snapshot owner se redujo sin ocultar contenido.

Comportamiento preservado:

- Rutas, links, CTAs, copy, handlers, estados, `searchParams`, workspace activo, selector de negocio, `OrganizationContext`, `AuthContext`, API calls, response parsing, verificacion, documentos, workspaces lazy, permisos y backend.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots: desktop/mobile cambiaron por ajuste visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Primer rerun: desktop pass, mobile diff pequeno `0.01` por render; segundo rerun final pass: `2 passed`. |

Notas:

- No existe `apps/web/src/pages/DashboardBusiness.test.tsx`; por eso el gate focalizado fue typecheck + baseline visual con QA stack.
- La pila QA levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.

Proximo paso recomendado:

- Commit/push de Fase 15.7.
- Luego iniciar Fase 15.8 solo para QA amplio/cierre owner, o pasar a Fase 15.9: diseno del slice customer saved-discovery sin tocar `CustomerActivityWorkspace`.

## Fase 15.8: QA amplio de cierre owner

Fase 15.8 cerro el slice visual owner sin modificar archivos. El objetivo fue confirmar que el ajuste de Fase 15.7 no introdujo regresiones antes de pasar al dashboard customer.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Estado:

- No se hicieron cambios adicionales sobre `DashboardBusiness.tsx`.
- El bloque owner quedo listo para commit/push antes de abrir el slice customer.

## Fase 15.9: diseno del slice customer first viewport

Fase 15.9 definio el primer cambio seguro para el dashboard customer sin modificar archivos. El objetivo fue reducir ruido visual en `/app/customer` manteniendo intacta la zona profunda de actividad.

Slice aprobado:

- Vista: `/app/customer`.
- Archivo candidato: `apps/web/src/pages/CustomerDashboard.tsx`.
- Bloques: header principal, CTAs, metricas, `Tus favoritos` y `Tus listas`.
- Tipo de cambio: solo layout/clases locales para reducir cards apiladas y compactar el primer viewport.

No tocar:

- `CustomerActivityWorkspace.tsx`, React Query keys, `favoritesApi`, favorite/list mutations, inbox, bookings, check-ins, payments, rutas, auth, API, backend, copy, estilos globales ni snapshots fuera del baseline customer.

QA recomendado:

- `pnpm --filter @aquita/web typecheck`
- `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop|mobile) baseline"`

## Fase 15.10: ajuste visual customer first viewport

Fase 15.10 implemento el slice visual aprobado para `/app/customer`. El cambio fue local y visual-only.

Archivo UI tocado:

- `apps/web/src/pages/CustomerDashboard.tsx`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-mobile.png`

Cambios principales:

- Header customer mas compacto con menos padding y sin sombra adicional.
- CTAs del top section con spacing mas contenido.
- Metricas iniciales con menor separacion y menor peso de sombra.
- Cards de favoritos y listas mas compactas, con radios y padding reducidos.
- Skeletons de carga alineados al nuevo peso visual.
- Altura total del snapshot customer se redujo sin ocultar contenido.

Comportamiento preservado:

- Rutas, links, CTAs, copy, handlers, estados, React Query, favorite/list mutations, inbox, bookings, check-ins, payments, `CustomerActivityWorkspace`, auth, API, backend y estilos globales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots: desktop/mobile cambiaron por ajuste visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Notas:

- La pila QA levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.
- `git diff --check` solo reporto el warning conocido LF/CRLF en `CustomerDashboard.tsx`; no bloqueante.

Proximo paso recomendado:

- Commit/push de Fase 15.10.
- Luego no tocar `AdminDashboard` todavia. Primero agregar baseline visual dedicado si se decide avanzar con la consola admin.

## Fase 16.2: ajuste visual del hero de Home

Fase 16.2 aplico un ajuste visual controlado al hero de Home para que la pantalla se sienta mas producto de discovery y menos landing cargada. El cambio fue visual-only.

Archivo UI tocado:

- `apps/web/src/pages/Home.tsx`

Archivo de QA visual tocado:

- `playwright/specs/visual.spec.ts`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambios principales:

- Buscador reposicionado como accion central del hero.
- CTAs ubicados debajo del buscador con menor competencia visual.
- Chips decorativos con menor peso.
- Radar lateral mas compacto y menos dominante.
- Baseline desktop estabilizado usando captura `fullPage`, consistente con Home mobile.

Comportamiento preservado:

- Busqueda, rutas, tracking, handlers, API, datos, copy, auth, `searchParams`, backend y estilos globales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Estado:

- Commit/push realizado en `f5eb31f style: refine home hero visual hierarchy`.

## Fase 16.3: ajuste visual de Explora por intencion

Fase 16.3 aplico un segundo slice visual pequeno sobre Home, limitado a la seccion `Explora por intencion`. El objetivo fue reducir la sensacion de cards anidadas y hacer mas escaneables las rutas de discovery.

Archivo UI tocado:

- `apps/web/src/pages/Home.tsx`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambios principales:

- Contenedor de la seccion menos pesado que `section-shell`.
- Grid con spacing mas compacto.
- Cards de intencion mas livianas, sin `panel-premium`.
- Etiqueta repetida `Intencion` con menor peso visual.
- Altura de cards reducida sin cambiar contenido.

Comportamiento preservado:

- Links, rutas, tracking `SEARCH_QUERY`, metadata, copy, busqueda, API, datos, hooks, auth, backend y estilos globales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | No ejecutado por infraestructura local: Docker Desktop no estaba disponible. |
| `pnpm --filter @aquita/web build` | Pass. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` con `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173` | Diff esperado antes de actualizar snapshots. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` con `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173` | Pass: `2 passed`; snapshots actualizados. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` con `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173` | Pass final: `2 passed`. |

Notas:

- El fallback visual uso Vite preview local y mocks deterministas del spec; no hizo requests reales a API.
- Warning no bloqueante: Docker API no disponible en `npipe:////./pipe/dockerDesktopLinuxEngine`.

Proximo paso recomendado:

- Commit/push de Fase 16.3.
- Si se continua con Home, disenar primero el siguiente slice. Candidato seguro: estados vacios/dinamicos de `Ranking de reputacion` y `Negocios recientes`, sin tocar API ni carga de datos.

## Fase 16.4: ajuste visual de estados vacios de Home

Fase 16.4 aplico un slice visual pequeno sobre Home, limitado a los estados vacios de `Ranking de reputacion` y `Negocios recientes`. El objetivo fue reducir peso visual cuando no hay datos sin cambiar condiciones, carga, API ni copy.

Archivo UI tocado:

- `apps/web/src/pages/Home.tsx`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambios principales:

- Empty state del ranking mas compacto y con menor peso visual.
- Wrapper de negocios recientes mas contenido.
- Empty state de negocios recientes con menor altura y padding.
- Reduccion de altura total de Home en desktop/mobile cuando esos bloques no tienen data.

Comportamiento preservado:

- Copy, condiciones de render, `EmptyState`, CTAs, rutas, tracking, API, carga de datos, busqueda, backend, estilos globales y snapshots ajenos a Home.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `pnpm --filter @aquita/web build` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Primer intento detecto diff visual esperado, pero el preview no pudo iniciar porque el puerto `4173` estaba ocupado por un proceso local previo. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Notas:

- Para los runs exitosos, `run-with-qa-stack` levanto DB/Redis, migraciones, seed, build API/web y preview correctamente.
- El conflicto inicial de puerto `4173` fue local y no relacionado con producto; se libero el listener antes de regenerar snapshots.

Proximo paso recomendado:

- Commit/push de Fase 16.4.
- Si se continua con Home, disenar primero el siguiente slice. Candidato seguro: consolidar visualmente la narrativa de confianza o el bloque owner/CTA final, sin tocar API, ranking real, geolocalizacion ni busqueda.

## Fase 16.5: ajuste visual de confianza de Home

Fase 16.5 aplico el primer slice posterior a los estados vacios: la seccion `Por que AquiTa.do es diferente`. El objetivo fue reducir la sensacion de otra card premium pesada y hacer que las senales de confianza se lean como un bloque sobrio de producto.

Archivo UI tocado:

- `apps/web/src/pages/home/HomeDifferenceSection.tsx`

Cambios principales:

- Wrapper de confianza mas liviano que `section-shell`.
- Cards internas reemplazadas por paneles simples con borde y fondo suave.
- Spacing de grid mas compacto.
- Titulos internos con menor salto de escala.

Comportamiento preservado:

- Copy, orden de puntos, props, render condicional, rutas, tracking, API, datos, busqueda, backend y estilos globales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado: desktop cambio por el ajuste visual; mobile quedo estable. |

## Fase 16.6: ajuste visual del CTA owner de Home

Fase 16.6 aplico el segundo slice solicitado, limitado al CTA final para duenos de negocio. El objetivo fue bajar peso de landing, compactar jerarquia y mantener una llamada a accion clara sin cambiar enlaces ni copy.

Archivo UI tocado:

- `apps/web/src/pages/Home.tsx`

Snapshots actualizados:

- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambios principales:

- Banda final mas sobria con fondo `slate` suave.
- Ribbon decorativo con menor opacidad.
- Contenido centrado en un ancho mas controlado.
- Titulo desktop reducido de `5xl` a `4xl`.
- Spacing y padding del bloque final compactados.
- CTA principal conserva destino y label, con padding y escala mas controlados.

Comportamiento preservado:

- Copy, enlaces, labels dinamicos, condiciones de auth, rutas, tracking, API, datos, busqueda, backend, estilos globales y componentes compartidos.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `pnpm --filter @aquita/web build` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado: desktop/mobile cambiaron por los slices visuales. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Notas:

- `run-with-qa-stack` levanto DB/Redis, migraciones, seed, build API/web y preview correctamente en las corridas finales.
- No se tocaron API, ranking real, geolocalizacion, busqueda, rutas ni tracking.

Proximo paso recomendado:

- Commit/push de Fases 16.4, 16.5 y 16.6 juntas como bloque Home visual.
- Antes de seguir con otra seccion de Home, revisar manualmente `/` desktop/mobile para confirmar que la reduccion de ruido visual conserva suficiente separacion entre secciones.

## Fase 16.7: revision visual manual de cierre Home

Fase 16.7 reviso visualmente los snapshots actualizados de Home desktop/mobile antes de commit/push. No se hicieron cambios de UI en esta fase.

Archivos revisados:

- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Hallazgos:

- Desktop mantiene jerarquia clara: hero, como funciona, intenciones, taxonomia/provincias, ranking, recientes, confianza, CTA owner y footer.
- La seccion de confianza quedo mas sobria y menos parecida a otra capa de cards premium.
- El CTA owner final bajo peso visual y conserva CTA principal/secundario sin competir tanto con las secciones previas.
- Mobile no muestra solapamientos ni perdida de acciones principales.
- Mobile sigue siendo largo por acumulacion de secciones; eso queda como riesgo visual pendiente, no como regresion de esta fase.

Comportamiento preservado:

- No se tocaron UI, copy, rutas, tracking, busqueda, API, datos, geolocalizacion, backend, estilos globales ni snapshots fuera de Home.

QA usado como evidencia:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `pnpm --filter @aquita/web build` | Pass. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |

Riesgos pendientes:

- Home mobile sigue teniendo muchas secciones antes del footer.
- No tocar ranking real, recientes reales, geolocalizacion, busqueda, tracking ni API sin fase dedicada.
- Si se sigue refinando Home, conviene hacerlo con un slice por seccion y mantener baseline visual actualizado.

Estado:

- Bloque Home visual listo para commit/push.

## Fase 17.1: baseline visual de AdminDashboard mobile

Fase 17.1 agrego el baseline visual faltante de AdminDashboard en mobile antes de cualquier rediseno del panel admin. La fase se limito a test visual y snapshots; no se modifico runtime del dashboard.

Archivos tocados:

- `playwright/specs/visual.spec.ts`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-mobile.png`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-desktop.png`

Cambios principales:

- Nuevo test `admin dashboard mobile baseline @visual`.
- Viewport mobile: `390 x 844`.
- Ruta cubierta: `/admin`.
- Sesion admin levantada con `loginAsAdmin(page)` contra QA stack.
- Helper local `waitForAdminBusinessTabReady(page)` para capturar despues del estado final del tab de negocios, no durante loading.
- Snapshot desktop admin refrescado para alinear el baseline con la UI admin actual (`Consola activa`, `Acceso sensible`, `Acceso rapido`).

Comportamiento preservado:

- No se tocaron `AdminDashboard.tsx`, UI runtime, rutas, auth, permisos, roles, API, backend, `endpoints.ts`, DTOs, controllers, `searchParams`, acciones admin, tablas admin ni seed.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard mobile baseline" --update-snapshots` | Pass: `1 passed`; snapshot mobile creado. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard mobile baseline"` | Detecto que el snapshot mobile inicial capturaba loading; corregido esperando estado final del tab. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard mobile baseline" --update-snapshots` | Pass: `1 passed`; snapshot mobile regenerado con estado final. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard baseline" --update-snapshots` | Pass: `1 passed`; snapshot desktop admin actualizado al estado visual actual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"` | Pass final: `2 passed`. |
| `pnpm --filter @aquita/web typecheck` | Pass. |
| `pnpm qa:smoke` | Pass. |

Notas:

- `run-with-qa-stack` levanto DB/Redis, migraciones, seed, build API/web y preview en las corridas finales.
- La primera verificacion combinada fallo por drift de snapshot, no por cambio de producto.
- Warning no bloqueante: Geoapify geocoding failed `(HTTP 503)` durante unit tests.
- AdminDashboard sigue siendo zona de alto riesgo por contratos, tabs, permisos, acciones y volumen de informacion.

Proximo paso recomendado:

- Fase 17.2 solo diseno/auditoria visual de AdminDashboard desktop/mobile, enfocada en primer viewport, densidad de informacion, tabs y jerarquia. No tocar UI admin todavia.

## Fase 17.3: ajuste visual del primer viewport de AdminDashboard

Fase 17.3 aplico un slice visual minimo sobre el primer viewport de `AdminDashboard`. El objetivo fue reducir densidad inicial y hacer mas legibles las metricas y tabs sin tocar contratos, permisos, acciones ni carga de datos.

Archivos tocados:

- `apps/web/src/pages/AdminDashboard.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-mobile.png`

Cambios principales:

- Reemplazo del header KPI pesado por un bloque local con `SectionHeader` y `SummaryCard`.
- Metricas admin en 2 columnas mobile y 4 columnas desktop.
- `PageShell` sin spacing duplicado del primer viewport.
- Tabs admin con wrapper mas compacto y scroll horizontal controlado en mobile.

Comportamiento preservado:

- No se tocaron handlers, `useEffect`, `searchParams`, comportamiento de tabs, filtros, tablas internas, acciones admin, API, `endpoints.ts`, auth, roles, permisos, backend, DTOs, controllers ni seed.
- No se cambiaron rutas ni contratos.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"` | Diff visual esperado antes de actualizar snapshots |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline" --update-snapshots` | 2 passed |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"` | 2 passed |
| `pnpm qa:smoke` | Pass |

Resultado:

- Desktop queda mas sobrio en el primer viewport.
- Mobile reduce la altura inicial y muestra antes el contenido operativo.
- Snapshots actualizados para desktop y mobile.

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.

Riesgos pendientes:

- La tabla admin en mobile sigue dependiendo de scroll horizontal y necesita una fase dedicada.
- No tocar acciones destructivas, permisos, contratos, lazy workspaces ni response shapes dentro de ajustes visuales.

Proximo paso recomendado:

- Fase 17.4 solo diseno para la tabla/listado admin mobile o, alternativamente, cierre documental/commit de Fase 17.3 antes de tocar otro bloque.

## Fase 17.5: ajuste visual del listado admin

Fase 17.5 aplico un slice visual minimo sobre el listado de negocios del `AdminDashboard`. El objetivo fue bajar la sensacion de tabla tecnica en el primer bloque operativo, agrupar filtros y hacer mas clara la superficie de scroll sin tocar acciones, permisos, contratos ni carga de datos.

Archivos tocados:

- `apps/web/src/pages/AdminDashboard.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/admin-dashboard-mobile.png`

Bloques tocados:

- Wrapper visual de filtros del tab de negocios.
- Input de busqueda y selector de estado solo a nivel de clases locales.
- Chips de estado para mantener wrap limpio en mobile.
- Wrapper de scroll de la tabla y estilos del header.
- Boton secundario de actualizar conservando handler y jerarquia local.

Comportamiento preservado:

- Handlers, `useEffect`, `searchParams`, comportamiento de tabs, filtros reales, columnas de tabla, contenido de filas, acciones admin, `InlineDangerConfirm`, API, `endpoints.ts`, auth, roles, permisos, backend, DTOs, controllers y seed.
- No se cambiaron rutas, contratos, response shapes ni datos.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"` | Diff visual esperado antes de actualizar snapshots |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline" --update-snapshots` | 2 passed |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"` | 2 passed |
| `pnpm qa:smoke` | Pass |

Resultado:

- Los filtros quedan agrupados en una banda mas clara.
- La tabla queda contenida en una superficie de scroll mas evidente.
- Mobile conserva el contenido operativo sin cortar chips ni cambiar acciones.

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.

Riesgos pendientes:

- El listado admin sigue dependiendo de tabla con scroll horizontal; un rediseño real a cards responsive o vista compacta requiere fase dedicada.
- No tocar acciones destructivas, permisos, roles, contratos, response shapes, filtros reales ni backend dentro de ajustes visuales.

Proximo paso recomendado:

- Antes de seguir puliendo dashboard, hacer una auditoria read-only de duplicacion y exceso de informacion en los dashboards de los tres roles. No redisenar mas pantallas complejas sin baseline y contrato de datos claro.

## Fase 18.2: mapa de arquitectura de informacion de dashboards

Fase 18.2 documento el problema transversal de dashboards por rol sin modificar runtime. El objetivo fue evitar seguir agregando ajustes visuales aislados y ordenar las proximas fases segun la funcion real de cada pantalla.

Archivo creado:

- `docs/DASHBOARD_INFORMATION_ARCHITECTURE_MAP.md`

Hallazgos principales:

- `CustomerDashboard` mezcla panel personal, favoritos, listas, reservas, check-ins, inbox e hilo seleccionado en una sola vista.
- `DashboardBusiness` repite control, verificacion, perfil, negocio activo y revision documental en varias secciones.
- `AdminDashboard` sigue siendo el mas sensible por tabs, permisos, acciones destructivas, tablas y multiples contratos de datos.
- `DashboardLayout` suma contexto activo y accion rapida que pueden duplicar headers y CTAs locales.

Principios definidos:

- Una pantalla, una intencion principal.
- Una seccion, una funcion.
- Un CTA principal por viewport.
- No duplicar estados en formatos distintos.
- Bajar peso visual antes de eliminar funciones.
- No tocar `searchParams`, permisos, API ni workspaces lazy en fases visuales.

Que NO se toco:

- `DashboardBusiness.tsx`, `CustomerDashboard.tsx`, `AdminDashboard.tsx`, `DashboardLayout.tsx`, rutas, auth, permisos, org context, `searchParams`, API, backend, DTOs, estilos runtime, snapshots ni tests.

Proximo paso recomendado:

- Fase 18.3 solo diseno del primer slice owner para reducir duplicacion entre `Control del negocio`, `Documentos y sello`, `Negocio activo`, `Resumen del negocio`, `Completa tu perfil` y `Revision y documentos`.
- No implementar todavia sin aprobar el slice exacto.

## Fase 18.4: limpieza del resumen duplicado owner

Fase 18.4 implemento el primer slice owner aprobado. El cambio fue visual/estructural local y redujo duplicacion en el bloque de workspaces de `/dashboard`.

Archivos tocados:

- `apps/web/src/pages/DashboardBusiness.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-mobile.png`

Cambio aplicado:

- Se removieron las tres mini-cards duplicadas `Control`, `Verificacion` y `Perfil` dentro del header de workspaces.
- Se mantuvo el titulo del workspace y la descripcion de contexto.
- Se mantuvo el `workspace-strip` y todos los tabs.

Comportamiento preservado:

- `searchParams`, `readWorkspace`, `handleWorkspaceChange`, tabs, workspaces lazy, estado seleccionado, handlers, rutas, auth, permisos, org context, API, backend, DTOs y seed.
- No se eliminaron funciones ni acciones; solo se bajo repeticion visual.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | No ejecutado por infraestructura: Docker daemon no disponible. |
| `pnpm --filter @aquita/web build` | Pass |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Diff esperado: desktop/mobile reducen altura por eliminacion de cards duplicadas. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline" --update-snapshots` | 2 passed; snapshots actualizados. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | 2 passed final. |
| `pnpm qa:smoke` | Pass. |

Notas:

- La verificacion visual se corrio contra preview local en `127.0.0.1:4173` porque el QA stack no pudo levantar Docker.
- El preview local fue detenido al cerrar la validacion.
- Warning no bloqueante conocido: `Geoapify geocoding failed (HTTP 503)` durante unit tests.

Resultado:

- Owner dashboard queda menos repetitivo.
- Mobile reduce altura visible antes de los pasos finales.
- Se conserva navegacion por workspaces sin tocar URL state.

Riesgos pendientes:

- `Control del negocio`, `Documentos y sello`, `Completa tu perfil` y `Revision y documentos` todavia pueden consolidarse mas, pero eso requiere otro slice separado.
- No tocar workspaces lazy ni `searchParams` sin fase dedicada.

Proximo paso recomendado:

- Commit/push de Fase 18.4.
- Luego Fase 18.5 solo diseno para decidir si el siguiente recorte owner debe consolidar `Completa tu perfil` + `Revision y documentos`, o pasar a customer para reducir actividad profunda.

## Fase 18.6: consolidacion de siguientes pasos owner

Fase 18.6 implemento el segundo slice owner aprobado. El cambio fue visual/estructural local y consolido las dos superficies finales de accion de `/dashboard` en una sola seccion de siguientes pasos.

Archivos tocados:

- `apps/web/src/pages/DashboardBusiness.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-owner-mobile.png`

Cambio aplicado:

- Se consolidaron `Completa tu perfil` y `Revision y documentos` dentro de una sola card `Siguientes pasos`.
- El bloque interno mantiene dos paneles: perfil y revision/documentos.
- Se preservaron los CTAs existentes `Editar negocio` e `Ir a verificacion`.
- Se mantuvieron los datos existentes de perfil, documentos, claim summary y estado de verificacion sin crear nuevos calculos.

Comportamiento preservado:

- `searchParams`, `readWorkspace`, `handleWorkspaceChange`, tabs, workspaces lazy, estado seleccionado, handlers, rutas, auth, permisos, org context, API, backend, DTOs y seed.
- No se tocaron contratos, endpoints, tracking, permisos, loaders ni logica de negocio.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots por consolidacion visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests verdes. |

Resultado:

- Owner dashboard queda menos repetitivo en la parte final.
- La seccion final comunica un solo bloque de trabajo pendiente en lugar de dos cards competidoras.
- Mobile queda mas claro, aunque el dashboard sigue siendo largo por volumen real de informacion.

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- `Control del negocio` y `Documentos y sello` siguen siendo bloques primarios separados; cualquier consolidacion adicional debe ir en otro slice.
- `CustomerDashboard` sigue pendiente de una fase dedicada para reducir actividad profunda y evitar que parezca dos dashboards en uno.
- No tocar workspaces lazy, `searchParams`, permisos, API ni backend sin fase especifica.

Proximo paso recomendado:

- Cerrar Fase 18.6 con `qa:smoke`, commit y push.
- Luego pasar a diseno del siguiente slice customer, no seguir puliendo owner indefinidamente.

## Fase 18.8: compactacion del header de actividad customer

Fase 18.8 implemento el primer slice visual customer aprobado. El cambio fue local, visual y acotado al header/KPIs de actividad para reducir la sensacion de dashboard dentro de dashboard.

Archivos tocados:

- `apps/web/src/pages/customer-dashboard/CustomerActivityWorkspace.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-mobile.png`

Cambio aplicado:

- Se reemplazo el `KPIHeader` pesado de `Reservas, check-ins e inbox` por una seccion local sin card contenedora.
- Los KPIs de `Reservas`, `Check-ins`, `Loyalty points` y `Conversaciones` quedan en cards compactas de bajo peso visual.
- Se preservo el texto visible, el CTA `Actualizar actividad` y los valores mostrados.
- Mobile queda mas corto y menos cargado: el snapshot paso de 4158px a 3902px de alto.
- Desktop se mantuvo estable en estructura general, con menor peso visual en el primer bloque.

Comportamiento preservado:

- `loadCustomerActivity`, `loadThread`, `handleSendReply`, `handleBookingCheckout`, efectos, API calls, parsing de respuestas, estados, rutas, auth, permisos, endpoints y backend.
- No se tocaron reservas, check-ins, inbox, selected thread, reply form, checkout de pagos, contratos ni datos reales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots por ajuste visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests verdes. |

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Inbox y selected thread siguen conviviendo en la misma vista; puede requerir otro slice si se quiere reducir profundidad visual.
- Reservas y check-ins todavia muestran bastante detalle; no compactarlos sin fase propia.
- No tocar messaging, checkout, API, auth, permisos ni response shapes sin fase especifica.

Proximo paso recomendado:

- Commit/push de Fase 18.8.
- Luego Fase 18.9 solo diseno para decidir si el siguiente recorte customer debe enfocarse en inbox/thread o en compactar reservas/check-ins.

## Fase 18.10: compactacion visual de inbox customer

Fase 18.10 implemento el segundo slice visual customer aprobado. El cambio fue local y redujo el peso visual de `Mi inbox` y `Hilo seleccionado` sin tocar mensajeria runtime.

Referencia revisada:

- `https://www.yelu.do/`

Archivos tocados:

- `apps/web/src/pages/customer-dashboard/CustomerActivityWorkspace.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-mobile.png`

Cambio aplicado:

- Se compacto el `SplitPanelLayout` de inbox/thread con menor gap, padding y sombra local.
- La lista de conversaciones dejo de envolver `EntityListItem` dentro de otro card/boton pesado.
- El estado seleccionado conserva el highlight, pero con una superficie mas limpia.
- El hilo seleccionado mantiene header, mensajes y formulario, con cards internas mas compactas.
- El textarea de respuesta bajo su altura minima visual sin cambiar valor, disabled state ni submit.
- Mobile bajo de 3902px a 3748px de alto en el snapshot.
- Desktop bajo de 2348px a 2288px de alto en el snapshot.

Comportamiento preservado:

- `loadThread`, `handleSendReply`, `selectedConversationId`, `conversationThread`, `replyDraft`, `threadLoading`, `actionKey`, estados de loading/error/success, API calls, response parsing, rutas, auth, permisos y backend.
- No se tocaron reservas, check-ins, checkout, contratos, endpoints ni datos reales.
- No se cambio copy funcional.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots por compactacion visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests verdes. |

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Reservas/check-ins aun son cards detalladas; compactarlas requiere fase separada.
- El dashboard customer sigue siendo largo por volumen real de informacion.
- No tocar mensajeria, checkout, API, auth, permisos, response shapes ni backend sin fase especifica.

Proximo paso recomendado:

- Commit/push de Fase 18.10.
- Luego Fase 18.11 solo diseno para decidir si el siguiente slice customer debe compactar reservas/check-ins o volver a Home con enfoque de producto mas claro.

## Fase 18.12: compactacion visual de reservas y check-ins customer

Fase 18.12 implemento el tercer slice visual customer aprobado. El cambio fue local y redujo el peso visual de `Mis reservas` y `Mis check-ins` sin tocar actividad runtime.

Archivos tocados:

- `apps/web/src/pages/customer-dashboard/CustomerActivityWorkspace.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/dashboard-customer-mobile.png`

Cambio aplicado:

- Se compactaron las cards de `Mis reservas` y `Mis check-ins` con menor gap, padding y sombra local.
- Las reservas dejaron de usar `EntityListItem` pesado y pasaron a filas locales mas claras.
- Los check-ins dejaron de usar `EntityListItem` pesado y pasaron a filas locales compactas.
- Se mantuvieron negocio, fecha, estado, monto, promo, cantidad de personas, puntos y ubicacion/verificacion.
- El CTA `Pagar reserva` conserva handler, disabled state y texto.
- Mobile bajo de 3748px a 3690px de alto en snapshot.
- Desktop bajo de 2288px a 2210px de alto en snapshot.

Comportamiento preservado:

- `loadCustomerActivity`, `handleBookingCheckout`, bookings/checkins API calls, response parsing, estados, checkout, inbox/thread, rutas, auth, permisos, backend y contratos.
- No se tocaron messaging, API, checkout runtime ni copy funcional.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots por compactacion visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests verdes. |

Warnings no bloqueantes:

- `Geoapify geocoding failed (HTTP 503)` durante unit tests.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Estado:

- Customer dashboard queda mas limpio en actividad, inbox, reservas y check-ins.
- No quedan cambios funcionales pendientes para esta vista dentro de esta tanda.

Proximo paso recomendado:

- Commit/push de Fase 18.12.
- Luego hacer cierre temporal de dashboards o volver a Home con enfoque de producto real, pero no abrir mas cambios antes de revisar lote.

## Fase 19.3: Home hero product-first

Fase 19.3 aplico un slice visual/copy acotado al hero de Home para que la primera impresion se sienta mas producto de discovery y menos landing decorativa.

Archivos tocados:

- `apps/web/src/pages/Home.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambio aplicado:

- El H1 se simplifico a una promesa mas directa: negocios locales confiables en RD.
- El buscador paso a ser la superficie principal del hero, con mayor contraste y CTA `Buscar negocios`.
- Se bajaron microtextos tecnicos/decorativos del hero.
- Se quitaron contadores del hero para evitar mostrar `0 negocios` como senal primaria cuando la base real aun esta vacia.
- Las senales visibles quedaron enfocadas en utilidad: horarios, ubicacion local y contacto directo.
- El radar local bajo de peso y quedo como apoyo solo desktop.
- Mobile redujo altura visual de Home de 6981px a 6170px en snapshot.
- Desktop redujo altura visual de Home de 4039px a 3949px en snapshot.

Comportamiento preservado:

- `handleSearch`, `searchQuery`, sugerencias, tracking `home-hero-search`, rutas `/businesses` y `registerBusinessPath`, API calls, carga de datos, ranking, categorias, provincias, negocios recientes y backend.
- No se tocaron `searchParams`, filtros, mapa, endpoints, hooks de datos, auth, permisos ni estilos globales.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Fallo por infraestructura: Docker daemon no disponible. |
| `pnpm build:web` | Pass |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots por cambio visual. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home desktop baseline"` | Pass: `1 passed` tras un primer flake local de altura full-page. |
| `pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| Browser local en `http://127.0.0.1:4173/` | DOM confirmo H1, buscador principal y CTAs esperados. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. |

Warnings no bloqueantes:

- Docker Desktop no estuvo disponible para `run-with-qa-stack`; se uso build web + preview local porque el visual Home usa mocks deterministas y no depende de DB real.
- El primer rerun desktop tuvo flake de altura full-page; el rerun focalizado y el rerun combinado final pasaron.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Home sigue dependiendo de contenido real para sentirse viva; si la DB publica esta vacia, `/businesses` y `BusinessDetails` siguen comunicando poco valor.
- El copy de Login/Register aun conserva lenguaje tecnico como SaaS/administracion/organizacion.
- No agregar `cerca de mi`, geolocalizacion ni nuevas secciones sin fase propia.

Proximo paso recomendado:

- Decidir entre commit/push de Fase 19.3 o seguir con Fase 19.4: secciones debajo del hero en Home.

## Fase 19.4: Home secciones debajo del hero

Fase 19.4 aplico un slice visual/copy acotado a las primeras secciones debajo del hero para reducir ruido visual sin tocar busqueda, rutas, tracking ni data fetching.

Archivos tocados:

- `apps/web/src/pages/Home.tsx`
- `apps/web/src/pages/home/HowItWorksSection.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambio aplicado:

- `Como funciona AquiTa.do` dejo de vivir dentro de una card grande con ribbon decorativo.
- La seccion de pasos quedo mas plana, con borde inferior, cards simples y copy menos tecnico.
- `Explora por intencion` paso a `Explora por necesidad` con jerarquia mas humana.
- Se elimino el wrapper tipo card grande alrededor de las rutas por necesidad para evitar cards dentro de cards.
- Las cards de intencion quedaron mas limpias y orientadas a accion real.
- Home desktop bajo de 3949px a 3845px en snapshot.
- Home mobile bajo de 6170px a 6040px en snapshot.

Comportamiento preservado:

- `handleSearch`, sugerencias, tracking `home-hero-search`, tracking `home-intent-card`, rutas de intencion, API calls, ranking, categorias, provincias, negocios recientes, auth y backend.
- No se tocaron `searchParams`, filtros, mapa, endpoints, hooks de datos, service worker, PWA ni estilos globales.
- No se tocaron ranking, negocios recientes, footer ni CTA final en esta fase.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots. Stack levanto DB, Redis, migraciones, seed, build API/web y visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. |

Warnings no bloqueantes:

- El primer visual fallo por diff esperado del cambio visual.
- `run-with-qa-stack` actualizo Prisma Client 7.8.0 durante `prisma generate`, sin cambios de schema.
- Geoapify 503 conocido en unit tests de API como warning no bloqueante.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Ranking, negocios recientes y footer siguen pendientes de una fase visual propia.
- Home aun puede sentirse larga en mobile si la data real esta vacia.
- No agregar metricas falsas, negocios inventados ni mapas decorativos sin respaldo de datos reales.

Proximo paso recomendado:

- Commit/push de Fase 19.4 antes de continuar con otra pantalla.

## Fase 19.5: estados vacios de Home product-first

Fase 19.5 aplico un slice visual/copy acotado a los estados vacios de `Ranking de reputacion` y `Negocios recientes` para que Home comunique un producto vivo aun cuando no haya suficiente data publica. No se modificaron condiciones, carga de datos, API, tracking ni rutas.

Archivos tocados:

- `apps/web/src/pages/Home.tsx`
- `playwright/specs/visual.spec.ts`
- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambio aplicado:

- El subtitulo de `Ranking de reputacion` ahora explica que el ranking depende de senales suficientes.
- El empty state de ranking dejo de sonar como filtro fallido y comunica que se estan reuniendo senales confiables.
- Se agrego un CTA existente hacia `/businesses` en el empty state de ranking: `Explorar directorio`.
- El subtitulo de `Negocios recientes` ahora habla de fichas publicadas y opciones locales.
- El empty state de negocios recientes comunica que el directorio se llenara con perfiles publicados y conserva el CTA existente para registrar negocio.
- `playwright/specs/visual.spec.ts` actualizo solo los anchors textuales del baseline Home para el nuevo copy.
- Home desktop subio de 3845px a 3927px por el nuevo contexto y CTA de empty states.
- Home mobile subio de 6040px a 6182px por el nuevo contexto y CTA de empty states.

Comportamiento preservado:

- `handleSearch`, sugerencias, tracking `home-hero-search`, tracking `home-intent-card`, rutas de intencion, ruta `/businesses`, `registerBusinessPath`, carga de ranking, cambio de provincia, render con ranking real, render con negocios recientes reales, API calls, auth, backend y estilos globales.
- No se tocaron `searchParams`, filtros, mapa, endpoints, hooks de datos, geolocalizacion, service worker, PWA ni contratos.
- No se agregaron metricas falsas, negocios inventados, testimonios ni nuevas secciones.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots. Stack levanto DB, Redis, migraciones, seed, build API/web y visual. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. |

Warnings no bloqueantes:

- El primer visual fallo por diff esperado del cambio visual.
- `run-with-qa-stack` actualizo Prisma Client 7.8.0 durante `prisma generate`, sin cambios de schema.
- Geoapify 503 conocido en unit tests de API como warning no bloqueante.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Home sigue siendo larga en mobile por acumulacion de secciones; cualquier reduccion adicional debe ser otro slice por seccion.
- Footer y owner CTA aun pueden simplificarse mas si se decide continuar con Home.
- No agregar `cerca de mi`, geolocalizacion, ranking real nuevo, mapas, testimonios o datos simulados sin fase especifica.

Proximo paso recomendado:

- Commit/push de Fase 19.5.
- Luego disenar el siguiente slice visual antes de tocar otra pantalla; candidato seguro: footer/CTA final de Home o cierre temporal de Home y pasar a Login/Register/Profile segun prioridad de lanzamiento.

## Fase 19.6: CTA final y footer de Home product-first

Fase 19.6 aplico un slice visual/copy acotado al CTA final de Home y al footer no compacto para que el cierre de la pagina se sienta mas sobrio, local y orientado a producto real. No se tocaron rutas, busqueda, tracking, API, carga de datos ni estilos globales.

Archivos tocados:

- `apps/web/src/pages/Home.tsx`
- `apps/web/src/components/Footer.tsx`
- `playwright/specs/__snapshots__/visual.spec.ts/home-desktop.png`
- `playwright/specs/__snapshots__/visual.spec.ts/home-mobile.png`

Cambio aplicado:

- El CTA final dejo de usar la cinta decorativa y la superficie gris/gradiente; ahora usa una banda blanca con borde sobrio.
- El chip del CTA final paso a `Para negocios locales`, con tratamiento neutral.
- El titulo del CTA final paso a enfocarse en aparecer y ser encontrado en AquiTa.do.
- El texto del CTA final se ajusto hacia ficha clara, horarios, ubicacion y contacto en RD.
- El CTA principal del bloque usa `btn-primary` en vez de `btn-accent` para reducir competencia visual.
- El footer no compacto dejo de usar gradiente/backdrop y redujo spacing vertical.
- El footer removio el lenguaje `SaaS` y lo reemplazo por tags mas utiles para usuario final: `Directorio`, `Negocios` y `RD`.
- La descripcion del footer ahora habla de descubrir negocios confiables, comparar senales utiles y contactar opciones en RD.
- Home desktop bajo de 3927px a 3851px en snapshot.
- Home mobile bajo de 6182px a 6082px en snapshot.

Comportamiento preservado:

- `registerBusinessPath`, `registerBusinessLabel`, ruta `/businesses`, rutas de footer, busqueda, tracking, API, datos dinamicos, ranking, negocios recientes, auth, backend, PWA, searchParams y estilos globales.
- No se tocaron componentes de listado, tarjetas de negocio, mapas, filtros, geolocalizacion, endpoints ni hooks de datos.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @aquita/web typecheck` | Pass |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/pages/Home.test.tsx` | Pass: `1 file / 1 test`. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Diff esperado antes de actualizar snapshots. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline" --update-snapshots` | Pass: `2 passed`; snapshots actualizados. |
| `node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "home (desktop\|mobile) baseline"` | Pass final: `2 passed`. |
| `pnpm qa:smoke` | Pass: lint, typecheck y unit tests. |

Warnings no bloqueantes:

- El primer visual fallo por diff esperado del cambio visual.
- Geoapify 503 conocido en unit tests de API como warning no bloqueante.
- `run-with-qa-stack` uso Prisma Client 7.8.0 durante `prisma generate`, sin cambios de schema.
- `git diff` puede reportar LF/CRLF en archivos editados desde Windows.

Riesgos pendientes:

- Home ya tiene un cierre mas limpio, pero la calidad percibida depende de datos publicos reales y estados utiles cuando hay poca data.
- No agregar mas secciones a Home sin retirar o consolidar ruido existente.
- No tocar geolocalizacion, ranking real, mapas, tracking ni busqueda sin fase especifica.

Proximo paso recomendado:

- Commit/push del bloque Home si el usuario quiere cerrar esta tanda.
- Luego hacer una revision global por vistas y decidir el siguiente bloque de lanzamiento: `Login/Register`, `BusinessesList` o dashboards por rol. No abrir redisenos grandes sin baseline y contrato claro.

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
