# AquiTaDo UI/UX Usage Guide

Guia operativa para crear nuevas pantallas sin romper el sistema definido en `docs/AquiTaDo_UI_UX_SYSTEM_BLUEPRINT.md`.

## 1. Layout base

- Usa `page-shell` para paginas publicas, discovery y vistas mixtas.
- Usa `app-page-inner` para superficies autenticadas dentro de `DashboardLayout` o `AdminLayout`.
- Usa `page-section` para bloques editoriales o cabeceras.
- Usa `results-toolbar` para barras de filtros o controles de listado.
- Usa `discovery-layout` para discovery con sidebar + resultados.

## 2. Densidad por contexto

- `density-cozy`: auth, legal, formularios simples.
- `density-medium`: discovery, detalle de negocio, perfil.
- `density-compact`: dashboard, admin, colas, billing, CRM.

No mezcles densidad comoda dentro de superficies operativas.

## 3. Cards oficiales

- `SummaryCard`: KPIs y metricas resumidas.
- `SectionCard`: modulos funcionales con titulo, descripcion y acciones.
- `card-filter`: filtros, selects, refinamiento.
- `card-list`: colas, historiales, conversaciones, reservas.
- `card-form`: alta, edicion, configuracion.
- `EmptyState`, `ErrorState`, `LoadingState`, `NoPermissionState`: estados UX obligatorios.

Si un bloque no entra en una de estas categorias, probablemente esta mezclando responsabilidades.

## 4. Shell autenticado

- La sidebar orienta; no compite con el contenido.
- El header superior solo resuelve identidad, contexto y accesos rapidos.
- Los cambios de workspace o tab deben sincronizarse con la URL usando `useSearchParams`.
- El contenido principal debe mostrar informacion util arriba, no heroes decorativos.

## 5. Discovery

- Separa cabecera, toolbar de filtros y resultados.
- Los filtros avanzados viven en sidebar o drawer, no mezclados con las cards de resultados.
- La vista mapa debe ser un modo alterno del mismo resultado, no otra experiencia paralela.
- Las tarjetas de negocio deben mantener CTA, metadata y estado bien separados.

## 6. Dashboard negocio

- Arriba: contexto del negocio activo, claim, verificacion, salud y quick actions.
- Centro: operacion diaria.
- Debajo: crecimiento, billing, organizacion.
- Usa `workspace-strip` para cambiar areas sin crear subnavegaciones ad hoc.

## 7. Admin

- Piensa en consola, no en landing.
- Prioriza tablas, colas, filtros y trazabilidad.
- Usa fondos sobrios y bloques compactos para health, observabilidad y moderacion.
- Las acciones batch y destructivas deben quedar aisladas y explicitas.

## 8. Responsive

- Desktop: sidebar visible y maximo 2-3 columnas utiles.
- Laptop: comprime sidebars y headers antes de apilar contenido.
- Tablet: sidebar colapsable, filtros en drawer, una columna principal.
- Mobile: prioriza tarea principal; no intentes replicar desktop comprimido.

## 9. Copy y estados

- El copy debe ser corto, especifico y orientado a tarea.
- No repitas el mismo estado en varios lugares.
- Cada modulo principal debe contemplar: `loading`, `empty`, `error`, `success`, `partial data`, `no permission`, `feature disabled`.

## 10. Checklist antes de cerrar una pantalla

- La ruta usa un contenedor explicito.
- La densidad corresponde al contexto.
- Cada card tiene un rol visual claro.
- La accion primaria es obvia y unica.
- Los filtros no compiten con el contenido.
- Mobile y tablet tienen prioridades reordenadas, no solo cajas apiladas.
- Los estados vacios y de error estan tratados.
