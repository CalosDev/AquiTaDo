# Admin Response Shape Risk Map

Fecha: 2026-05-03

## Alcance

Este documento registra los riesgos de response shape detectados en Fase 9.1 para admin/dashboard. Es solo documentacion y no autoriza cambios de runtime, contratos, controllers, DTOs, frontend ni configuracion.

El foco inicial es `AdminDashboard`, sus consumidores relacionados y los endpoints admin que mezclan arrays directos, envelopes con `data`, envelopes con `items`, envelopes con `data` y `summary`, y snapshots directos.

## Reglas de Seguridad

- No modificar `apps/web/src/pages/AdminDashboard.tsx`.
- No modificar `apps/web/src/api/endpoints.ts`.
- No modificar backend, controllers, services ni DTOs.
- No agregar tests todavia.
- No cambiar runtime frontend ni backend.
- No activar ni cambiar `JSON_API_RESPONSE_ENABLED`.
- No normalizar response shapes en esta fase.

## Hallazgos de Fase 9.1

- `AdminDashboard` consume varios response shapes distintos en una sola pantalla.
- `apps/web/src/api/endpoints.ts` devuelve `AxiosResponse` crudo para los endpoints admin analizados.
- Los tipos de respuesta viven localmente en `AdminDashboard.tsx` y `admin-dashboard/types.ts`, no en un contrato compartido.
- El backend produce shapes implicitos desde services/controllers; no hay response DTOs compartidos con el frontend.
- Varios consumidores hacen casts locales con `as ...` y fallbacks como `response.data || []`, `response.data?.data || []` o `response.data?.items || []`.
- Esos fallbacks reducen crashes, pero pueden ocultar drift contractual como pantallas vacias o KPIs en cero.
- `JSON_API_RESPONSE_ENABLED` puede envolver cualquier response HTTP en `{ jsonapi, meta, data }`, agregando un nivel extra que el frontend admin no espera.

## Tabla de Endpoints Admin/Dashboard

| Endpoint | Productor backend | Shape que produce backend | Consumidor frontend critico | Shape que espera frontend |
| --- | --- | --- | --- | --- |
| `GET /businesses/admin/all` | `BusinessesController.findAllAdmin` -> `BusinessesService.findAllAdmin` | `{ data, total, page, limit, totalPages }` | `loadData` | `businessesResponse.data.data` |
| `GET /verification/admin/moderation-queue` | `VerificationController.listModerationQueue` -> `VerificationService.listModerationQueue` | `{ summary, items }` | `loadVerificationData`, `VerificationQueueSection` | `moderationQueueRes.data?.items` |
| `GET /verification/admin/pending-businesses` | `VerificationController.listPendingBusinesses` -> `VerificationService.listPendingBusinesses` | array directo | `loadVerificationData` | `pendingRes.data` |
| `GET /analytics/market-reports` | `AnalyticsController.listMarketReports` -> `AnalyticsService.listMarketReports` | array directo | `loadVerificationData` | `reportsRes.data` |
| `GET /analytics/market-reports/:id` | `AnalyticsController.getMarketReport` -> `AnalyticsService.getMarketReportById` | objeto directo | `loadMarketReportDetail` | `response.data` |
| `GET /reviews/moderation/flagged` | `ReviewsController.listFlaggedReviews` -> `ReviewsService.listFlaggedReviews` | array directo | `loadVerificationData` | `flaggedReviewsRes.data` |
| `GET /analytics/market-insights` | `AnalyticsController.getMarketInsights` -> `AnalyticsService.getMarketInsights` | snapshot directo | `loadVerificationData` | `marketInsightsRes.data` |
| `GET /analytics/growth/insights` | `AnalyticsController.getGrowthInsights` -> `AnalyticsService.getGrowthInsights` | snapshot directo | `loadVerificationData` | `growthInsightsRes.data` |
| `GET /businesses/admin/catalog-quality` | `BusinessesController.getCatalogQuality` -> `BusinessesService.getCatalogQuality` | snapshot directo con `summary`, metricas y listas | `loadCatalogQuality` | `response.data` |
| `GET /businesses/admin/claim-requests` | `BusinessesController.listClaimRequests` -> `BusinessesService.listClaimRequests` | `{ data, summary }` | `loadClaimRequests` | `response.data?.data`, `response.data?.summary` |
| `GET /business-suggestions/admin` | `BusinessSuggestionsController.listSuggestionsAdmin` -> `BusinessesService.listBusinessSuggestions` | `{ data, summary }` | `loadBusinessSuggestions` | `response.data?.data`, `response.data?.summary` |
| `GET /businesses/admin/duplicate-cases` | `BusinessesController.listDuplicateCases` -> `BusinessesService.listDuplicateCases` | `{ data, summary }` | `loadDuplicateCases` | `response.data?.data`, `response.data?.summary` |
| `GET /businesses/admin/:id/ownership-history` | `BusinessesController.listOwnershipHistory` -> `BusinessesService.listOwnershipHistory` | `{ business, data }` | `loadOwnershipHistory` | `response.data` |
| `GET /observability/summary` | `ObservabilityController.getSummary` -> `ObservabilityService.getFrontendHealthSnapshot` | snapshot directo | `loadObservabilityData` | `summaryResponse.data` |
| `GET /observability/metrics` | `ObservabilityController.getMetrics` | texto Prometheus | `loadRawMetrics` | `metricsResponse.data` como string |
| `GET /health/dashboard` | `HealthController.getOperationalDashboard` -> `HealthService.getOperationalDashboard` | snapshot directo | `loadOperationalHealth` | `response.data` |

## Consumidores Criticos en AdminDashboard

| Consumidor | Endpoints principales | Riesgo |
| --- | --- | --- |
| `loadData` | `/businesses/admin/all`, categorias, provincias | Alto: mezcla paginado admin con arrays directos. |
| `loadVerificationData` | verification queue, pending businesses, market reports, flagged reviews, market/growth insights | Alto: mezcla array directo, `{ items }` y snapshots directos en un solo `Promise.all`. |
| `loadCatalogQuality` | `/businesses/admin/catalog-quality` | Medio-alto: snapshot amplio, derivado y sin contrato compartido. |
| `loadClaimRequests` | `/businesses/admin/claim-requests` | Medio-alto: espera `{ data, summary }`, no paginado completo. |
| `loadBusinessSuggestions` | `/business-suggestions/admin` | Medio-alto: mismo patron `{ data, summary }`. |
| `loadDuplicateCases` | `/businesses/admin/duplicate-cases` | Medio-alto: mismo patron `{ data, summary }`. |
| `loadOwnershipHistory` | `/businesses/admin/:id/ownership-history` | Medio: espera `{ business, data }`. |
| `loadObservabilityData` | `/observability/summary` | Medio: snapshot directo cacheado en frontend. |
| `loadOperationalHealth` | `/health/dashboard` | Medio: snapshot directo cacheado en frontend. |
| `VerificationQueueSection` | `moderationQueue` state | Alto: dereferencia `item.business.name`, `item.organization.name`, `item.payload` segun `queueType`. |

## Riesgos por Shape

### Arrays directos

Endpoints afectados:

- `GET /verification/admin/pending-businesses`
- `GET /analytics/market-reports`
- `GET /reviews/moderation/flagged`

Riesgo: si el backend cambia a `{ data }`, el frontend sigue haciendo casts sobre `response.data` y podria tratar un objeto como array. Esto puede producir listas vacias, errores de `.map` en componentes o seleccion inicial incorrecta de market report.

### `{ data }` paginado

Endpoint principal:

- `GET /businesses/admin/all`

Riesgo: el frontend lee `businessesResponse.data.data`. Si se activa un envelope global o se cambia a array directo, la tabla admin queda vacia. Es el contrato admin mas estandar y el primer candidato a check.

### `{ items }`

Endpoint principal:

- `GET /verification/admin/moderation-queue`

Riesgo: es un shape distinto al resto de listados. `AdminDashboard` lee `moderationQueueRes.data?.items`, y `VerificationQueueSection` espera items polimorficos con `queueType`, `business`, `organization`, `priority`, `status` y `payload`. Cambiarlo a `{ data }` o array directo romperia la cola o la dejaria vacia.

### `{ data, summary }`

Endpoints afectados:

- `GET /businesses/admin/claim-requests`
- `GET /business-suggestions/admin`
- `GET /businesses/admin/duplicate-cases`

Riesgo: parecen listados, pero no son paginados completos. Si alguien los normaliza a `{ data, total, page, limit, totalPages }` sin preservar `summary`, se rompen KPIs y badges de estado. Si alguien cambia `summary` a otra clave, los fallbacks lo ocultan con `{}`.

### Snapshots directos

Endpoints afectados:

- `GET /businesses/admin/catalog-quality`
- `GET /analytics/market-insights`
- `GET /analytics/growth/insights`
- `GET /analytics/market-reports/:id`
- `GET /observability/summary`
- `GET /health/dashboard`

Riesgo: los snapshots tienen shapes grandes y derivados. TypeScript no valida que el backend siga devolviendo campos esperados como `summary`, `metrics`, `totals`, `range`, `topBusinesses`, `checks` o `passwordReset`.

### Texto directo

Endpoint afectado:

- `GET /observability/metrics`

Riesgo: usa `responseType: 'text'` y convierte `metricsResponse.data` a string. Un envelope JSON:API global o cambio de content-type podria romper el parser local de Prometheus.

## Riesgo Transversal de JSON_API_RESPONSE_ENABLED

`JsonApiResponseInterceptor` puede envolver respuestas como:

```ts
{
  jsonapi: { version: '1.0' },
  meta: { requestId, timestamp },
  data: payload
}
```

Impacto en admin si se activa sin adaptadores:

- `GET /businesses/admin/all` pasaria de `response.data.data` a `response.data.data.data`.
- `GET /verification/admin/moderation-queue` pasaria de `response.data.items` a `response.data.data.items`.
- Arrays directos pasarian de `response.data` a `response.data.data`.
- Snapshots directos pasarian de `response.data` a `response.data.data`.
- `GET /observability/metrics` podria dejar de ser texto directo.

Conclusion: no activar `JSON_API_RESPONSE_ENABLED` para admin sin una migracion explicita, adaptadores frontend y checks de contrato.

## Donde TypeScript No Protege

- `endpoints.ts` no declara genericos de response body para los endpoints admin revisados.
- `AdminDashboard.tsx` usa tipos locales y casts, no contratos compartidos.
- `admin-dashboard/types.ts` cubre algunos tipos renderizados, pero no valida payload HTTP.
- Los DTOs backend cubren request/query, no response.
- Los `select` de Prisma y helpers backend no son una garantia de shape para frontend.
- `Promise.all` en `loadVerificationData` mezcla seis responses con shapes distintos sin una capa de normalizacion tipada.
- Los fallbacks `|| []`, `|| null` y `|| {}` pueden esconder drift y convertir regresiones en datos vacios.

## Endpoints Prioritarios

| Prioridad | Endpoint | Motivo |
| --- | --- | --- |
| 1 | `GET /businesses/admin/all` | Contrato admin mas estandar: envelope paginado `{ data, total, page, limit, totalPages }`. |
| 2 | `GET /verification/admin/moderation-queue` | Shape unico `{ summary, items }` con items polimorficos. |
| 3 | `GET /businesses/admin/catalog-quality` | Snapshot grande, derivado y central para salud del catalogo. |
| 4 | `GET /businesses/admin/claim-requests` | `{ data, summary }` usado para acciones admin sensibles. |
| 5 | `GET /business-suggestions/admin` | `{ data, summary }` y conectado a aprobacion de fichas. |
| 6 | `GET /businesses/admin/duplicate-cases` | `{ data, summary }` y conectado a merge/archivo de negocios. |
| 7 | `GET /analytics/market-insights` y `GET /analytics/growth/insights` | Snapshots directos con muchos campos derivados. |
| 8 | `GET /health/dashboard` y `GET /observability/summary` | Snapshots operacionales cacheados. |

## Que NO Tocar Todavia

- No tocar `AdminDashboard`.
- No tocar `apps/web/src/api/endpoints.ts`.
- No convertir endpoints admin a genericos de golpe.
- No cambiar response shapes backend.
- No renombrar `data`, `items`, `summary`, `total`, `page`, `limit` ni `totalPages`.
- No activar `JSON_API_RESPONSE_ENABLED`.
- No cambiar controllers, services ni DTOs.
- No tocar guards, roles, auth admin ni org context dentro de esta fase.
- No mezclar response shape con refactor visual, cache, auth o mejoras de UX admin.

## Fase 9.4: Check Manual para GET /businesses/admin/all

Fase 9.4 implemento un check manual/read-only/report-only para `GET /businesses/admin/all`.

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-admin-businesses-response-shape.mjs` |
| Comando | `node scripts/check-admin-businesses-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none` |
| Modo | Manual/report-only; sale exit `0` y no esta conectado a CI |

El contrato actual queda alineado entre frontend y backend para el shape:

- `data`
- `total`
- `page`
- `limit`
- `totalPages`

El check confirma:

- `businessApi.getAllAdmin` llama a `api.get('/businesses/admin/all', { params })`.
- `businessApi.getAllAdmin` no transforma `response.data`.
- `AdminDashboard.loadData` llama a `businessApi.getAllAdmin({ limit: 100 })`.
- `AdminDashboard.loadData` consume `businessesResponse.data.data`.
- `AdminDashboard.loadData` no consume `businessesResponse.data.items`.
- `AdminDashboard.loadData` no trata `businessesResponse.data` como array directo.
- `BusinessesController.findAllAdmin` expone `@Get('admin/all')`.
- `BusinessesController.findAllAdmin` mantiene `JwtAuthGuard`, `RolesGuard` y `@Roles('ADMIN')` como contexto informativo.
- `BusinessesController.findAllAdmin` delega a `businessesService.findAllAdmin(query)`.
- `BusinessesService.findAllAdmin` retorna `data`, `total`, `page`, `limit` y `totalPages`.
- `data` deriva de `decorateBusinessProfiles(...)`.
- `JSON_API_RESPONSE_ENABLED` se reporta como warning informativo.

Warning informativo:

- `JSON_API_RESPONSE_ENABLED` existe en `JsonApiResponseInterceptor`. Si se activa sin adaptadores frontend, `GET /businesses/admin/all` podria pasar de `response.data.data` a `response.data.data.data`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node scripts/check-admin-businesses-response-shape.mjs` | Pass, `Findings: none`. |
| `node --check scripts/check-admin-businesses-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warnings no bloqueantes:

- Primer intento local de `pnpm qa:smoke` supero el timeout de 120s; rerun con timeout ampliado paso.
- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 9.4.

## Primera Mejora Segura Recomendada

El siguiente check seguro recomendado es `GET /verification/admin/moderation-queue`, manteniendolo manual/read-only/report-only. Debe validar que el backend produce `{ summary, items }` y que `AdminDashboard` consume `moderationQueueRes.data?.items`, sin tocar UI, permisos ni runtime.

## Candidatos Futuros para Checks Manual/Report-Only

| Orden | Check candidato | Validacion propuesta |
| --- | --- | --- |
| 1 | `scripts/check-admin-businesses-response-shape.mjs` | Implementado; `GET /businesses/admin/all` produce y consume envelope paginado. |
| 2 | `scripts/check-admin-moderation-queue-response-shape.mjs` | `GET /verification/admin/moderation-queue` produce `{ summary, items }` y el frontend consume `items`. |
| 3 | `scripts/check-admin-data-summary-response-shapes.mjs` | Claim requests, suggestions y duplicate cases preservan `{ data, summary }`. |
| 4 | `scripts/check-admin-catalog-quality-response-shape.mjs` | Catalog quality preserva snapshot directo con `summary`, `metrics`, `incompleteBusinesses` y `duplicateCandidates`. |
| 5 | `scripts/check-admin-analytics-response-shapes.mjs` | Market/growth insights y market reports mantienen snapshots/arrays esperados. |
| 6 | `scripts/check-admin-operational-response-shapes.mjs` | Observability summary, metrics text y health dashboard mantienen shapes esperados. |
| 7 | `scripts/check-json-api-envelope-risk.mjs` | Reportar riesgo si `JSON_API_RESPONSE_ENABLED` aparece activo o documentado sin adaptadores frontend. |

## Estado Actual

- Fase 9.1 queda documentada para admin/dashboard response shapes.
- Fase 9.4 queda documentada con check manual para `GET /businesses/admin/all`.
- `GET /businesses/admin/all` queda alineado para `data`, `total`, `page`, `limit` y `totalPages`.
- No se modifico producto.
- No se modifico `AdminDashboard`.
- No se modifico `endpoints.ts`.
- No se modifico backend, controllers, DTOs ni services.
- No se agregaron tests.
- No se cambio runtime ni `JSON_API_RESPONSE_ENABLED`.
- El check `scripts/check-admin-businesses-response-shape.mjs` queda manual/report-only y fuera de CI.
