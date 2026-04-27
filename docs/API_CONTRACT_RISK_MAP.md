# API Contract Risk Map

Fecha: 2026-04-24

## Alcance

Este documento registra el analisis de contrato frontend/API de Fase 3.1. No autoriza cambios de producto, endpoints, DTOs, rutas, permisos, cache ni tests. Su objetivo es dejar visible que superficies son fragiles antes de tocar `apps/web/src/api/endpoints.ts` o controllers del API.

## Reglas de esta fase

- Solo documentacion.
- No modificar `apps/web/src/api/endpoints.ts`.
- No modificar backend, controllers, DTOs, guards, roles ni servicios.
- No agregar tests todavia.
- No cambiar scripts ni configuracion.

## Endpoints frontend mas fragiles

| Frontend API | Riesgo | Motivo |
| --- | --- | --- |
| `businessApi.getAll(params)` | Alto | Acepta `Record<string, string | number | boolean>` y llama `GET /businesses`; backend valida con `BusinessQueryDto` y `forbidNonWhitelisted`. Un param extra futuro puede romper con 400. |
| `businessApi.create(data)` / `businessApi.update(id, data)` | Alto | Usan `Record<string, unknown>` contra DTOs backend estrictos. TypeScript no protege required fields, UUIDs, URLs, enums, longitudes ni arrays. |
| `businessApi.createAdminCatalog(data)` | Alto | Usa `Record<string, unknown>` sobre una mutacion admin sensible. Errores de payload se detectan solo en runtime. |
| `businessApi.getByIdentifier` / `getById` / `getBySlug` | Medio | Todos terminan en `GET /businesses/:identifier`. Es fragil si cambia la semantica entre slug, UUID o cache de detalle publico. |
| `businessApi.claimSearch(params)` | Medio | El frontend tipa parte del contrato, pero backend aplica validaciones de `q`, UUIDs, URLs, coordenadas y `limit`. |
| `businessApi.createClaimRequest(data)` | Medio | Frontend permite menos `evidenceType` que backend. No rompe hoy, pero puede limitar UX futura o generar drift. |
| `businessApi.delete(id, { reason })` | Medio | Frontend solo exige `string`; backend exige minimo 15 caracteres y maximo 500. |
| `authApi.refresh()` / `authApi.logout()` | Alto | Envia body vacio y depende de cookie + `withCredentials`. Actualmente calza porque `RefreshTokenDto.refreshToken` es opcional. |
| `analyticsApi.getMyDashboard` / `getBusinessAnalytics` | Alto | Requieren `BUSINESS_OWNER` y `x-organization-id`; TypeScript no modela org activa ni permisos. |
| `analyticsApi.getMarketInsights` / `getGrowthInsights` / reportes | Alto | Superficie admin; errores de roles, params y response shape aparecen en runtime. |
| `observabilityApi` / `healthApi.getDashboard` | Alto | Endpoints admin sensibles; wrappers no expresan guard ni rol requerido. |

## Controllers backend relacionados

| Backend controller | Contratos relevantes | Riesgo principal |
| --- | --- | --- |
| `apps/api/src/businesses/businesses.controller.ts` | `GET /businesses`, `/businesses/nearby`, `/businesses/:identifier`, `/businesses/my`, `/businesses/admin/*`, claim requests, create/update/delete. | Contrato publico + owner/admin en un mismo controller; cambios de DTO pueden afectar varias pantallas. |
| `apps/api/src/search/search.controller.ts` | `GET /search/businesses`, `POST /search/businesses/reindex`. | Contrato de search separado de `/businesses`; usa nombres de params distintos. |
| `apps/api/src/auth/auth.controller.ts` | register, login, google, refresh, logout, forgot/reset password, 2FA. | Refresh/logout dependen de cookies y DTO opcional; riesgo alto si cambia semantica. |
| `apps/api/src/analytics/analytics.controller.ts` | dashboard owner, business analytics, market insights, growth insights, market reports. | Permisos y org context no estan representados en tipos frontend. |
| `apps/api/src/analytics/event-tracking.controller.ts` | alias `events` y `telemetry` para eventos business/growth. | Cambiar alias rompe tracking aunque el API principal compile. |
| `apps/api/src/businesses/admin-catalog.controller.ts` | namespace legacy `/admin/catalog/*` y `/admin/business-claim-requests/*`. | Duplica parte de la superficie admin de businesses y puede divergir. |
| `apps/api/src/observability/observability.controller.ts` | frontend health ingest publico, metrics/summary/reset admin. | Superficie sensible por roles y formato de metrics. |
| `apps/api/src/health/health.controller.ts` | liveness/readiness publicos, dashboard admin. | Mezcla checks publicos con dashboard protegido. |

## Posibles desalineaciones

- `GET /businesses` usa `search`, `latitude`, `longitude` y `radiusKm`; `GET /search/businesses` usa `q`, `lat`, `lng` y `radiusKm`.
- El frontend no expone wrapper para `/search/businesses`; el listado publico usa `/businesses`.
- Hay dos superficies admin para catalogo/claims: `/businesses/admin/*` y `/admin/catalog/*`.
- `create/update/createAdminCatalog` no reflejan los DTOs `CreateBusinessDto`, `UpdateBusinessDto` ni `CreateAdminCatalogBusinessDto`.
- `createClaimRequest` en frontend permite `PHONE`, `EMAIL_DOMAIN`, `DOCUMENT`, `SOCIAL`, `MANUAL`; backend tambien acepta `BUSINESS_EMAIL`, `BUSINESS_PHONE`, `SOCIAL_PROFILE`, `TAX_DOCUMENT`, `BRAND_ASSET`, `MANUAL_REVIEW`, `OTHER`.
- `delete` no expresa en TypeScript la longitud minima de `reason`.
- `authApi.refresh/logout` dependen de que `RefreshTokenDto.refreshToken` siga siendo opcional.
- Las caches frontend de discovery/detail/admin insights son independientes de `PublicCache` backend; un cambio de invalidacion puede dejar datos stale sin error de tipos.

## Donde TypeScript no protege de punta a punta

- No hay cliente generado desde OpenAPI/DTOs backend.
- `endpoints.ts` replica contratos manualmente y varios wrappers no tienen tipo de respuesta.
- Las respuestas Axios suelen inferirse como `any` o shapes locales asumidos por las paginas.
- Guards, roles y `x-organization-id` son condiciones runtime, no tipos.
- Validaciones backend con `class-validator` no existen en el tipo frontend: `@IsUUID`, `@IsUrl`, `@MinLength`, `@Max`, `@IsEnum`, `@Matches`.
- `ValidationPipe` usa `whitelist`, `forbidNonWhitelisted` y `transform`; TypeScript no avisa cuando el frontend envia un param no permitido.
- Enums Prisma y unions frontend pueden divergir si se agregan valores en backend.
- Cache invalidation no esta ligada a tipos ni a una matriz de mutaciones.

## Riesgos por cambios futuros

- Pasar `searchParams` completos a `businessApi.getAll` podria enviar `view`, `sort`, `map` u otros params no whitelistados.
- Unificar `/businesses` y `/search/businesses` sin compatibilidad puede romper filtros publicos o ranking.
- Endurecer `RefreshTokenDto` romperia refresh/logout si no se cambia el cliente al mismo tiempo.
- Cambiar el response envelope de listado (`data`, `total`, `totalPages`) romperia pantallas aunque compile.
- Consolidar rutas admin sin matriz de compatibilidad puede romper `AdminDashboard`.
- Cambiar slugs/identifiers puede afectar detalle publico, prefetch y cache keys.
- Cambiar roles u org context puede romper dashboards owner/admin sin fallo de TypeScript.
- Ajustar TTL o invalidacion puede causar datos stale en listado/detalle sin romper tests unitarios.

## Que NO tocar todavia

- No tocar `apps/web/src/api/endpoints.ts`.
- No tocar controllers, DTOs, guards, roles ni `main.ts`.
- No tocar `BusinessesList`, `searchParams` ni rutas SEO.
- No tocar auth refresh/logout ni almacenamiento de sesion.
- No tocar Redis/cache, service worker, Prisma, Docker ni env vars.
- No consolidar `/businesses/admin/*` con `/admin/catalog/*`.
- No generar cliente API ni cambiar contratos hasta tener tests de caracterizacion.

## Check manual implementado en Fase 3.4

Se agrego un check estatico manual/report-only para el contrato `GET /businesses`: `businessApi.getAll(params)` contra `BusinessQueryDto`.

- Script: `scripts/check-businesses-contract.mjs`.
- Comando: `node scripts/check-businesses-contract.mjs`.
- Modo: manual y report-only; no esta conectado a CI y no bloquea builds.
- Resultado actual: `Findings: none`.
- Resultado observado: `view` existe como param UI en `useBusinessesListFilters`, pero no se envia a `GET /businesses`.
- Resultado observado: `search/q` esta controlado para este contrato; el listado envia `search`, no `q`.
- Resultado observado: `latitude/lat` y `longitude/lng` estan controlados para este contrato; el listado envia `latitude`/`longitude`, no `lat`/`lng`.

El check solo compara nombres de params permitidos. No hace requests, no usa seeds, no valida response shape, no valida cache y no toca runtime.

## Check manual implementado en Fase 3.6

Se agrego un segundo check estatico manual/report-only para el contrato `POST /telemetry/growth`: `analyticsApi.trackGrowthEvent` contra `TrackGrowthEventDto` y `GrowthEventType`.

- Script: `scripts/check-telemetry-growth-contract.mjs`.
- Comando: `node scripts/check-telemetry-growth-contract.mjs`.
- Modo: manual y report-only; no esta conectado a CI y no bloquea builds.
- Resultado actual: `Findings: none`.
- Resultado observado: `/telemetry/growth` esta alineado con el controller alias; `@Controller` incluye `telemetry` y existe `@Post("growth")`.
- Resultado observado: `TrackGrowthEventDto` importa, valida y tipa `eventType` con `GrowthEventType`.
- Resultado observado: los 20 valores frontend de `eventType` coinciden con los 20 valores backend de `GrowthEventType`.

El check solo compara ruta, alias, DTO y valores de enum. No hace requests, no valida response shape, no valida metadata shape, no valida persistencia, no valida rate limit, no inspecciona `AnalyticsService` y no toca runtime.

## Check manual implementado en Fase 3.7

Se agrego un tercer check estatico manual/report-only para el contrato `GET /businesses/:identifier`: wrappers publicos de detalle contra `BusinessesController.findByIdentifier`.

- Script: `scripts/check-business-detail-contract.mjs`.
- Comando: `node scripts/check-business-detail-contract.mjs`.
- Modo: manual y report-only; no esta conectado a CI y no bloquea builds.
- Resultado actual: `Findings: none`.
- Resultado observado: `businessApi.getByIdentifier`, `businessApi.getById` y `businessApi.getBySlug` apuntan a `/businesses/${...}`.
- Resultado observado: `prefetchPublicDetail` prefiere `slug`, usa `id` como fallback si falla el prefetch por slug y usa `id` cuando no hay `slug`.
- Resultado observado: el backend expone `@Get(":identifier")`, usa `@Param("identifier")` y mantiene `OptionalJwtAuthGuard` + `OptionalOrgContextGuard`.
- Resultado observado: no hay `JwtAuthGuard`, `RolesGuard` ni `@Roles` obligatorios en el detalle publico.

El check solo compara wrappers, ruta y guards del handler publico. No hace requests, no usa seeds, no valida response shape, no valida cache, no valida SEO, no valida imagenes, no valida reviews, no valida favoritos, no inspecciona Prisma/DB y no toca runtime.

## Cierre de Fase 3

Fase 3 queda con tres checks estaticos manuales/report-only:

- `scripts/check-businesses-contract.mjs` para `GET /businesses`.
- `scripts/check-telemetry-growth-contract.mjs` para `POST /telemetry/growth`.
- `scripts/check-business-detail-contract.mjs` para `GET /businesses/:identifier`.

Los tres siguen fuera de CI. La recomendacion es mantenerlos manual/report-only hasta estabilizar reportes y decidir un gate con bajo ruido. Antes de conectarlos a CI conviene definir si los findings deben ser bloqueantes o solo informativos, y cubrir al menos un contrato de auth/admin con la misma disciplina.

## Riesgos pendientes fuera de los checks de Fase 3

- Response shape de `GET /businesses`: `data`, `total`, `totalPages`.
- Response shape de `GET /businesses/:identifier`.
- Response shape de `POST /telemetry/growth`.
- Contrato separado de `/search/businesses`.
- Auth avanzado: refresh expirado, refresh ausente, 2FA y throttling.
- Admin, roles, org context y endpoints sensibles.
- Cache frontend/backend e invalidacion.
- Ranking y orden de resultados.
- Paginacion real con datos.
- Seeds y fixtures reales.
- Metadata shape de eventos growth.
- Persistencia de eventos en DB.
- Rate limit de telemetry/growth.
- Logica interna de `AnalyticsService`.
- CI gate para checks de contrato.

## Candidatos futuros para tests de contrato

| Candidato | Tipo | Cobertura minima |
| --- | --- | --- |
| `GET /businesses` listado publico | API contract | Status 200, shape `{ data, total, totalPages }`, paginacion y filtro `search`. |
| `GET /businesses` con geo | API contract | `latitude`, `longitude`, `radiusKm`; rechazar coordenadas invalidas. |
| `GET /businesses/:identifier` inexistente | API + acceptance | Status/error estable y pantalla publica sin crash. |
| `GET /businesses/:identifier` valido con seed real | API + acceptance | Campos publicos minimos, SEO/render basico y CTA no roto. |
| `GET /search/businesses` | API contract | Alinear `q`, `lat`, `lng`, `radiusKm`; documentar diferencia con `/businesses`. |
| `POST /auth/refresh` cookie-only | API/auth contract | Body vacio con cookie valida y fallo esperado sin cookie. |
| `POST /auth/logout` cookie-only | API/auth contract | Body vacio no debe romper logout. |
| `POST /telemetry/growth` | API contract | Enum `GrowthEventType`, metadata opcional y rate limit no destructivo. |
| `GET /analytics/dashboard/my` | Auth/org contract | Requiere `BUSINESS_OWNER` y org activa; bloqueo para anonimo/no owner. |
| `GET /analytics/growth/insights` | Admin contract | Requiere ADMIN; params `days`, `provinceId`, `categoryId`, `limit`. |
| `GET /businesses/admin/claim-requests` | Admin contract | Requiere ADMIN; status/limit validos. |
| `POST /businesses/admin/duplicate-cases/resolve` | Admin mutation contract | Payload minimo por status sin ejecutar casos destructivos reales. |
| `POST /businesses/:id/claim-requests` | Auth contract | Evidence types permitidos y bloqueo anonimo. |
| `DELETE /businesses/:id` | Auth/policy contract | `reason` minimo, roles y policy guard. |

## QA final de Fase 3

Comandos de cierre:

- `node scripts/check-businesses-contract.mjs` -> resultado actual: `Findings: none`.
- `node scripts/check-telemetry-growth-contract.mjs` -> resultado actual: `Findings: none`.
- `node scripts/check-business-detail-contract.mjs` -> resultado actual: `Findings: none`.
- `pnpm qa:smoke` -> QA amplio de cierre para lint, typecheck y unit tests.

Validacion manual recomendada:

- Confirmar que los tres checks siguen manual/report-only y fuera de CI.
- Confirmar que no hubo cambios en `apps/web/src/api/endpoints.ts`, backend, DTOs, controllers, Prisma schema, `package.json` ni configuracion de CI.
