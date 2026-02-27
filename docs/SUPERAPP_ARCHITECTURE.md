# AquiTaDo SuperApp Blueprint (B2B2C)

## 1) Vision de Producto

AquiTaDo evoluciona de directorio a ecosistema local:

- B2C (usuarios): discovery inteligente, social proof, check-ins y recompensas.
- B2B (negocios): SaaS operativo diario (reservas, CRM, pagos, analitica, ads).
- B2B2C (plataforma): marketplace transaccional + orquestador omnicanal (WhatsApp).

## 2) Estado Actual vs Objetivo

### Estado actual (ya implementado)
- Monorepo `pnpm` con `apps/web` (React 19 + Vite + TS) y `apps/api` (NestJS + Prisma + Postgres).
- Multi-tenant por organizacion con roles globales y de organizacion.
- Modulos activos: auth, businesses, organizations, subscriptions, payments, promotions, bookings, analytics, messaging, crm, ads, verification, reputation.

### Objetivo de arquitectura
- Frontend SEO-first para dominio publico (Next.js App Router o Remix).
- Monolito modular DDD en backend (preparado para extraccion a microservicios).
- Capa de busqueda y cache dedicada (Meilisearch/Elasticsearch + Redis).
- Observabilidad, seguridad y resiliencia de nivel SaaS.

## 3) Arquitectura Objetivo (12-18 meses)

## 3.1 Frontend
- Public Web (SEO): Next.js (recomendado) con SSG/ISR para listados y landings.
- App SaaS autenticada: mantener React SPA inicialmente y migrar a Next.js por dominios funcionales.
- Estado remoto: TanStack Query (cache, retries, invalidation, optimistic updates).
- PWA estricta: manifest, offline fallback, cache strategies por tipo de recurso.

## 3.2 Backend (NestJS + DDD modular)
Bounded contexts recomendados:

- `identity-access`: auth, sesiones, JWT, MFA futura.
- `tenant-core`: organizations, miembros, roles, limites por plan.
- `business-profile`: negocios, catalogo, assets, verificacion.
- `discovery-search`: indexacion, ranking, filtros, geoconsulta.
- `booking-commerce`: reservas, promociones, checkout, transacciones.
- `payments-billing`: suscripciones, facturas, webhooks, payout model.
- `crm-engagement`: conversaciones, clientes, historial.
- `reputation-trust`: reviews, moderacion, score, insignias.
- `ads-growth`: campañas internas y wallet de pauta.
- `notifications-integrations`: WhatsApp, email, push, webhooks salientes.
- `analytics-insights`: eventos, dashboards, reportes.

Cada contexto con:
- `application/` (casos de uso), `domain/` (entidades/servicios), `infrastructure/` (persistencia/integraciones), `interfaces/` (controllers/dto).

## 3.3 Data Layer
- PostgreSQL como source of truth.
- PostGIS para proximidad y regiones:
  - columna `geom geography(Point, 4326)` en `businesses`.
  - indices `GIST` para consultas por radio/poligono.
- Materialized views para ranking y dashboards de alto trafico.
- Particionado por fecha para eventos/analytics.

## 3.4 Busqueda y cache
- Redis:
  - cache de queries publicas (TTL corto, invalidacion por eventos).
  - rate limiting distribuido.
  - locks y deduplicacion de jobs.
- Meilisearch/Elasticsearch:
  - index de `businesses`, `promotions`, `reviews_stats`.
  - typo tolerance, facetas, geofiltros, boosting por reputacion/conversion.

## 3.5 Infraestructura
- Docker listo para ECS/Kubernetes.
- Assets en S3 o Cloudflare R2 + CDN.
- Async jobs con cola (BullMQ/Redis) para indexacion, notificaciones y reportes.

## 4) NFRs

## 4.1 Seguridad
- JWT asimetrico (RS256/ES256), rotacion de llaves (JWKS interno).
- Cifrado de PII sensible en reposo (app-layer + KMS).
- Hardening OWASP Top 10: input validation, authz centralizada, CSRF strategy segun canal.
- Auditoria inmutable para acciones administrativas y de billing.

## 4.2 Resiliencia
- Circuit breaker + retries con backoff para Stripe/WhatsApp/email.
- Idempotencia obligatoria en pagos y webhooks.
- Outbox pattern para eventos criticos.

## 4.3 Observabilidad
- Logs estructurados JSON con `requestId/tenantId/userId`.
- Trazas distribuidas (OpenTelemetry).
- Metrics + alertas SLO:
  - API p95 < 300ms en rutas publicas cacheables.
  - error rate < 1%.
  - disponibilidad mensual >= 99.9%.

## 5) Modelo de Roles y Vistas

Roles globales:
- `USER`: consumo B2C (busqueda, reservas, mensajes, reviews, check-ins).
- `BUSINESS_OWNER`: operacion de negocio (SaaS completo en su tenant).
- `ADMIN`: gobierno de plataforma, moderacion y riesgos.

Regla de UX:
- Cada rol entra a una vista dedicada (`/app`) y solo ve funciones de su capacidad.
- Acceso por guard en frontend + enforcement en backend.

## 6) Roadmap de Ejecucion

### Fase 0 (ahora - 4 semanas)
- Separacion estricta de vistas por rol (frontend).
- Hardening de smoke tests E2E de flujos criticos.
- Baseline observabilidad (request-id + errores centralizados).

### Fase 1 (mes 2-3)
- TanStack Query en frontend actual.
- Redis para cache/rate-limit.
- Cola async para notificaciones y indexing.

### Fase 2 (mes 4-6)
- Search service (Meilisearch/Elasticsearch).
- WhatsApp Business API (notificaciones + plantillas).
- Check-ins y reputacion gamificada.

### Fase 3 (mes 7-9)
- Migracion SEO publica a Next.js/Remix.
- ISR/SSR y landing pages por provincia/categoria.
- PWA full para usuarios finales.

### Fase 4 (mes 10-12)
- Microservicio opcional de notificaciones o pagos si hay presion de escala.
- BI avanzado y monetizacion de data insights agregados.

## 7) Criterios de Aceptacion Tecnica
- TypeScript estricto en todo.
- Cobertura minima recomendada:
  - Unit >= 75% en dominios criticos.
  - E2E obligatorias: auth, booking, pago, verificacion, mensajeria.
- Cero endpoints sin contrato DTO/validacion.
- Zero trust multi-tenant: todo endpoint SaaS exige contexto organizacional.
