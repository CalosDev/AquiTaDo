# Business Cache Invalidation Map

Fecha: 2026-04-25

## Alcance

Este documento registra el mapa de riesgo de cache e invalidacion para el backend de negocios. Es una fotografia documental de Fase 4.2 basada en la auditoria de Fase 4.1. No autoriza cambios de producto, servicios, controllers, DTOs, Prisma, Redis, scripts, tests ni CI.

## Reglas de esta fase

- Solo documentacion.
- No modificar `apps/api/src/businesses/businesses.service.ts`.
- No modificar `apps/api/src/businesses/businesses.controller.ts`.
- No modificar `apps/api/src/businesses/business-projection.listener.ts`.
- No modificar `apps/api/src/search/search.service.ts`.
- No modificar `apps/api/src/cache/redis.service.ts`.
- No modificar DTOs, Prisma schema, Redis, tests, scripts ni configuracion.
- No cambiar comportamiento.

## Superficie de cache detectada

| Capa | Archivo | Responsabilidad | Riesgo |
| --- | --- | --- | --- |
| HTTP public cache | `apps/api/src/core/interceptors/public-cache.interceptor.ts` | Emite `Cache-Control` publico para rutas anonimas y `private, no-store` cuando hay usuario autenticado. | Puede servir stale aunque Redis ya haya sido invalidado. |
| Detalle publico Redis | `apps/api/src/businesses/businesses.service.ts` | Cachea detalle anonimo por `id` y `slug` con SWR `120/900`. | Detalle publico puede quedar stale si no llega `business.changed` con el slug correcto. |
| Discovery/listado Redis | `apps/api/src/search/search.service.ts` | Cachea discovery con key hasheada y SWR `45/300`. | Listado publico puede quedar stale si una mutacion publica no invalida discovery. |
| Nearby Redis | `apps/api/src/search/search.service.ts` | Cachea nearby con key hasheada y SWR `30/180`. | Cambios de coordenadas, publicacion o visibilidad pueden quedar stale. |
| Listener de proyeccion | `apps/api/src/businesses/business-projection.listener.ts` | Escucha `business.changed`, borra prefixes y llama `SearchService.indexBusinessById/removeBusiness`. | Si el evento no se publica, no hay invalidacion. Si falla Redis, no se bloquea la mutacion. |
| Redis helper | `apps/api/src/cache/redis.service.ts` | Implementa `rememberJsonStaleWhileRevalidate` y `deleteByPrefix`. | `deleteByPrefix` captura errores y devuelve conteo; el caller no sabe si hubo invalidacion parcial. |

## Prefixes de cache relevantes

| Prefix / key | Productor | Consumidor / invalidacion | Notas |
| --- | --- | --- | --- |
| `public:businesses:detail:id:<id>` | `BusinessesService.findById` anonimo | `BusinessProjectionListener` con `public:businesses:detail:id:<businessId>` | Detalle publico por UUID. |
| `public:businesses:detail:slug:<slug>` | `BusinessesService.findBySlug` anonimo | `BusinessProjectionListener` con `public:businesses:detail:slug:<slug>` | Riesgo si un cambio futuro permite cambiar slug y solo se invalida el slug nuevo. |
| `public:businesses:discovery:<hash>` | `SearchService.listPublicBusinesses` | `SearchService.invalidateSearchCache` con `public:businesses:discovery:` | Key hasheada por query normalizada. |
| `public:businesses:nearby:<hash>` | `SearchService.findNearbyBusinesses` | `BusinessProjectionListener` y `SearchService.invalidateSearchCache` con `public:businesses:nearby:` | Invalidation duplicada entre listener y search service. |
| `search:businesses:list:*` | Legacy / compat | `BusinessProjectionListener` y `SearchService.invalidateSearchCache` | Prefix legacy aun invalidado para compatibilidad. |
| `public:businesses:list:*` | Legacy / compat | `BusinessProjectionListener` y `SearchService.invalidateSearchCache` | Prefix legacy aun invalidado para compatibilidad. |

## Eventos y listeners

| Evento | Publicador | Listener relacionado | Efecto actual |
| --- | --- | --- | --- |
| `business.changed` | `BusinessesService.publishBusinessChangedEvent` | `BusinessProjectionListener.onModuleInit` | Invalida list, nearby, search legacy, detail id, detail slug; luego invalida search via `indexBusinessById` o `removeBusiness`. |
| `business.claim_request.created` | `BusinessesService.createClaimRequest` | No se detecto listener de cache/invalidation en Fase 4.1. | Se mantiene intacto como evento de dominio lateral; desde Fase 4.6 `createClaimRequest` tambien publica `business.changed` para invalidacion de cache. |
| `business.claim_request.reviewed` | `BusinessesService.reviewClaimRequest` | No se detecto listener de cache/invalidation en Fase 4.1. | El flujo tambien publica `business.changed`, que si cubre invalidacion. |
| `business.organization.linked` | Claims/admin ownership | No se detecto listener de cache/invalidation en Fase 4.1. | Evento lateral; la invalidacion depende de `business.changed` en los flujos auditados. |
| `business.duplicate.merged` | `resolveDuplicateCase` con `MERGED` | No se detecto listener de cache/invalidation en Fase 4.1. | El flujo publica `business.changed` para primary y archived businesses. |

## Matriz de mutaciones de negocio

| Mutacion | Campos publicos afectados | Evento publicado | Prefixes esperados | Riesgo de stale data |
| --- | --- | --- | --- | --- |
| `createAdminCatalogBusiness` / `createCatalogBusinessRecord` | `name`, `slug`, `publicStatus`, `isPublished`, `isSearchable`, `isDiscoverable`, ubicacion, categorias, `claimStatus`, `isClaimable` | `business.changed` con `created`; tambien `business.catalog.created` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por `business.changed`, pero depende de que la creacion termine publicando evento despues de sync de ubicacion. |
| `create` owner business | Datos publicos, ownership, `claimStatus`, `publicStatus`, ubicacion, categorias | `business.changed` con `created`; opcional `business.organization.linked` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por `business.changed`; riesgo si cambia el orden entre DB, geolocation sync y evento. |
| `update` owner business | Copy de negocio, contacto, direccion, provincia/ciudad/sector, coordenadas, categorias, features, hours | `business.changed` con `updated` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por evento; alto si una futura actualizacion cambia `slug` sin invalidar slug anterior. |
| `delete` soft delete | `deletedAt`, `verified`, `publicStatus`, `lifecycleStatus`, `isActive`, `isPublished`, `isSearchable`, `isDiscoverable`, ownership publico | `business.changed` con `deleted` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por evento; si la invalidacion falla, un negocio borrado puede aparecer hasta expirar cache. |
| `verify` | `verified`, `verifiedAt`, `verificationStatus`, reputation | `business.changed` con `verified` | Discovery, nearby, legacy list/search, detail id, detail slug | Bajo/medio. Cubierto por evento; afecta badges y orden si ranking usa reputacion. |
| `updateAdminPublicationState` | `publicStatus`, `publishedAt`, `firstPublishedAt`, `isPublished`, `isSearchable`, `isDiscoverable`, lifecycle | `business.changed` con `updated` | Discovery, nearby, legacy list/search, detail id, detail slug | Alto si falla: una ficha publicada/no publicada puede quedar visible o invisible de forma stale. |
| `markBusinessClaimedAdmin` | `ownerId`, `organizationId`, `primaryManagingOrganizationId`, `claimStatus`, `claimedAt`, `claimedByUserId`, `isClaimable` | `business.changed` con `updated`; tambien `business.organization.linked` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio/alto. Cubierto por evento; afecta CTA/claim state publico y ownership. |
| `unclaimBusinessAdmin` | `ownerId`, `organizationId`, `primaryManagingOrganizationId`, `claimStatus`, `claimedAt`, `claimedByUserId`, `isClaimable` | `business.changed` con `updated` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio/alto. Cubierto por evento; afecta CTA/claim state publico. |
| `revokeBusinessOwnership` | Ownership activo, `organizationId`, `primaryManagingOrganizationId`, `claimStatus`, `isClaimable`, owner fields | `business.changed` con `updated` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio/alto. Cubierto por evento; zona sensible por ownership. |
| `createClaimRequest` | `claimStatus` pasa a `PENDING_CLAIM`; puede cambiar CTAs/claim state publico | `business.changed` con `updated`; `ClaimRequestCreated` sigue intacto | Discovery, nearby, legacy list/search, detail id, detail slug | Corregido en Fase 4.6. El evento de invalidacion se publica despues de la transaccion exitosa. |
| `expireStaleClaimRequests` | `claimStatus`, `primaryManagingOrganizationId`, `lastReviewedAt` | El helper no publica eventos; retorna `affectedBusinesses` y sus callers publican `business.changed` despues de commit/operacion exitosa | Detail id, detail slug, discovery/list para negocios afectados | Corregido en Fase 4.8. Riesgo residual: mantener todos los callers cubiertos si se agrega un caller nuevo. |
| `reviewClaimRequest` | `claimStatus`, ownership, owner/org fields, `primaryManagingOrganizationId`, `claimedAt`, `claimedByUserId` | `business.changed` con `updated`; tambien `ClaimRequestReviewed`; si aplica `business.organization.linked` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por `business.changed`; depende de que el publish ocurra despues de la transaccion. |
| `resolveDuplicateCase` con `MERGED` | Primary cambia por merge; secundarios pasan a archived/soft-deleted; reviews/favorites/list items se migran | `business.changed` para primary con `updated`; `business.changed` para archived con `deleted`; tambien `business.duplicate.merged` | Discovery, nearby, legacy list/search, detail id y slug de primary/secundarios | Alto por datos y soft-delete. Cubierto por eventos, pero debe mantenerse la invalidacion de todos los secundarios. |
| `resolveDuplicateCase` con `DISMISSED` o `CONFLICT` | No deberia cambiar datos publicos de negocio | No se publica `business.changed` | No se espera invalidacion de negocio | Bajo. Correcto si solo cambia el caso de duplicado/auditoria. |
| `reviewBusinessSuggestion` aprobada | Crea ficha de catalogo desde sugerencia | Depende de `createCatalogBusinessRecord`, que publica `business.changed` con `created` | Discovery, nearby, legacy list/search, detail id, detail slug | Medio. Cubierto por flujo de creacion, no por la sugerencia en si. |
| `reviewBusinessSuggestion` rechazada | No cambia negocio publico | No se espera `business.changed` | No se espera invalidacion de negocio | Bajo. |
| `createPublicLead` | No cambia shape publico de negocio; crea lead y eventos operativos | No se espera `business.changed` | No se espera invalidacion de negocio | Bajo para cache publico; sensible por ownership/lead routing, pero fuera de cache de negocios. |

## BusinessProjectionListener

`BusinessProjectionListener` es el punto central para invalidar cache publico de negocios:

- Escucha `business.changed`.
- Borra prefixes de list, nearby, search legacy, detail id y detail slug.
- Si `operation === "deleted"`, llama `SearchService.removeBusiness`.
- En cualquier otra operacion, llama `SearchService.indexBusinessById`.

Riesgos:

- `Promise.allSettled` evita que una invalidacion parcial rompa la mutacion, pero tambien oculta fallos salvo logs.
- La invalidacion se dispara asincronamente porque `DomainEventsService` emite con `setImmediate`.
- `SearchService.indexBusinessById` y `removeBusiness` no indexan documentos externos; invalidan cache de busqueda organica.
- Hay invalidacion duplicada de `public:businesses:nearby:`, `search:businesses:list:` y `public:businesses:list:` entre listener y `SearchService.invalidateSearchCache`.

## SearchService invalidation

`SearchService` cachea discovery y nearby con keys hasheadas por query normalizada. Su invalidacion actual borra:

- `public:businesses:discovery:`
- `public:businesses:nearby:`
- `search:businesses:list:`
- `public:businesses:list:`

Riesgos:

- No hay invalidacion granular por negocio, categoria, provincia o ciudad; cualquier cambio de negocio invalida todo discovery/nearby.
- La estrategia es simple y segura para correctitud, pero puede ser costosa si aumenta volumen de cache.
- Cambios futuros de prefix deben actualizar listener y SearchService juntos.

## Redis deleteByPrefix

`RedisService.deleteByPrefix(prefix)` ejecuta `SCAN MATCH "${prefix}*" COUNT 200` y `DEL` por lotes.

Riesgos:

- Si Redis no esta listo, devuelve `0`; el caller no distingue entre "no habia keys" y "Redis no disponible".
- Si ocurre error, loguea warning y devuelve el conteo parcial.
- En detail slug/id usa prefijos completos, pero sigue siendo match por prefijo. Puede borrar de mas si slugs comparten prefijo; esto es menos riesgoso que dejar stale, pero debe conocerse.
- No hay metrica/reporting agregado por invalidacion fallida en el listener.

## Riesgos principales de stale data

1. Cambios futuros en callers de `expireStaleClaimRequests` podrian omitir la publicacion diferida de `business.changed` para negocios afectados.
2. Cambios futuros de slug podrian dejar vivo el cache del slug anterior si el evento solo contiene el slug actual.
3. Fallos de Redis o invalidaciones parciales quedan en logs, no en una senal funcional.
4. Cache HTTP publico puede mantener respuestas stale aunque Redis ya haya sido invalidado.
5. Multiple invalidation ownership entre `BusinessProjectionListener` y `SearchService` hace dificil saber que capa es responsable de cada prefix.

## Que NO tocar todavia

- No refactorizar `BusinessesService`.
- No cambiar `BusinessProjectionListener`.
- No cambiar `DomainEventsService` ni su emision asincrona.
- No cambiar TTLs, `PublicCache`, SWR, prefixes ni `deleteByPrefix`.
- No cambiar DTOs, Prisma schema, guards, roles, ownership ni controllers.
- No conectar nuevos checks a CI.
- No mover la publicacion de `business.changed` dentro de `expireStaleClaimRequests`.
- No agregar callers nuevos de `expireStaleClaimRequests` sin actualizar el check manual/report-only.

## Mejora segura recomendada siguiente

Agregar una caracterizacion backend acotada para el patron de expiracion de claims:

- Confirmar que `expireStaleClaimRequests` retorna `affectedBusinesses` deduplicado.
- Confirmar que los callers fuera de transaccion publican `business.changed` despues de la expiracion exitosa.
- Confirmar que `createClaimRequest` y `reviewClaimRequest` publican despues del commit.
- No cambiar runtime, no hacer requests reales, no usar Redis real y no conectar a CI todavia.

El check `scripts/check-business-cache-events.mjs` ya existe y debe seguir manual/report-only hasta estabilizar mas caracterizaciones.

## Check manual implementado en Fase 4.4 y actualizado en Fase 4.6/4.9

Se agrego un check estatico manual/report-only para detectar mutaciones de negocio que cambian campos publicos sin publicar `business.changed`.

- Script: `scripts/check-business-cache-events.mjs`.
- Comando: `node scripts/check-business-cache-events.mjs`.
- Modo: manual y report-only; no esta conectado a CI y no bloquea builds.
- Exit code actual: `0`, incluso con findings reportados.
- Resultado inicial de Fase 4.4: `Findings (3)`.
- Resultado posterior a Fase 4.6: `Findings (1)`.
- Resultado posterior a Fase 4.9: `Findings: none`.
- `createClaimRequest` reporta `publishBusinessChangedEvent: yes`.
- `reviewClaimRequest` reporta `publishBusinessChangedEvent: yes`.
- `expireStaleClaimRequests` reporta `publishBusinessChangedEvent: no` y `deferred business.changed via callers: yes`.
- `ClaimRequestCreated` sigue intacto en `createClaimRequest`.

Patron seguro reconocido para `expireStaleClaimRequests`:

| Condicion | Estado |
| --- | --- |
| Helper retorna `affectedBusinesses` | Si |
| Helper publica `business.changed` internamente | No |
| Callers fuera de transaccion publican despues de la operacion | Si |
| Callers dentro de transaccion retornan afectados y publican despues del commit | Si |
| Callers conocidos cubiertos por el check | `listClaimRequests`, `listMyClaimRequests`, `getClaimRequestAdmin`, `getCatalogQuality`, `createClaimRequest`, `reviewClaimRequest` |

Controles positivos detectados con `business.changed`:

- `createClaimRequest`.
- `reviewClaimRequest`.
- `updateAdminPublicationState`.
- `markBusinessClaimedAdmin`.
- `unclaimBusinessAdmin`.
- `revokeBusinessOwnership`.
- `delete`.
- `verify`.
- `update`.
- `create`.
- `resolveDuplicateCase`.

QA ejecutado para Fase 4.6:

- `node scripts/check-business-cache-events.mjs` -> pass; `createClaimRequest` ya no queda como finding y permanece `expireStaleClaimRequests`.
- `pnpm --filter @aquita/api test` -> pass: `24 files / 113 tests`.
- `pnpm qa:smoke` -> pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 113 tests`.

QA ejecutado para Fase 4.8/4.9:

- `node scripts/check-business-cache-events.mjs` -> pass; `Findings: none`.
- `pnpm --filter @aquita/api typecheck` -> pass.
- `pnpm --filter @aquita/api test` -> pass en Fase 4.8: `24 files / 113 tests`.
- `pnpm qa:smoke` -> pass.

Warning conocido no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests de `IntegrationsService`.

Los findings de `createClaimRequest` se corrigieron en Fase 4.6. El patron diferido de `expireStaleClaimRequests` se corrigio en Fase 4.8 y el check lo reconoce desde Fase 4.9. La proxima fase recomendada es agregar caracterizacion backend enfocada en este patron antes de tocar TTLs, Redis real, response shape o CI.

## Test unitario agregado en Fase 4.10

Se agrego un test unitario de caracterizacion para proteger el fix de Fase 4.8 sin tocar producto, Redis real, Prisma schema, controllers, DTOs, scripts ni CI.

- Archivo: `apps/api/src/businesses/businesses.service.spec.ts`.
- Test: `expires stale claims during createClaimRequest and publishes deduped business.changed after commit`.
- Comando focalizado: `pnpm --filter @aquita/api exec vitest run src/businesses/businesses.service.spec.ts`.

El test protege exactamente:

- `createClaimRequest` ejecuta expiracion de claims stale previos.
- `publishBusinessChanged` se llama una sola vez cuando el negocio expirado y el claim nuevo apuntan al mismo `businessId`.
- El payload de `business.changed` conserva `businessId`, `slug` y `operation: "updated"`.
- `business.changed` se publica despues del commit de la transaccion.
- `publishClaimRequestCreated` sigue llamandose.
- La operacion retorna la claim request creada.

Estado actual:

- `scripts/check-business-cache-events.mjs` -> `Findings: none`.
- El check reconoce `expireStaleClaimRequests` como patron diferido seguro: `publishBusinessChangedEvent: no` y `deferred business.changed via callers: yes`.
- El test unitario protege `createClaimRequest` + `expireStaleClaimRequests` para dedupe y publicacion post-commit.

QA ejecutado para Fase 4.10:

- `pnpm --filter @aquita/api exec vitest run src/businesses/businesses.service.spec.ts` -> pass: `1 file / 4 tests`.
- `pnpm --filter @aquita/api test` -> pass: `24 files / 114 tests`.
- `pnpm qa:smoke` -> pass: lint, typecheck y unit tests. Web `19 files / 53 tests`; API `24 files / 114 tests`.

Warning conocido no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests de `IntegrationsService`.

## Candidatos futuros para tests de caracterizacion

| Candidato | Tipo | Cobertura minima |
| --- | --- | --- |
| `BusinessProjectionListener` con `created/updated/verified` | Unit con mocks | Assert de `deleteByPrefix` para list/nearby/search/detail y llamada a `indexBusinessById`. |
| `BusinessProjectionListener` con `deleted` | Unit con mocks | Assert de `deleteByPrefix` y llamada a `removeBusiness`, no `indexBusinessById`. |
| `SearchService.indexBusinessById/removeBusiness` | Unit con Redis mock | Assert de prefixes `public:businesses:discovery:`, `public:businesses:nearby:`, `search:businesses:list:`, `public:businesses:list:`. |
| `RedisService.deleteByPrefix` | Unit con Redis mock | Caracterizar fallback sin cliente, scan/del por lotes y error parcial sin throw. |
| `createClaimRequest` | Unit/service characterization con mocks | Cubierto parcialmente en Fase 4.10 para dedupe, `business.changed` post-commit y `ClaimRequestCreated` intacto. |
| `expireStaleClaimRequests` | Unit/service characterization con mocks | Cubierto indirectamente en Fase 4.10 via `createClaimRequest`; falta cubrir callers no transaccionales y `reviewClaimRequest`. |
| `reviewClaimRequest` | Unit/service characterization con mocks | Assert de `business.changed` despues de actualizar claim/ownership. |
| `updateAdminPublicationState` | Unit/service characterization con mocks | Assert de `business.changed` cuando se publica/despublica. |
| `resolveDuplicateCase MERGED` | E2E/backend characterization | Assert de eventos para primary y archived; si se inspeccionan soft-deleted, usar raw SQL contra `"businesses"` cuando aplique. |

## QA sugerido para esta documentacion

No se requiere QA runtime porque esta fase no modifica codigo ejecutable. Comandos opcionales:

```powershell
pnpm check:encoding
pnpm audit:architecture
```
