# Plan De Remediación 14 Días - Estado Final

Fecha de cierre: 2026-03-02

## Resumen ejecutivo

Este documento consolida el estado de ejecución del plan P0-P2, la evidencia técnica y los KPIs de salida para el release candidate actual.

## Estado por día

### Día 1 (P0) - Routing SPA en Vercel
- Estado: completado
- Implementación:
  - `apps/web/vercel.json` con rewrite global a `/index.html`.
- Evidencia:
  - Rutas internas del frontend se resuelven por el router SPA sin 404 en hard refresh.

### Día 2 (P0) - Cierre de exposición de métricas
- Estado: completado
- Implementación:
  - `GET /api/observability/metrics` protegido por `JwtAuthGuard + RolesGuard + @Roles('ADMIN')`.
  - Archivo: `apps/api/src/observability/observability.controller.ts`.
- Evidencia:
  - E2E agregado: `apps/api/src/observability/observability.e2e.spec.ts` (401/403 sin privilegios, 200 con admin).

### Día 3 (P0) - Blindar tracking contra spoof
- Estado: completado
- Implementación:
  - `userId` ya no se acepta desde payload de cliente.
  - El `userId` se inyecta exclusivamente desde JWT (`@CurrentUser('id')`) en controladores de analytics.
  - Archivos:
    - `apps/api/src/analytics/analytics.controller.ts`
    - `apps/api/src/analytics/event-tracking.controller.ts`
    - `apps/api/src/analytics/dto/analytics.dto.ts`
- Evidencia:
  - E2E agregado: `apps/api/src/analytics/analytics-security.e2e.spec.ts`.

### Día 4 (P0) - Soft delete consistente
- Estado: completado
- Implementación:
  - Eliminación lógica con `deletedAt` para entidades críticas (negocios/promociones).
  - Listados públicos y consultas operativas excluyen soft-deleted.
  - Archivos:
    - `apps/api/src/businesses/businesses.service.ts`
    - `apps/api/src/promotions/promotions.service.ts`

### Día 5 (P1) - Storage cloud para imágenes
- Estado: completado
- Implementación:
  - `UploadsService` soporta `STORAGE_PROVIDER=local|s3`.
  - Soporte S3/R2 (AWS SDK) con fallback local.
  - Archivos:
    - `apps/api/src/uploads/uploads.service.ts`
    - `apps/api/src/config/env.validation.ts`
    - `apps/api/.env.example`

### Día 6 (P1) - Seguridad de sesión
- Estado: completado
- Implementación:
  - Refresh token migrado a cookie HttpOnly.
  - Rotación en refresh y limpieza en logout.
  - Frontend dejó de depender de refresh token en `localStorage`.
  - Archivos:
    - `apps/api/src/auth/auth.controller.ts`
    - `apps/api/src/auth/auth.service.ts`
    - `apps/api/src/auth/dto/auth.dto.ts`
    - `apps/web/src/api/client.ts`
    - `apps/web/src/api/endpoints.ts`
    - `apps/web/src/context/AuthContext.tsx`
- Evidencia:
  - E2E actualizado: `apps/api/src/auth/auth.e2e.spec.ts`.

### Día 7 (P1) - Headers defensivos
- Estado: completado
- Implementación:
  - Hardening con Helmet y CSP estricta en API.
  - HSTS/XFO/referrer policy configuradas según entorno.
  - Archivo: `apps/api/src/main.ts`.

### Día 8 (P1) - Higiene de errores y observabilidad
- Estado: completado
- Implementación:
  - Logging estructurado para errores `>=500` con `requestId/traceId`.
  - 4xx esperados no generan ruido crítico en observabilidad.
  - Archivo: `apps/api/src/core/filters/global-exception.filter.ts`.

### Día 9 (P1) - Validaciones de negocio duras
- Estado: completado
- Implementación:
  - DTOs y validaciones endurecidas (analytics/event tracking + inputs críticos).
  - Rate-limiting avanzado aplicado a endpoints expuestos.
  - Archivos:
    - `apps/api/src/analytics/dto/analytics.dto.ts`
    - `apps/api/src/security/advanced-rate-limit.guard.ts`

### Día 10 (P2) - SEO técnico base
- Estado: completado
- Implementación:
  - `robots.txt`, `sitemap.xml`, canonical y metadatos OG/Twitter.
  - Meta por ruta + metadata dinámica en detalle de negocio.
  - Archivos:
    - `apps/web/public/robots.txt`
    - `apps/web/public/sitemap.xml`
    - `apps/web/src/seo/meta.ts`
    - `apps/web/src/layouts/MainLayout.tsx`
    - `apps/web/src/pages/BusinessDetails.tsx`
    - `apps/web/index.html`

### Día 11 (P2) - URLs SEO por slug
- Estado: completado
- Implementación:
  - Frontend usa `/businesses/:slug`.
  - Backend soporta lookup por slug con fallback UUID.
  - Archivos:
    - `apps/web/src/routes/Router.tsx`
    - `apps/web/src/pages/BusinessDetails.tsx`
    - `apps/web/src/api/endpoints.ts`
    - `apps/api/src/businesses/businesses.controller.ts`

### Día 12 (P2) - Accesibilidad WCAG 2.1 A/AA base
- Estado: completado
- Implementación:
  - Mejoras de `label/htmlFor`, `aria-*`, foco visible y formularios clave.
  - Archivos:
    - `apps/web/src/index.css`
    - `apps/web/src/components/Navbar.tsx`
    - `apps/web/src/pages/Login.tsx`
    - `apps/web/src/pages/Register.tsx`
    - `apps/web/src/pages/RegisterBusiness.tsx`
    - `apps/web/src/pages/BusinessesList.tsx`
    - `apps/web/src/pages/Home.tsx`
    - `apps/web/src/pages/OrganizationSettings.tsx`

### Día 13 (P2) - Deuda técnica y performance
- Estado: completado
- Implementación:
  - `DashboardBusiness` quedó consolidado en la superficie activa del producto, eliminando tabs heredados que ya no estaban conectados al runtime.
  - Reducción de complejidad estructural y menor deuda visual/mantenibilidad en el dashboard de negocio.
  - Archivo activo:
    - `apps/web/src/pages/DashboardBusiness.tsx`

### Día 14 (Release hardening) - QA final + Go/No-Go
- Estado: completado
- Ejecución:
  - `pnpm --filter @aquita/web lint`
  - `pnpm --filter @aquita/web build`
  - `pnpm --filter @aquita/api lint`
  - `pnpm --filter @aquita/api build`
  - `pnpm --filter @aquita/api test:e2e`
- Resultado:
  - Checks técnicos en verde.
  - E2E backend en verde (36/36).

## KPIs de salida

- Rutas internas web con 200 en acceso directo: cumplido (rewrite SPA activo).
- `/api/observability/metrics` no público: cumplido.
- Sin spoof de `userId` en analytics: cumplido.
- Sin pérdida de imágenes tras redeploy: cumplido con storage S3/R2 (configurable por entorno).
- Sin hard delete en entidades críticas: cumplido (soft delete en negocios/promociones).
- Errores 4xx normales fuera de alertas críticas: cumplido.

## Riesgos residuales

- Si se despliega con `STORAGE_PROVIDER=local`, los uploads siguen siendo efímeros según proveedor.
  - Mitigación: producción con S3/R2 + `STORAGE_PUBLIC_BASE_URL`.
- Si Redis no está configurado, funciones avanzadas quedan en modo degradado controlado.
  - Mitigación: provisionar `REDIS_URL`.
