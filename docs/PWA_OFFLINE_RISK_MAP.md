# PWA / Offline Risk Map

## Objetivo

Documentar el estado actual de la capa PWA/offline del frontend sin modificar runtime. Este mapa resume estrategia de cache, fallback offline, riesgos de contenido stale, dependencias ocultas, cobertura actual de pruebas y el check manual agregado en Fase 6.4.

## Alcance analizado

- `apps/web/public/service-worker.js`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/offline.html`
- `apps/web/nginx.conf`
- `apps/web/src/lib/pwa.ts`
- `apps/web/src/components/AppRuntimeStatus.tsx`
- `apps/web/src/context/AuthContext.tsx`
- `apps/web/src/lib/queryClient.ts`
- `playwright/specs/offline.e2e.spec.ts`
- `apps/web/src/tests/integration/AppRuntimeStatus.integration.test.tsx`
- `scripts/check-pwa-offline-contract.mjs`

## Hallazgos

### Estrategia actual del service worker

- `service-worker.js` usa `CACHE_VERSION = "aquita-v1"` fijo.
- Define dos caches:
  - `aquita-v1-shell`
  - `aquita-v1-runtime`
- Precachea solo shell basico:
  - `/`
  - `/index.html`
  - `/offline.html`
  - `/manifest.webmanifest`
  - `/vite.svg`
- No precachea bundles hashados de Vite.
- Excluye requests `GET /api/*` del manejo del service worker.

### Navegacion offline actual

Para `request.mode === "navigate"`:

1. intenta `fetch(request)` en red;
2. si responde, guarda la navegacion en `runtime cache`;
3. si falla:
   - devuelve la navegacion cacheada si existe;
   - si no, intenta `/index.html`;
   - si no, devuelve `/offline.html`.

Esto equivale a una estrategia `network-first` para navegacion, con fallback a shell u offline page.

### Assets same-origin

Para assets same-origin `GET` no-API:

- primero intenta `caches.match(request)`;
- si no existe cache, usa red y luego guarda en `runtime cache`;
- si la red falla, intenta devolver `cached`.

En practica es un `cache-first` con refresh oportunista para assets ya vistos.

### Registro y actualizacion del SW

- El SW se registra desde `apps/web/src/main.tsx` a traves de `apps/web/src/lib/pwa.ts`.
- `registerPwaServiceWorker()` espera a `window.load` antes de registrar.
- Si hay worker en `waiting`, dispara evento `pwa:update-available`.
- Si el usuario aplica update, se envia `SKIP_WAITING`.
- En `controllerchange`, la app hace `window.location.reload()`.

### UI de runtime

`AppRuntimeStatus.tsx` muestra:

- banner offline:
  - "Sin conexion. Seguimos mostrando la ultima informacion util y podria estar desactualizada."
- banner online:
  - refetch de queries activas al volver la red
- banner update:
  - "Hay una nueva version disponible. Actualiza para evitar mezclar contenido viejo y nuevo."

## Riesgos de stale content

### 1. `service-worker.js` cacheado como immutable

En `apps/web/nginx.conf`:

- `index.html` usa `Cache-Control: no-cache, no-store, must-revalidate`
- pero `*.js` usa `Cache-Control: public, max-age=604800, immutable`

Eso incluye `service-worker.js`.

Riesgo:

- el navegador puede conservar un `service-worker.js` viejo durante dias;
- un deploy puede actualizar `index.html` y bundles, pero el cliente seguir usando reglas de cache del SW anterior;
- esto aumenta la probabilidad de mezclar shell viejo y comportamiento nuevo.

Nivel: Alto.

### 2. `CACHE_VERSION` fijo

`CACHE_VERSION = "aquita-v1"` no cambia por build ni release.

Riesgo:

- no hay invalidacion natural ligada al deploy;
- si se modifica la lista de assets o la estrategia del SW, clientes viejos pueden quedarse en caches previos si no entra una nueva activacion efectiva;
- dificulta razonar sobre limpieza deterministica de caches entre releases.

Nivel: Alto.

### 3. No precachear bundles Vite

El shell precacheado no incluye JS/CSS hashados del build.

Riesgo:

- una primera visita offline o un hard refresh offline puede tener `index.html` pero no los bundles necesarios para reconstruir la app;
- el test actual cubre navegacion offline despues de cargar la app, no arranque offline desde shell frio;
- el usuario puede recibir shell parcial, fallback o comportamiento inconsistente.

Nivel: Alto.

### 4. Navegacion offline con `index.html` stale

Si la red falla y no existe una respuesta de ruta cacheada, el SW devuelve `/index.html`.

Riesgo:

- ese HTML puede no corresponder con el set de bundles realmente disponibles en cache;
- puede servir una SPA vieja despues de un deploy;
- puede ocultar el problema real porque no cae a `offline.html` inmediatamente.

Nivel: Medio-Alto.

## Riesgos offline / online

### Exclusion de `/api/*`

El SW no cachea respuestas API.

Ventaja:

- evita persistir datos sensibles o stale por usuario/rol desde el SW;
- reduce riesgo de inconsistencias fuertes entre backend y cache browser.

Costo:

- el modo offline real es principalmente shell/UI;
- "ultima informacion util" depende de memoria del cliente y estado React, no de persistencia robusta.

Nivel: Medio.

### Offline privado por `AuthContext`

`AuthContext.tsx` tiene este comportamiento durante bootstrap:

- si hay token guardado y `refreshProfile()` falla, limpia sesion;
- si no hay token pero hay `session hint` y `authApi.refresh()` falla, limpia sesion.

Problema:

- fallos de red offline quedan tratados muy parecido a sesion invalida;
- una recarga offline en rutas privadas puede degradar a logout aunque la sesion fuese valida antes;
- esto no esta caracterizado por pruebas end-to-end hoy.

Nivel: Alto para rutas privadas.

### Reconexion online

Al volver la red:

- `AppRuntimeStatus` muestra banner de recuperacion;
- `queryClient.refetchQueries({ type: "active" })` intenta refrescar lo visible.

Esto ayuda a sanear stale UI, pero:

- no hay persistencia de React Query a storage;
- si la app no tenia datos activos o se reinicio offline, la recuperacion depende de un bootstrap correcto posterior.

Nivel: Medio.

## Cobertura actual de tests offline / PWA

### Cobertura existente

`playwright/specs/offline.e2e.spec.ts`

- valida que el SW este activo;
- valida banner offline;
- navega a `/businesses` offline despues de una carga online;
- valida banner online al reconectar.

`apps/web/src/tests/integration/AppRuntimeStatus.integration.test.tsx`

- valida banner offline;
- valida banner online y `refetchQueries({ type: "active" })`;
- valida evento `pwa:update-available` y boton `Actualizar`.

### Lo que SI queda cubierto hoy

- existencia de feedback visual offline/online;
- existencia de flujo UI para update disponible;
- navegacion offline basica en una sesion ya abierta;
- recuperacion visible tras reconexion.

## Fases 6.4 y 6.6: check manual y correccion minima de headers

| Item | Detalle |
| --- | --- |
| Check agregado | `scripts/check-pwa-offline-contract.mjs` |
| Comando | `node scripts/check-pwa-offline-contract.mjs` |
| Resultado actual | `exit 0`, report-only |
| Modo | Manual/report-only; no esta conectado a CI y no bloquea builds |

Cambio aplicado en Fase 6.6:

- `apps/web/nginx.conf` ahora incluye una `location = /service-worker.js` dedicada.
- `service-worker.js` deja de heredar la regla generica `*.js`.
- Header esperado para `service-worker.js`:
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `expires -1`

Resultado del check despues de Fase 6.6:

- desaparecio el finding `HIGH` de `service-worker.js` heredando `immutable`;
- la senal actual paso a `INFO`: `service-worker.js has a dedicated nginx location override`.

Findings restantes del check:

- `HIGH`: `CACHE_VERSION` fijo en `aquita-v1`.
- `HIGH`: `APP_SHELL_ASSETS` no incluye bundles Vite hashados.
- `INFO`: el service worker excluye `/api/*`.
- `MEDIUM`: el registro del service worker se difiere hasta `window.load`.

Senales positivas visibles del contrato actual:

- `index.html` mantiene `Cache-Control: no-cache, no-store, must-revalidate`.
- el registro del service worker se hace desde `apps/web/src/lib/pwa.ts`.
- el manifest mantiene `start_url: "/"` y `scope: "/"`.
- `service-worker.js` ahora tiene una override dedicada en `nginx.conf`.

QA ejecutado:

- `node scripts/check-pwa-offline-contract.mjs` -> pass.
- `pnpm qa:smoke` -> pass.

Warnings no bloqueantes observados en Fase 6.6:

- primer timeout local de `pnpm qa:smoke` antes del rerun exitoso;
- `Geoapify geocoding failed (HTTP 503)` en tests unitarios de API;
- warning de fin de linea `LF/CRLF` en `apps/web/nginx.conf`.

Limites deliberados del check:

- no valida comportamiento real del navegador offline;
- no valida hard refresh offline;
- no valida sesion privada offline;
- no valida update real con `waiting worker`;
- no valida cache real del hosting;
- no hace requests reales.

## Brechas de test

- No hay test de hard refresh offline en `/`.
- No hay test de hard refresh offline en `/businesses`.
- No hay test de primera visita offline sin bundles precacheados.
- No hay test de rutas privadas offline con sesion previa valida.
- No hay test de comportamiento de `AuthContext` ante error de red offline durante bootstrap.
- No hay test real de update de SW con dos versiones distintas.
- No hay check de headers/cache para:
  - `service-worker.js`
  - `manifest.webmanifest`
  - `index.html`
- No hay evidencia automatizada sobre si `offline.html` aparece solo como ultimo fallback o si el shell roto puede enmascarar errores.

## Que NO tocar todavia

- No tocar `apps/web/public/service-worker.js`.
- No tocar `apps/web/public/manifest.webmanifest`.
- No tocar `apps/web/public/offline.html`.
- No volver a tocar `apps/web/nginx.conf` en la misma linea de trabajo salvo que se abra una fase especifica para headers adicionales.
- No tocar `apps/web/src/context/AuthContext.tsx`.
- No corregir todavia `CACHE_VERSION`, headers `immutable`, precache de bundles ni timing de registro sin antes caracterizar hard refresh offline y offline privado.
- No mezclar esta capa con cambios de auth/session sync.
- No introducir Workbox ni persistencia de React Query en la misma fase.
- No cachear `/api/*` ni datos privados sin una fase dedicada de seguridad e invalidacion.

## Primera mejora segura recomendada

Antes de cambiar runtime, la mejora segura es caracterizar la capa actual con QA dirigido:

1. hard refresh offline en `/`;
2. hard refresh offline en `/businesses`;
3. recarga offline en ruta privada con sesion previa valida;
4. check de headers efectivos para `service-worker.js`, `index.html` y `manifest.webmanifest`;
5. flujo de update real con SW `waiting`.

La prioridad no es refactorizar el SW hoy, sino fijar con evidencia que parte del soporte offline funciona realmente y cual solo parece cubierta.

## Proxima fase recomendada

La siguiente fase segura es implementar caracterizacion, no cambiar runtime:

1. hard refresh offline en `/`;
2. hard refresh offline en `/businesses`;
3. offline privado con sesion valida para observar bootstrap de `AuthContext`;
4. si hace falta, un check adicional de headers efectivos en entorno servido para `manifest.webmanifest` u otros recursos PWA.

## Candidatos futuros para tests de caracterizacion

| Candidato | Tipo | Cobertura minima |
| --- | --- | --- |
| Hard refresh offline home | Playwright | Abrir `/` online, desconectar, refrescar y verificar si la app arranca o cae a `offline.html`. |
| Hard refresh offline businesses | Playwright | Abrir `/businesses` online, desconectar, refrescar y verificar shell util vs fallback roto. |
| Offline privado con sesion valida | Playwright | Entrar autenticado, desconectar y recargar `/app` o `/dashboard`; observar si `AuthContext` limpia sesion por error de red. |
| SW update real | Playwright/manual harness | Simular `waiting worker`, aplicar update y comprobar reload/control del nuevo worker. |
| Cache headers | Check manual/report-only | Verificar headers de `service-worker.js`, `index.html`, `manifest.webmanifest` en entorno real. |
| Offline fallback puro | Playwright | Forzar caso sin shell suficiente y confirmar que `offline.html` aparece como ultimo fallback. |
| Reconnect refresh | Integration/Playwright | Confirmar que el refetch tras reconexion reemplaza contenido stale visible. |

## Estado

La capa PWA/offline actual ofrece:

- instalacion y update basicos;
- shell offline parcial;
- feedback visual correcto;
- riesgo operativo real de contenido stale tras deploy, especialmente por `service-worker.js` servido como `immutable`, `CACHE_VERSION` fijo y ausencia de precache de bundles Vite;
- un check estatico manual/report-only que deja estos riesgos visibles sin tocar runtime ni bloquear CI.
