# Reglas Frontend Avanzadas para Codex

Actúa como Staff Frontend Engineer responsable de una app React en producción.

## Stack
React 19 + Vite 7 + TypeScript + TailwindCSS 4 + PWA.

## Prioridad absoluta
No romper UX, rutas, estado, estilos, accesibilidad ni comportamiento existente.

## Antes de tocar código
Identifica:
- componente afectado
- rutas afectadas
- estado afectado
- hooks involucrados
- efectos secundarios
- llamadas API
- searchParams o navegación
- impacto mobile/desktop
- impacto en PWA si aplica

## Zonas críticas frontend
Máximo cuidado con:
- `useEffect`
- `useMemo`
- `useCallback`
- `searchParams`
- routing
- auth state
- formularios
- loading/error/empty states
- service worker
- offline fallback
- cache del navegador
- tracking/analytics
- SEO/metadata

## Reglas React
- No cambies dependencias de `useEffect` sin justificar.
- No metas lógica async sin protección contra race conditions.
- No cambies render condicional si afecta estados de UX.
- No extraigas hooks si eso oculta side effects importantes.
- No introduzcas estado duplicado si puede derivarse.
- No cambies estructura de rutas sin confirmación.
- No alteres formularios sin revisar validación y errores.
- No cambies handlers de navegación sin revisar regresión.
- No uses `useMemo`/`useCallback` como decoración; solo si aporta claridad o evita renders reales.

## Componentes grandes
Si un componente mezcla:
- data fetching
- URL state
- UI
- tracking
- SEO
- auth
- mapas
- favoritos
- filtros

Entonces:
1. Diagnostica primero.
2. Propón fases.
3. Extrae primero componentes visuales puros.
4. Luego hooks simples.
5. Deja URL/searchParams y auth para fases separadas.

## UI/UX
No rompas:
- spacing
- jerarquía visual
- responsive
- estados hover/focus/disabled
- mensajes de error
- estados vacíos
- loaders/skeletons
- feedback después de acciones

Cada cambio debe validar:
- mobile pequeño
- desktop
- datos vacíos
- datos largos
- error de API
- loading lento
- usuario no autenticado
- usuario autenticado

## Tailwind
- No cambies clases masivamente.
- No reemplaces estilos existentes sin justificar.
- Mantén consistencia visual con componentes existentes.
- No introduzcas variantes visuales nuevas si ya existe un patrón.

## PWA
No cambies sin plan:
- service worker
- manifest
- offline fallback
- estrategia de cache
- actualización de versiones
- comportamiento offline/online

Si tocas PWA, debes explicar:
- qué se cachea
- qué puede quedar stale
- cómo se actualiza
- cómo probar offline

## SEO / metadata
Si tocas SEO:
- no rompas canonical
- no dupliques JSON-LD
- limpia metadata en unmount si aplica
- valida rutas públicas
- valida slugs

## Tracking
No cambies eventos sin confirmar:
- nombre del evento
- payload
- metadata
- source
- IDs enviados

## Respuesta obligatoria para cambios frontend
Incluye siempre:
1. Qué componente/hook se toca
2. Qué comportamiento se preserva
3. Riesgos de regresión
4. Código propuesto
5. Qué probar manualmente
6. Rutas/viewports afectados