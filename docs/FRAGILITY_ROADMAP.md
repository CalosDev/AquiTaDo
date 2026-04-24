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
| `/businesses` listado publico | partial | Alto: filtros, mapa, paginacion, tracking y contrato API. | `playwright/specs/acceptance-public.spec.ts`, `apps/web/src/tests/integration/BusinessesList.integration.test.tsx`, `apps/web/src/pages/businesses-list/*.test.tsx` | Browser test para combinaciones de filtros, paginacion, error API y no-results con URL estable. |
| `/businesses?view=map` vista mapa | partial | Alto: sincroniza URL, listado, seleccion y negocios sin coordenadas. | `acceptance-public.spec.ts`, `BusinessesList.integration.test.tsx` | Caracterizar seleccion de negocio, retorno a lista y edge case sin coordenadas. |
| `/businesses/:slug` detalle valido | partial | Alto: detalle publico, SEO, imagenes, reviews, favoritos y tracking. | `apps/web/src/pages/BusinessDetails.test.tsx`, `business-details/helpers.test.ts` | Acceptance con slug seed real y contrato minimo de contenido visible. |
| `/businesses/:slug` slug inexistente | pass | Medio: recuperacion publica sin pantalla rota. | `playwright/specs/acceptance-public.spec.ts` | Agregar evidencia de status/CTA si el contrato de error cambia. |
| `/negocios/provincia/:provinceSlug` | partial | Alto: SEO route sincroniza slug a `provinceId` y query. | `BusinessesList.integration.test.tsx`, `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para provincia seed real y filtros persistentes. |
| `/negocios/categoria/:categorySlug` | partial | Alto: SEO, canonical y filtro fijo. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para categoria seed real, clear filters y canonical esperado. |
| `/negocios/intencion/:intentSlug` | partial | Alto: intencion mapea feature y copy SEO. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para intencion seed real y salida segura a `/businesses`. |
| `/negocios/:provinceSlug/:categorySlug` | partial | Alto: combina dos filtros SEO y query state. | `useBusinessesListFilters.test.tsx`, `useBusinessesSeo.test.tsx` | Acceptance browser para combinacion provincia + categoria. |
| `/login` formulario | partial | Alto: entrada a sesion, errores y redirect. | `acceptance-auth.spec.ts`, `auth.e2e.spec.ts`, `Login.integration.test.tsx`, `a11y.spec.ts`, `visual.spec.ts` | Caracterizar 2FA, refresh fallido y retorno a ruta protegida. |
| Login invalido | pass | Alto: errores auth no deben dejar boton bloqueado ni navegar. | `auth.e2e.spec.ts`, `Login.integration.test.tsx` | Agregar variante 429/throttle si se cambia auth. |
| Sesion admin reload/logout multi-tab | pass | Alto: refresh, storage y sync entre tabs. | `playwright/specs/auth.e2e.spec.ts` | Agregar variante token expirado y refresh cookie ausente. |
| `/register` formulario | partial | Medio: alta de usuario y seleccion de rol. | `acceptance-auth.spec.ts` | Caracterizar registro exitoso USER y BUSINESS_OWNER, y errores backend. |
| `/forgot-password` | not-covered | Medio: recuperacion de cuenta y mensajes de seguridad. | No encontrada. | Acceptance basica de formulario y mensaje neutral post-submit. |
| `/reset-password` | not-covered | Medio: token invalido/expirado y cambio de password. | No encontrada. | Acceptance para token invalido y contrato visual del formulario. |
| `/app` shell autenticado | partial | Medio: landing post-login y redireccion por rol. | `Login.integration.test.tsx`, helpers de auth Playwright. | Acceptance por rol para destino final tras login. |
| `/app/customer` | not-covered | Medio: panel cliente y permisos USER. | No encontrada. | Acceptance con USER seed y bloqueo para roles no esperados. |
| `/profile` | partial | Medio: perfil autenticado, avatar y datos de usuario. | `apps/web/src/pages/Profile.test.tsx` | Acceptance autenticada con render basico, update error y estado vacio. |
| `/dashboard` fresh business owner | partial | Alto: rol BUSINESS_OWNER, organizacion activa y CTA inicial. | `playwright/specs/acceptance-business.spec.ts` | Caracterizar dashboard con organizacion/negocio existente. |
| `/register-business` | partial | Alto: formulario multi-step, org context, uploads y validacion. | `playwright/specs/acceptance-business.spec.ts` | Characterization por pasos con datos invalidos y sin cambiar backend. |
| `/dashboard/businesses/:businessId/edit` | not-covered | Alto: ownership, org context, mutaciones y cache. | No encontrada. | Acceptance con negocio seed propiedad del usuario y caso no autorizado. |
| `/suggest-business` | not-covered | Medio: usuario final crea sugerencia y evita spam/errores. | No encontrada. | Acceptance USER con formulario vacio, validacion y submit mock/seed. |
| `/app/invite` | not-covered | Alto: token de invitacion, membresia y org context. | No encontrada. | Acceptance con token invalido y token valido seed. |
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

No implementar en esta fase. Orden recomendado para futuras fases:

1. Browser acceptance para `/businesses` con SEO routes: provincia, categoria, intencion y provincia+categoria. Debe verificar heading/contexto visible, URL final, clear filters y estado no-results.
2. Browser acceptance para `/businesses/:slug` con un slug seed real. Debe verificar nombre, direccion/categoria si aplica, CTA principal y fallback de imagen sin snapshot visual.
3. Matriz de roles en Playwright para rutas protegidas: USER, BUSINESS_OWNER y ADMIN contra `/app/customer`, `/dashboard`, `/register-business`, `/admin`, `/security` y `/suggest-business`.
4. Caracterizacion de auth refresh: token expirado, refresh ausente y logout multi-tab manteniendo destino final esperado.
5. Acceptance de PWA/update: banner de update disponible y navegacion offline a una ruta previamente visitada.
6. API contract tests para lista/detalle/search de negocios: status, campos publicos minimos, paginacion y filtros.
7. Cache invalidation tests para cambios de negocio/promocion: crear o actualizar entidad, invalidar prefijo esperado y comprobar lectura fresca.
8. Admin safe-route tests: `/admin` y `/security` render basico, bloqueo no-admin y estados de error sin ejecutar acciones destructivas.

## QA recomendado para cerrar esta fase

Esta fase solo toca documentacion, por lo que no requiere levantar la pila completa. Comandos recomendados:

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
