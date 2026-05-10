# Dashboard Information Architecture Risk Map

Fase 18.2 documenta la arquitectura de informacion de los dashboards por rol. El objetivo es evitar mas retoques visuales aislados y ordenar cada panel segun el trabajo real del usuario.

Esta fase es solo documental. No modifica `DashboardBusiness`, `CustomerDashboard`, `AdminDashboard`, `DashboardLayout`, rutas, permisos, `searchParams`, API, backend, estilos runtime ni snapshots.

## Diagnostico

Los dashboards ya tienen baselines visuales y varios slices de compactacion. El problema restante no es principalmente color, borde o sombra. El problema es que cada rol recibe demasiados modulos visibles al mismo tiempo.

El producto debe sentirse menos como consola tecnica y mas como una herramienta que responde una pregunta simple:

| Rol | Pregunta principal |
| --- | --- |
| Cliente | Que quiero retomar o descubrir ahora? |
| Dueno de negocio | Que necesita mi negocio hoy? |
| Admin | Que cola o riesgo necesita accion ahora? |

## Estado actual por rol

### CustomerDashboard

Archivo principal: `apps/web/src/pages/CustomerDashboard.tsx`

Archivo profundo: `apps/web/src/pages/customer-dashboard/CustomerActivityWorkspace.tsx`

Responsabilidades visibles:

- Saludo, CTAs y metricas de favoritos/listas.
- Favoritos.
- Listas.
- Reservas.
- Check-ins.
- Inbox.
- Hilo seleccionado y respuesta.

Riesgo visual:

- La pantalla muestra demasiada actividad completa en una sola vista.
- `Explorar negocios` y `Ver directorio` compiten como acciones similares.
- Inbox y detalle de hilo viven dentro del mismo dashboard, lo que hace que la vista se sienta como modulo tecnico de mensajeria.
- Mobile se vuelve muy largo antes de llegar al final de la actividad.

Decision recomendada:

- Mantener arriba un bloque "Continuar" con una sola accion principal.
- Bajar favoritos/listas a resumen corto.
- Mover actividad profunda a una seccion secundaria o a una vista dedicada futura.
- No eliminar funciones: reducir presencia inicial.

### DashboardBusiness

Archivo principal: `apps/web/src/pages/DashboardBusiness.tsx`

Workspaces relacionados:

- `apps/web/src/pages/dashboard-business/VerificationWorkspace.tsx`
- `apps/web/src/pages/dashboard-business/OperationsWorkspace.tsx`
- `apps/web/src/pages/dashboard-business/GrowthWorkspace.tsx`
- `apps/web/src/pages/dashboard-business/BillingWorkspace.tsx`
- `apps/web/src/pages/dashboard-business/OrganizationWorkspace.tsx`

Responsabilidades visibles:

- Header del negocio activo.
- Metricas.
- Control del negocio.
- Documentos y sello.
- Selector de negocio.
- Resumen del negocio.
- Tabs de workspaces.
- Completar perfil.
- Revision y documentos.
- Workspaces lazy por area.

Riesgo visual:

- La misma informacion aparece en varias formas: control, verificacion, perfil, negocio activo y resumen del negocio.
- El usuario owner no ve con suficiente fuerza "la accion de hoy".
- La pantalla mezcla estado, diagnostico, navegacion y tareas.
- `searchParams` controla workspaces; cualquier redisenio que toque tabs o rutas puede romper navegacion profunda.

Decision recomendada:

- Definir un solo bloque principal de "Siguiente accion".
- Consolidar control/verificacion/perfil en un resumen compacto.
- Evitar repetir esos mismos tres estados en varias secciones.
- Mantener workspaces, `searchParams` y lazy modules intactos hasta una fase especifica.

### AdminDashboard

Archivo principal: `apps/web/src/pages/AdminDashboard.tsx`

Workspaces relacionados:

- `apps/web/src/pages/admin-dashboard/VerificationQueueSection.tsx`
- `apps/web/src/pages/admin-dashboard/GrowthInsightsPanel.tsx`
- `apps/web/src/pages/admin-dashboard/ObservabilityWorkspace.tsx`

Responsabilidades visibles:

- KPIs de plataforma.
- Tabs admin.
- Listado de negocios.
- Categorias.
- Catalogo, claims, sugerencias y duplicados.
- Verificacion y moderacion.
- Reportes.
- Observabilidad.
- Acciones administrativas sensibles.

Riesgo visual:

- Es la vista mas riesgosa: mezcla permisos, acciones destructivas, tablas, colas y multiples contratos de datos.
- Algunas zonas internas aun usan estilos antiguos (`card p-5`, grises variados, botones manuales).
- Las acciones viven muy cerca de datos densos.
- Mobile aun depende de tablas con scroll horizontal.

Decision recomendada:

- No seguir redisenando admin de forma amplia.
- Separar proximas fases por tab, no por dashboard completo.
- Para cada tab: primero baseline, luego reducir una superficie visual, luego QA.
- No tocar acciones destructivas sin caracterizacion y confirmacion explicita.

### DashboardLayout

Archivo: `apps/web/src/layouts/DashboardLayout.tsx`

Responsabilidades visibles:

- Topbar.
- Sidebar.
- Contexto activo.
- Navegacion por rol.
- Accion rapida.
- Logout.

Riesgo visual:

- El sidebar agrega contexto, descripcion, badges y accion rapida en todas las pantallas.
- En customer/admin, ese contexto puede duplicar el header del dashboard.
- La accion rapida puede repetir CTAs ya visibles en la pantalla.

Decision recomendada:

- No tocar layout global todavia.
- Si se toca, hacerlo despues de estabilizar dashboards por rol.
- Primero auditar duplicacion entre sidebar CTA y CTAs locales.

## Matriz de arquitectura objetivo

| Rol | Primer viewport deberia mostrar | Secundario | Debe bajar de peso |
| --- | --- | --- | --- |
| Cliente | Saludo, continuar actividad, explorar negocios | Favoritos/listas resumidos | Inbox completo, hilo, todas las reservas y check-ins |
| Dueno | Negocio activo, siguiente accion, salud del perfil | Workspaces por area | Repeticion de control/verificacion/perfil |
| Admin | Cola/riesgo operativo, filtros claros, accion segura | Tabs especializados | Reportes crudos, formularios densos, tablas completas en mobile |

## Duplicaciones detectadas

| Zona | Duplicacion | Riesgo |
| --- | --- | --- |
| Owner | Control/verificacion/perfil aparecen en header, bloques, resumen y cards finales | El usuario no sabe donde actuar |
| Owner | Documentos y sello vs Revision y documentos | Mensaje repetido con distinta jerarquia |
| Owner | Selector de negocio y chips de contexto | Exceso de contexto visible |
| Customer | Explorar negocios vs Ver directorio | Acciones similares con distinto peso |
| Customer | Panel principal + CustomerActivityWorkspace | Dos dashboards dentro de una pantalla |
| Customer | Inbox y hilo seleccionado en la misma vista | Sensacion de app tecnica de mensajeria |
| Admin | Tabs + tarjetas + tablas + formularios | Alta densidad operativa |
| Layout | Contexto activo + headers locales | Doble introduccion por pantalla |

## Principios para siguientes fases

1. Una pantalla, una intencion principal.
2. Una seccion, una funcion.
3. Un CTA principal por viewport.
4. No duplicar estados en formato distinto.
5. Los datos profundos deben vivir despues del resumen, no competir con el primer paso.
6. No quitar funciones sin fase de comportamiento; primero bajar peso visual o mover jerarquia.
7. No tocar `searchParams`, permisos, API ni workspaces lazy en fases visuales.

## Que NO tocar todavia

- `searchParams` de owner/admin.
- Rutas.
- Auth, roles, permisos, org context o `x-organization-id`.
- Endpoints, DTOs, response shapes o backend.
- Acciones destructivas admin.
- Formularios complejos.
- Workspaces lazy.
- `DashboardLayout` global sin fase propia.
- CSS global masivo.
- Eliminacion real de funciones.

## Proxima fase recomendada

Fase 18.3 debe ser solo diseno para el primer slice owner:

- Objetivo: reducir duplicacion entre `Control del negocio`, `Documentos y sello`, `Negocio activo`, `Resumen del negocio`, `Completa tu perfil` y `Revision y documentos`.
- Sin tocar `searchParams`.
- Sin tocar workspaces lazy.
- Sin tocar API.
- Sin cambiar rutas.
- Sin eliminar acciones.

La implementacion posterior debe limitarse a un solo archivo y un solo tipo de cambio visual/estructural.

## QA recomendado para futuras implementaciones

Para owner:

```powershell
pnpm --filter @aquita/web typecheck
node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "owner dashboard (desktop|mobile) baseline"
pnpm qa:smoke
```

Para customer:

```powershell
pnpm --filter @aquita/web typecheck
node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "customer dashboard (desktop|mobile) baseline"
pnpm qa:smoke
```

Para admin:

```powershell
pnpm --filter @aquita/web typecheck
node scripts/run-with-qa-stack.mjs -- pnpm exec playwright test playwright/specs/visual.spec.ts --grep "admin dashboard.*baseline"
pnpm qa:smoke
```
