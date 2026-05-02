# Auth and Organization Context Risk Map

Fecha: 2026-04-25

## Alcance

Este documento registra el mapa de riesgo de auth, permisos, roles y contexto de organizacion detectado en Fase 5.1. Es una fotografia documental. No autoriza cambios de producto, guards, controllers, frontend, storage, sesiones, tests, scripts ni CI.

## Reglas de esta fase

- Solo documentacion.
- No modificar `apps/api/src/auth/**`.
- No modificar guards de JWT, roles u organizacion.
- No modificar controllers, DTOs, services, policies ni contratos API.
- No modificar `apps/web/src/api/client.ts`.
- No modificar `AuthContext`, `OrganizationContext` ni `ProtectedRoute`.
- No modificar storage/session, rutas, copy, UI ni redirects.
- No agregar tests todavia.
- No cambiar comportamiento.

## Zonas fragiles detectadas en Fase 5.1

| Zona | Archivos principales | Riesgo |
| --- | --- | --- |
| Emision y rotacion de sesiones | `apps/api/src/auth/auth.service.ts` | `AuthService` concentra login, refresh, logout, cookies, password reset, Google auth, 2FA, email y revocacion. Un cambio local puede afectar varios flujos. |
| Validacion de access token | `apps/api/src/auth/jwt.strategy.ts` | La estrategia valida usuario y `sessionVersion`; es una proteccion fuerte, pero cualquier cambio puede alterar revocacion global. |
| Guards opcionales | `apps/api/src/auth/guards/optional-jwt-auth.guard.ts`, `apps/api/src/organizations/guards/optional-org-context.guard.ts` | Tokens invalidos o ausentes se degradan a usuario anonimo/contexto nulo en rutas publicas. Esto evita 401, pero puede ocultar expiraciones. |
| Roles y guards por decorador | `RolesGuard`, `OrgContextGuard`, `OrgRolesGuard`, controllers protegidos | La seguridad depende de combinaciones correctas de `JwtAuthGuard`, `RolesGuard`, `OrgContextGuard`, `OrgRolesGuard` y policies en cada handler. |
| Contexto de organizacion | `apps/api/src/organizations/guards/org-context.guard.ts` | `x-organization-id` tiene precedencia sobre `organizationId`; admin tiene bypass especial; business owner requiere membresia. |
| Policy runtime | `apps/api/src/core/authorization/policy.service.ts` | Las reglas de ownership/policy se evalua en runtime; TypeScript no protege permisos por recurso. |
| Frontend session state | `apps/web/src/api/client.ts`, `apps/web/src/context/AuthContext.tsx` | El token vive en memoria/sessionStorage, user/session hint en localStorage, refresh en cookie. El interceptor puede refrescar storage sin sincronizar estado React inmediatamente. |
| Organization state frontend | `apps/web/src/context/OrganizationContext.tsx` | `activeOrganizationId` vive en localStorage y no esta scopeado por user id; puede quedar stale entre cambios de cuenta/rol. |
| Protected routes frontend | `apps/web/src/components/ProtectedRoute.tsx`, `apps/web/src/auth/roles.ts` | El frontend redirige por rol, pero el backend sigue siendo la autoridad. Cualquier drift genera UX confusa o 403 despues de navegar. |

## Endpoints auth relevantes

| Endpoint | Guard | Riesgo principal |
| --- | --- | --- |
| `POST /auth/register` | Publico | Seleccion de rol publica; backend debe impedir ADMIN y preservar validaciones. |
| `POST /auth/login` | Publico | Entrada principal a sesion; puede activar 2FA admin si esta configurado. |
| `POST /auth/google` | Publico | Flujo alterno de login/register; comparte emision de sesion. |
| `POST /auth/refresh` | Publico, cookie/body refresh token | Depende de cookie HttpOnly y `RefreshTokenDto.refreshToken` opcional. |
| `POST /auth/logout` | Publico, cookie/body refresh token | Limpia refresh token si lo resuelve; frontend limpia estado aunque backend falle. |
| `POST /auth/forgot-password` | Publico | Debe mantener respuesta segura y no filtrar existencia de cuenta. |
| `POST /auth/reset-password` | Publico | Cambia password y debe invalidar sesiones existentes. |
| `POST /auth/change-password` | `JwtAuthGuard` | Cambia password de usuario autenticado y revoca sesiones. |
| `GET /auth/2fa/status` | `JwtAuthGuard` | Lee estado 2FA; sensible para admin. |
| `POST /auth/2fa/setup` | `JwtAuthGuard` | Genera secreto 2FA; no debe filtrar secreto indebidamente. |
| `POST /auth/2fa/enable` | `JwtAuthGuard` | Activa 2FA; afecta login posterior. |
| `POST /auth/2fa/disable` | `JwtAuthGuard` | Desactiva 2FA; sensible para cuentas admin. |

## Guards principales y donde aplican

| Guard / policy | Funcion | Aplicacion observada | Riesgo |
| --- | --- | --- | --- |
| `JwtAuthGuard` | Requiere access token valido. | Rutas autenticadas de auth, organizations, businesses owner/admin y modulos org. | Cambios alteran 401, revocacion y acceso general. |
| `OptionalJwtAuthGuard` | Intenta autenticar, pero permite continuar anonimo. | Detalle publico de negocio y rutas publicas con comportamiento opcional. | Token expirado puede verse como anonimo, no como sesion expirada. |
| `RolesGuard` | Exige rol por `@Roles`. | Auth/admin/organizations/businesses y endpoints sensibles. | Si se combina mal con `JwtAuthGuard`, puede cambiar 401/403. En la auditoria no se detecto uso directo sin `JwtAuthGuard`. |
| `OrgContextGuard` | Resuelve organizacion activa por header/query y valida membresia. | Endpoints org-scoped: businesses owner, bookings, messaging, payments, ads, promotions, verification, subscriptions. | `x-organization-id` stale puede producir 400/403 o contexto incorrecto. |
| `OptionalOrgContextGuard` | Resuelve org si hay usuario/contexto, pero permite null. | Detalle publico de negocio y algunos flujos que aceptan org opcional. | Permite comportamiento distinto segun header localStorage aunque la ruta parezca publica. |
| `OrgRolesGuard` | Exige rol dentro de organizacion. | Endpoints de gestion org donde no basta pertenecer. | Falla con 403 generico si falta org role. |
| `PolicyService` / `PolicyGuard` | Evalua acciones por recurso, rol, ownership y org activa. | Mutaciones de negocios y recursos sensibles. | Reglas runtime no estan modeladas en tipos frontend. |

## Roles y permisos sensibles

| Rol | Capacidades sensibles | Riesgo |
| --- | --- | --- |
| `USER` | Flujos customer, invitaciones, perfil, algunas interacciones publicas. | Puede portar `activeOrganizationId` stale desde localStorage y disparar 403 si el cliente manda header global. |
| `BUSINESS_OWNER` | Organizaciones propias, dashboard, negocios, claims, bookings, payments y modulos org. | Depende de org activa y membresia. Cambiar org context puede romper dashboard completo. |
| `ADMIN` | Admin dashboard, observability, catalogo, claims, publicaciones, ownership y bypasses. | Puede operar sin org context o con org context como pseudo-owner. Debe caracterizarse antes de cambiar. |

Permisos especialmente sensibles:

- Registro publico no debe permitir `ADMIN`.
- Refresh/logout dependen de cookie y token revocable.
- Password reset/change password deben invalidar sesiones existentes.
- Admin 2FA tiene reglas especiales y TTL corto.
- Admin bypass de org context no debe confundirse con membresia real.
- Business owner con org activa debe pasar ownership y policy.

## Fuentes de organization context

| Fuente | Capa | Uso | Riesgo |
| --- | --- | --- | --- |
| `x-organization-id` | HTTP request/backend | Fuente primaria en `OrgContextGuard`. | Tiene precedencia sobre query; si esta stale puede afectar rutas protegidas u opcionales. |
| `organizationId` | Query/backend | Fallback si no existe header. | Ambiguo si header y query difieren. |
| `localStorage.activeOrganizationId` | Frontend | `api/client.ts` lo inyecta como `x-organization-id` en cada request si existe. | No esta scopeado por user id; puede sobrevivir a cambios de usuario/rol hasta que el contexto lo limpie. |
| `OrganizationContext` | Frontend React | Carga organizaciones y selecciona activa para `BUSINESS_OWNER`. | La limpieza depende de auth loading/role y de la respuesta de `/organizations/mine`. |
| `request.organizationContext` | Backend runtime | Usado por services, policies y handlers org-scoped. | Si es null o incorrecto, puede causar 400/403, acceso amplio admin o resultados vacios. |

## Riesgos de 401/403 incorrectos

| Riesgo | Descripcion | Impacto |
| --- | --- | --- |
| Token expirado en ruta opcional | `OptionalJwtAuthGuard` traga errores y continua anonimo. | La UI puede no recibir 401 ni limpiar sesion, y el usuario ve estado anonimo/parcial. |
| Header org stale | El cliente envia `x-organization-id` globalmente si existe en localStorage. | USER o cuenta distinta puede recibir 403/400 en rutas que no esperaba. |
| Missing org en ruta requerida | `OrgContextGuard` puede devolver 400 para business owner sin org en rutas requeridas. | Error correcto tecnicamente, pero UX puede parecer sesion rota. |
| Admin sin org context | Admin puede pasar sin org en algunos guards y luego depender del service. | Puede producir acceso amplio intencional, resultados no filtrados o errores si el service esperaba org. |
| Roles frontend/backend divergentes | `ProtectedRoute` decide UX, backend decide autoridad real. | Navegacion permitida por UI puede terminar en 403 backend. |
| Org role ausente | `OrgRolesGuard` devuelve false si falta role en org context. | 403 generico con diagnostico pobre. |

## Riesgos de refresh, logout y session sync

| Zona | Riesgo |
| --- | --- |
| Refresh cookie-only | `authApi.refresh()` depende de cookie HttpOnly y body vacio. Endurecer DTO o cookie path rompe el flujo. |
| Interceptor refresh | `api/client.ts` refresca access token y reintenta una vez. Puede actualizar storage sin actualizar inmediatamente `AuthContext`. |
| Logout client-first | El frontend limpia estado local antes de confirmar logout backend; si falla la request, puede quedar refresh token valido en servidor/cookie. |
| Multi-tab sync | `AuthContext` usa eventos `storage` y session hint; no toda transicion de token implica estado React sincronizado en el mismo instante. |
| Access token storage | Access token vive en memoria y sessionStorage; localStorage conserva user/session hint. El modelo multi-store es sensible a drift. |
| Admin sessions | Admin tiene access TTL corto y rotacion/revocacion especial de refresh tokens. Seguridad buena, pero puede sorprender multi-tab/multi-device. |

## Riesgos de admin con/sin org context

| Caso | Comportamiento actual esperado | Riesgo |
| --- | --- | --- |
| Admin sin `x-organization-id` en `OrgContextGuard` | Bypass con `organizationContext = null`. | Services deben distinguir admin global de org scoped; no todos los riesgos se ven en tipos. |
| Admin con `x-organization-id` valido | Guard valida existencia de org y asigna role tipo `OWNER`. | Puede parecer membresia real aunque sea bypass administrativo. |
| Admin en `OrgRolesGuard` | Bypass de roles org. | Correcto para plataforma, pero requiere tests para no abrir rutas no previstas. |
| Admin en policy de negocios | `PolicyService` permite bypass admin para business policy. | Cambios de policy pueden romper admin dashboard o mutaciones sensibles. |
| Admin en frontend invite | UI autenticada puede permitir navegar, backend puede devolver 403 en accept invite. | Drift UX/API; conviene caracterizar antes de decidir cambio. |

## Cobertura actual conocida

| Superficie | Estado | Evidencia conocida |
| --- | --- | --- |
| Login invalido | Cubierto | `apps/api/src/auth/auth.e2e.spec.ts` y tests frontend de login. |
| Refresh cookie rotation | Cubierto | `apps/api/src/auth/auth.e2e.spec.ts`. |
| Change password revoca refresh/access | Cubierto | `apps/api/src/auth/auth.e2e.spec.ts`. |
| Logout invalida access actual | Cubierto | `apps/api/src/auth/auth.e2e.spec.ts`. |
| Password reset invalida sesiones | Cubierto parcialmente | `apps/api/src/auth/auth.e2e.spec.ts`; falta caracterizacion frontend de token invalido. |
| SessionVersion en JWT | Cubierto | `apps/api/src/auth/jwt.strategy.spec.ts`. |
| Roles basicos admin/owner/user | Cubierto parcialmente | `apps/api/src/auth/role-access.e2e.spec.ts`; matriz limitada a algunos endpoints. |
| ProtectedRoute frontend | Cubierto parcialmente | `apps/web/src/components/ProtectedRoute.test.tsx`. |
| API client token storage | Cubierto parcialmente | `apps/web/src/api/client.test.ts`; no cubre toda la sincronizacion refresh/AuthContext. |
| Organization access service | Cubierto parcialmente | `apps/api/src/organizations/organization-access.service.spec.ts`. |
| `x-organization-id` malformed en businesses | Cubierto parcialmente | `apps/api/src/businesses/businesses.e2e.spec.ts`. |
| Multi-tab/session sync | Parcial | Hay logica en `AuthContext`, pero falta caracterizacion completa por escenario. |
| Admin con/sin org context | Parcial | Hay cobertura indirecta en negocios/admin; falta matriz dedicada por guard. |
| Optional auth/org public routes | Parcial | Detalle publico conserva guards opcionales; falta caso token expirado/stale org. |
| `/app/invite` frontend route | Cubierto | `apps/web/src/routes/Router.test.tsx` ya valida que `USER` y `BUSINESS_OWNER` llegan a la ruta y que `ADMIN` redirige temprano a `/admin`. |
| `/app/invite` backend accept roles | Cubierto | `apps/api/src/auth/role-access.e2e.spec.ts` fue validado runtime con `node scripts/run-with-qa-stack.mjs -- pnpm --filter @aquita/api exec vitest run src/auth/role-access.e2e.spec.ts -t "enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role"`; `ADMIN` recibe `403`, `USER` y `BUSINESS_OWNER` reciben `404`, no `403`. |

## Posibles inconsistencias frontend/backend

- `canManageOrganizations` no marca `BUSINESS_OWNER` como capability general, mientras `OrganizationContext` si special-casea `BUSINESS_OWNER` para cargar organizaciones.
- El frontend envia `x-organization-id` de forma global; el backend solo lo acepta para contextos validos segun rol/membresia o bypass admin.
- El interceptor de refresh puede actualizar token/storage sin que el estado React cambie inmediatamente.
- `ProtectedRoute` decide redireccion por rol local; backend revalida rol real desde token/DB en cada request.

## Que NO tocar todavia

- No tocar `apps/api/src/auth/auth.service.ts`.
- No tocar `JwtStrategy`, `JwtAuthGuard`, `OptionalJwtAuthGuard`, `RolesGuard`, `OrgContextGuard`, `OptionalOrgContextGuard`, `OrgRolesGuard` ni policies.
- No tocar cookies, TTLs, refresh token hashing, `sessionVersion`, logout ni 2FA.
- No tocar `apps/web/src/api/client.ts`.
- No tocar `AuthContext`, `OrganizationContext`, `ProtectedRoute`, `roles.ts` ni `capabilities.ts`.
- No cambiar `x-organization-id`, localStorage/sessionStorage ni session hint.
- No cambiar rutas protegidas, redirects, HTTP status, error shape, roles ni permisos.
- No modificar controllers admin/org ni endpoints protegidos.
- No conectar checks a CI sin una fase dedicada.

## Check manual implementado en Fase 5.4

Se agrego un check estatico manual/read-only/report-only para mapear rutas protegidas, guards, roles y contexto de organizacion.

- Script: `scripts/check-auth-org-routes.mjs`.
- Comando: `node scripts/check-auth-org-routes.mjs`.
- Modo: manual y report-only; no esta conectado a CI y no bloquea builds.
- Exit code actual: `0`, incluso con findings reportados.
- Backend routes mapeadas: `181`.
- Frontend routes mapeadas: `25`.
- Findings report-only actuales: `2`.

El check reporta:

- Backend route -> `controller.method` -> guards -> roles -> org roles -> org context.
- Frontend route -> proteccion -> roles permitidos -> redirect esperado.
- Riesgos estructurales como `RolesGuard` sin `JwtAuthGuard`, `@Roles` sin `RolesGuard`, `OrgRolesGuard` sin `OrgContextGuard`, `OrgContextGuard` sin `JwtAuthGuard`, `CurrentOrganization` sin guard org, combinacion `OptionalJwtAuthGuard + OptionalOrgContextGuard`, rutas frontend authenticated-only con posible choque backend por rol y uso global de `x-organization-id` desde localStorage.

Findings actuales:

| Finding | Riesgo | Detalle | Estado |
| --- | --- | --- | --- |
| `GET /businesses/:identifier` usa `OptionalJwtAuthGuard + OptionalOrgContextGuard` | Info | Token invalido/expirado puede degradar a anonimo con contexto org opcional. | Report-only; no corregir sin caracterizacion. |
| `api/client.ts` inyecta `x-organization-id` globalmente desde `localStorage.activeOrganizationId` | Info | Un org id stale puede viajar en requests no esperados hasta que el contexto lo limpie. | Report-only; no cambiar sin test de session/org sync. |

Limites deliberados:

- No valida requests reales.
- No valida JWT real, cookies, refresh/logout ni 2FA.
- No valida DB, membership real, Prisma ni Redis.
- No valida response shape.
- No valida permisos efectivos dentro de services.
- No conecta nada a CI.

## Test frontend actualizado en Fase 5.12

`apps/web/src/routes/Router.test.tsx` quedo actualizado para alinear el contrato frontend de `/app/invite` con el backend.

- Tests relevantes:
  - `allows USER to reach /app/invite`
  - `allows BUSINESS_OWNER to reach /app/invite`
  - `redirects ADMIN away from /app/invite to the admin home`
- Comando ejecutado: `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/routes/Router.test.tsx`.
- Resultado: pass (`1 file passed`, `6 tests passed`).
- Contrato frontend actual:
  - `USER` llega a `/app/invite`.
  - `BUSINESS_OWNER` llega a `/app/invite`.
  - `ADMIN` no llega a `/app/invite` y redirige a `/admin` via `resolveRoleHomePath`.
- Estado: `/app/invite` queda alineado con el backend sin tocar `AcceptOrganizationInvite`, backend, guards ni roles backend.

Limites del test:

- No valida token real de invitacion.
- No valida invitacion valida/invalida a nivel de submit o UX completa.
- No valida `POST /organizations/invites/:token/accept` en este archivo.
- No usa DB, cookies, JWT real ni submit del formulario.

## Test backend/API agregado en Fase 5.8

Se agrego un test e2e/API de caracterizacion en `apps/api/src/auth/role-access.e2e.spec.ts`.

- Test: `enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role`.
- Contrato caracterizado: `POST /api/organizations/invites/:token/accept` debe bloquear `ADMIN` por rol con `403`, mientras que `USER` y `BUSINESS_OWNER` no deben fallar por rol; con invite token inexistente deben llegar al service y recibir `404`.
- No valida invitacion valida, email del invite, membership final, cambio de rol, auditoria, frontend `/app/invite`, cookies/refresh/session sync ni `x-organization-id`.
- Comando ejecutado: `node scripts/run-with-qa-stack.mjs -- pnpm --filter @aquita/api exec vitest run src/auth/role-access.e2e.spec.ts -t "enforces invite acceptance roles without blocking USER or BUSINESS_OWNER by role"`.
- Resultado runtime: pass.
- `ADMIN` recibe `403`.
- `USER` recibe `404`, no `403`.
- `BUSINESS_OWNER` recibe `404`, no `403`.
- Docker levanto DB y Redis correctamente.
- Migraciones, seed, build API/web y e2e completaron sin fallo.
- Aviso no bloqueante: Prisma `7.4.1 -> 7.8.0`.
- Estado: el contrato `/app/invite` queda caracterizado en frontend, backend y check estatico.

El e2e backend sigue valido sin cambios: el contrato de `POST /api/organizations/invites/:token/accept` sigue siendo la fuente de verdad runtime para `ADMIN -> 403` y `USER`/`BUSINESS_OWNER` sin bloqueo por rol.

Proximo paso recomendado: acceptance acotado para token invalido/valido de `/app/invite` si se quiere cubrir UX, sin volver a tocar roles ni backend.

## Check reforzado en Fase 5.10

Se reforzo `scripts/check-auth-org-routes.mjs` con una regla estatica/manual/report-only especifica para `/app/invite`.

El check valida estaticamente:

- `/app/invite` existe en `apps/web/src/routes/Router.tsx`.
- `/app/invite` esta protegida por `ProtectedRoute` con roles explicitos `USER` y `BUSINESS_OWNER`.
- `AcceptOrganizationInvite` usa `organizationApi.acceptInvite`.
- `organizationApi.acceptInvite` apunta a `POST /organizations/invites/${token}/accept`.
- `OrganizationsController` expone `@Post("invites/:token/accept")`.
- El endpoint usa `JwtAuthGuard` y `RolesGuard`.
- El endpoint permite `USER` y `BUSINESS_OWNER`.
- `RolesGuard` usa `getAllAndOverride`, por lo que los roles del handler sobrescriben los roles de clase.

Findings actuales del check reforzado: `2`.

| Finding | Riesgo | Estado |
| --- | --- | --- |
| `GET /businesses/:identifier` usa `OptionalJwtAuthGuard + OptionalOrgContextGuard` | Info | Report-only. |
| `api/client.ts` inyecta `x-organization-id` globalmente desde `localStorage.activeOrganizationId` | Info | Report-only. |

El check complementa, no sustituye, el e2e de `apps/api/src/auth/role-access.e2e.spec.ts`. El e2e ya quedo validado runtime con QA stack y el check sigue siendo util para detectar drift sin depender de DB/Docker; no reemplaza la validacion real de `403/404`, JWT y guards ejecutados por Nest.

Comandos ejecutados en Fase 5.10:

| Comando | Resultado |
| --- | --- |
| `node scripts/check-auth-org-routes.mjs` | Pass, exit `0`, findings report-only `2`; el finding de mismatch `/app/invite` desaparecio. |
| `node --check scripts/check-auth-org-routes.mjs` | Pass, sintaxis valida. |
| `pnpm qa:smoke` | Pass; el primer intento local agoto timeout, el rerun amplio termino verde y no estuvo relacionado con producto. |
| `pnpm --filter @aquita/web exec vitest run --config vitest.unit.config.ts src/routes/Router.test.tsx` | Pass (`1 file passed`, `6 tests passed`). |

Warning conocido no bloqueante: `Geoapify geocoding failed (HTTP 503)` en tests unitarios de `IntegrationsService`. La suite termino en pass.

## Primera mejora segura recomendada

El check de Fase 5.4 reforzado en Fase 5.10 cubre la primera mejora segura prevista: producir una matriz revisable de auth/org context sin modificar runtime ni bloquear CI. El siguiente paso seguro es usar su salida para disenar una caracterizacion acotada, no cambiar guards ni frontend directamente.

El check lista:

- handlers con `OrgContextGuard`.
- handlers con `OptionalOrgContextGuard`.
- handlers con `RolesGuard` y sus `@Roles`.
- handlers con `OrgRolesGuard`.
- handlers publicos con `OptionalJwtAuthGuard`.
- rutas frontend protegidas y roles esperados en `ProtectedRoute`.

El objetivo sigue siendo no bloquear CI ni declarar bugs automaticamente, sino detectar drift antes de tocar guards o frontend auth.

## Candidatos futuros para checks o tests de caracterizacion

| Candidato | Tipo | Cobertura minima |
| --- | --- | --- |
| Controller guard map | Check estatico manual/report-only | Listar guards y roles por handler protegido; detectar `RolesGuard` sin `JwtAuthGuard` si aparece. |
| Org context guard matrix | Unit/e2e backend | BUSINESS_OWNER sin org, BUSINESS_OWNER con org valida, USER con org, ADMIN sin org, ADMIN con org. |
| Optional auth detail publico | E2E/API | Token expirado o invalido en ruta opcional no debe romper detalle publico; documentar comportamiento anonimo. |
| Global `x-organization-id` injection | Unit frontend | Confirmar cuando se envia header y cuando se limpia tras 401/logout/cambio de cuenta. |
| Refresh interceptor + AuthContext | Integration frontend | Caracterizar refresh exitoso/fallido y sincronizacion de estado React/storage. |
| Logout failure | Integration frontend/API mock | Confirmar comportamiento client-first y evento de unauthorized si aplica. |
| `/app/invite` ADMIN | API/backend | Contrato ya validado runtime en Fase 5.8; siguiente paso recomendado: acceptance con token invalido/valido para revisar UX, no rol backend. |
| Role matrix org endpoints | E2E backend | bookings, messaging, payments, ads, promotions, verification para USER/BUSINESS_OWNER/ADMIN. |
| Admin no org context | E2E backend | Confirmar endpoints admin esperados sin `x-organization-id` y bloquear donde no corresponda. |
| Business owner org switch | Acceptance frontend | Cambiar organizacion activa y verificar header, dashboard y requests siguientes. |

## Riesgos pendientes despues de Fase 5.12

- `x-organization-id` global desde `localStorage.activeOrganizationId`: riesgo de org context stale en requests no esperados.
- `OptionalJwtAuthGuard + OptionalOrgContextGuard`: rutas opcionales pueden degradar token invalido/expirado a anonimo.
- Session sync/refresh: el modelo con access token en memoria/sessionStorage, user/session hint en localStorage y refresh cookie todavia necesita caracterizacion dedicada.
- `/app/invite` ya no tiene mismatch de roles; el riesgo pendiente de esa ruta pasa a UX de token valido/invalido, membership final y refresh de organizaciones tras aceptar.
- El check estatico reforzado ya refleja la alineacion de `/app/invite`, pero no valida requests reales, JWT real, `403/404` runtime, DB, Prisma, Redis, cookies/refresh, invitacion valida ni membership final.
- El check es manual/report-only y debe permanecer fuera de CI hasta tener una fase dedicada de estabilizacion.

## QA sugerido para esta documentacion

No se requiere QA runtime porque esta fase no modifica codigo ejecutable. Comandos opcionales:

```powershell
pnpm check:encoding
pnpm audit:architecture
```
