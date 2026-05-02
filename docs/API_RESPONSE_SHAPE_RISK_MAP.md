# API Response Shape Risk Map

Fecha: 2026-05-01

## Alcance

Este documento registra los riesgos de response shape entre frontend y backend detectados en Fase 8.1. No autoriza cambios de producto, contratos, controllers, DTOs, runtime frontend ni configuracion.

El objetivo es dejar claro donde el frontend depende de envelopes o payloads implicitos antes de implementar checks o tests de contrato.

## Reglas de seguridad

- No modificar `apps/web/src/api/endpoints.ts`.
- No modificar frontend runtime.
- No modificar backend, controllers, DTOs ni services.
- No agregar tests todavia.
- No activar ni cambiar `JSON_API_RESPONSE_ENABLED`.
- No cambiar response envelopes ni comportamiento.

## Hallazgos de Fase 8.1

- `apps/web/src/api/endpoints.ts` devuelve mayormente `AxiosResponse` crudo y no tipa response body por endpoint.
- El backend valida request DTOs, pero no expone response DTOs compartidos con el frontend.
- Varios consumidores frontend hacen casts locales o leen propiedades anidadas de forma directa.
- Hay varios estilos de response shape conviviendo:
  - objeto directo.
  - array directo.
  - envelope paginado `{ data, total, page, limit, totalPages }`.
  - envelope parcial `{ data, total, query }`.
  - envelope con `items`.
  - auth session `{ accessToken, user }`.
  - mensajes simples `{ message }`.
  - errores `{ statusCode, message, requestId, traceId }`.
- `JsonApiResponseInterceptor` existe y puede envolver responses como `{ jsonapi, meta, data }` si `JSON_API_RESPONSE_ENABLED` se activa.
- El frontend actual no esta preparado para un envelope JSON:API global.

## Response Shapes Mezclados Detectados

| Shape | Ejemplos | Riesgo |
| --- | --- | --- |
| Objeto directo | `GET /businesses/:identifier`, `GET /users/me`, analytics dashboard | Alto si se envuelve accidentalmente en `{ data }` adicional. |
| Array directo | categorias, provincias, organizaciones, reviews | Medio: algunos consumidores ya toleran array directo, otros no. |
| Paginado `{ data, total, page, limit, totalPages }` | `GET /businesses`, `GET /businesses/admin/all`, promociones/ads en algunos workspaces | Alto: varias pantallas leen `response.data.data` y metadata directamente. |
| Parcial `{ data, total, query }` | `GET /businesses/claim-search` | Medio: parece similar a paginado, pero no incluye `page`, `limit`, `totalPages`. |
| `{ items }` | `GET /verification/admin/moderation-queue` | Alto en admin: cambio a array o `{ data }` rompe la cola. |
| Auth session `{ accessToken, user }` | `POST /auth/login`, `/auth/register`, `/auth/refresh` | Critico: rompe sesion, bootstrap, refresh y multi-tab sync. |
| Mensaje simple `{ message }` | logout, password reset, algunas mutaciones | Medio: UI depende de fallback si `message` cambia o se anida. |
| Error `{ statusCode, message, requestId, traceId }` | `GlobalExceptionFilter` | Medio: frontend solo consume `message`; trazabilidad no esta integrada al contrato UI. |

## Endpoints Prioritarios

| Prioridad | Endpoint | Frontend consumidor critico | Riesgo |
| --- | --- | --- | --- |
| 1 | `POST /auth/login` | `AuthContext.login` | Critico: necesita `accessToken` y `user` en la raiz de `response.data`. |
| 1 | `POST /auth/register` | `AuthContext.register` | Critico: mismo contrato de sesion que login. |
| 1 | `POST /auth/refresh` | `api/client.ts`, `AuthContext` bootstrap y multi-tab sync | Critico: refresh silencioso depende de `accessToken` y `user`. |
| 2 | `GET /businesses` | `BusinessesList`, `Home` | Alto: depende de `data`, `total`, `totalPages`. |
| 2 | `GET /businesses/:identifier` | `BusinessDetails`, route preload | Alto: espera objeto negocio directo. |
| 2 | `GET /businesses/admin/all` | `AdminDashboard` | Alto: espera envelope paginado compatible con `data`. |
| 3 | `GET /verification/admin/moderation-queue` | `AdminDashboard` | Alto: espera `items`, no `data`. |
| 3 | `GET /analytics/market-insights` | `AdminDashboard` | Medio-alto: snapshot directo casteado localmente. |
| 3 | `GET /analytics/growth/insights` | `AdminDashboard`, growth workspace | Medio-alto: snapshot directo casteado localmente. |
| 3 | `GET /analytics/market-reports` | `AdminDashboard` | Medio: espera array directo. |
| 4 | `POST /telemetry/growth` | `growthTracking`, `BusinessesList`, `BusinessDetails` | Bajo-medio para response body; alto para request contract ya cubierto parcialmente por check. |

## Consumidores Frontend Criticos

| Consumidor | Dependencia de shape | Riesgo |
| --- | --- | --- |
| `apps/web/src/context/AuthContext.tsx` | Desestructura `response.data.accessToken` y `response.data.user`. | Critico. |
| `apps/web/src/api/client.ts` | Refresh interceptor espera `response.data.accessToken` y opcional `response.data.user`. | Critico. |
| `apps/web/src/pages/BusinessesList.tsx` | Lee `businessesRes.data.data`, `total`, `totalPages`. | Alto. |
| `apps/web/src/pages/Home.tsx` | Lee categorias/provincias como arrays y negocios como paginado. | Alto por mezcla de shapes en una carga inicial. |
| `apps/web/src/pages/BusinessDetails.tsx` | Detalle directo; favoritos usan paginado; promociones/nearby toleran array o `{ data }`; reviews array directo. | Alto por mezcla local. |
| `apps/web/src/pages/AdminDashboard.tsx` | Combina `data.data`, arrays directos, `items` y snapshots directos. | Alto. |
| `apps/web/src/context/OrganizationContext.tsx` | Espera organizaciones como array directo. | Medio-alto. |
| `apps/web/src/pages/AcceptOrganizationInvite.tsx` | Espera `{ organization, message }`. | Medio, ya alineado en roles pero no shape. |
| Workspaces de dashboard business | Usan helpers locales `asArray` y `parsePaginatedResponse`. | Medio: toleran algunas variantes, pero la tolerancia esta duplicada. |

## Donde TypeScript No Protege

- `endpoints.ts` no usa genericos `api.get<T>()` / `api.post<T>()` para response body en la mayoria de endpoints.
- Los response types viven en paginas o workspaces, no en una capa de contrato.
- Los DTOs backend cubren entrada, no salida.
- Los `select` de Prisma y decorators backend no son contrato estable para frontend.
- Los casts locales (`as User`, `as MarketReport[]`, `as BusinessVerificationStatus`) pueden ocultar drift hasta runtime.
- Los helpers locales `asArray` y `parsePaginatedResponse` normalizan algunas respuestas, pero no hacen validacion contractual.
- `AxiosResponse` agrega un primer `.data`; varios endpoints backend tambien usan `data`, creando el patron fragil `response.data.data`.

## Riesgo de JSON_API_RESPONSE_ENABLED

`JsonApiResponseInterceptor` puede envolver cualquier response HTTP en:

```ts
{
  jsonapi: { version: '1.0' },
  meta: { requestId, timestamp },
  data: payload
}
```

Riesgo si se activa sin migracion:

- `AuthContext` buscaria `accessToken` y `user` en `response.data`, pero pasarían a `response.data.data`.
- `GET /businesses` pasaria de `response.data.data` a `response.data.data.data`.
- Detalle de negocio pasaria de objeto directo a `response.data.data`.
- Arrays directos pasarian a `response.data.data`.
- Admin dashboard mezclaria aun mas envelopes y podria mostrar vacios silenciosos.
- `getApiErrorMessage` no cubre error envelopes JSON:API; hoy consume `error.response.data.message`.

Conclusion: no activar `JSON_API_RESPONSE_ENABLED` hasta tener adaptadores frontend, contrato documentado y tests de caracterizacion.

## Que NO Tocar Todavia

- No activar `JSON_API_RESPONSE_ENABLED`.
- No cambiar `JsonApiResponseInterceptor`.
- No cambiar `GlobalExceptionFilter`.
- No convertir `endpoints.ts` de golpe a tipos genericos.
- No cambiar response shapes backend.
- No renombrar `data`, `items`, `total`, `totalPages`, `accessToken`, `user` ni `message`.
- No tocar auth/session/refresh dentro de una fase de response shape general.
- No tocar `AdminDashboard` sin una fase dedicada.
- No mezclar contratos de response con refactors visuales o de cache.

## Fase 8.4: Check Manual para GET /businesses

Fase 8.4 implemento un check manual/read-only/report-only para `GET /businesses` response shape.

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-businesses-response-shape.mjs` |
| Comando | `node scripts/check-businesses-response-shape.mjs` |
| Resultado actual | Pass, `Findings: none` |
| Modo | Manual/report-only; sale exit `0` y no esta conectado a CI |

El contrato actual de `GET /businesses` queda alineado entre frontend y backend para el shape:

- `data`
- `total`
- `page`
- `limit`
- `totalPages`

El check tambien confirma:

- `businessApi.getAll` existe.
- `businessApi.getAll` llama a `api.get('/businesses', { params })`.
- `businessApi.getAll` no transforma `response.data` antes de devolverlo.
- `BusinessesList` consume `businessesRes.data.data`.
- `BusinessesList` consume `businessesRes.data.total`.
- `BusinessesList` consume `businessesRes.data.totalPages`.
- `BusinessesController.findAll` expone `GET /businesses`.
- `BusinessesService.findAll` delega hacia `SearchService.listPublicBusinesses`.
- `SearchService.listPublicBusinessesViaDatabase` produce el envelope esperado.
- El branch vacio conserva `data: []` y `totalPages`.
- `source` existe como metadata extra permitida y no requerida por `BusinessesList`.

Warning informativo:

- `JSON_API_RESPONSE_ENABLED` existe en `JsonApiResponseInterceptor`. Si se activa sin adaptadores frontend, `GET /businesses` podria pasar de `response.data.data` a `response.data.data.data`.

QA ejecutado:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/check-businesses-response-shape.mjs` | Pass. |
| `pnpm qa:smoke` | Pass: lint, typecheck, web unit tests y API unit tests. |

Warning no bloqueante:

- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API. Es conocido y no esta relacionado con Fase 8.4.

## Primera Mejora Segura Recomendada

El primer check seguro ya existe para `GET /businesses`. La siguiente mejora segura recomendada es disenar el check manual/report-only para auth session shape:

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`

Debe validar que el frontend espera `accessToken` y `user` en la raiz de `response.data`, y que el backend mantiene ese shape sin activar envelopes globales.

## Candidatos Futuros para Checks o Tests de Contrato

| Orden | Check/test candidato | Tipo | Por que |
| --- | --- | --- | --- |
| 1 | `GET /businesses` response shape | Check estatico manual | Implementado en `scripts/check-businesses-response-shape.mjs`; resultado actual pass, `Findings: none`. |
| 2 | `POST /auth/login/register/refresh` session shape | Check estatico + e2e focalizado posterior | Protege la sesion antes de cualquier cambio de envelope. |
| 3 | `GET /businesses/:identifier` detalle directo | Check estatico manual | Evita romper `BusinessDetails` con envelope adicional. |
| 4 | `GET /businesses/admin/all` paginado admin | Check estatico manual | Protege admin list sin tocar acciones admin. |
| 5 | `GET /verification/admin/moderation-queue` `{ items }` | Check estatico manual | Shape distinto y facil de romper por normalizacion. |
| 6 | `JSON_API_RESPONSE_ENABLED` safety check | Check config/report-only | Alertar si se activa sin adaptador frontend. |
| 7 | Contract tests runtime con QA stack para `GET /businesses` y auth session | API/e2e focalizados | Segundo nivel despues de checks estaticos. |

## Estado Actual

- Fase 8.1 queda documentada.
- Fase 8.4 queda documentada con check manual para `GET /businesses` response shape.
- No hay cambios de runtime.
- No hay tests nuevos.
- El check `scripts/check-businesses-response-shape.mjs` queda manual/report-only y fuera de CI.
- `GET /businesses` queda alineado para `data`, `total`, `page`, `limit` y `totalPages`.
- Riesgo principal pendiente: auth session shape y otros response shapes criticos aun no estan protegidos de punta a punta por TypeScript ni por tests de contrato.
