# Prompt #4 - Blindaje de Produccion

Este documento resume la capa SRE/Growth implementada para AquiTa.do y como operarla en nube.

## 1) Observabilidad 360

- `OpenTelemetry` inicializado en `apps/api/src/observability/telemetry.bootstrap.ts`.
- Trazas de entrada via `traceparent` y `x-trace-id` en `apps/api/src/main.ts`.
- Frontend envia contexto distribuido (`x-visitor-id`, `x-session-id`, `x-request-id`, `traceparent`) en `apps/web/src/api/client.ts`.
- Metricas Prometheus en `GET /api/observability/metrics`.
- Salud avanzada en `GET /api/health/dashboard`:
  - Estado DB + esquema.
  - Saturacion de pool de conexiones.
  - p95 y error-rate de dependencias AI y WhatsApp.

## 2) Seguridad Defensiva

- Rate limiting avanzado por IP y API key con Redis en `apps/api/src/security/advanced-rate-limit.guard.ts`.
- Politicas por endpoint:
  - `default`
  - `search`
  - `ai`
- CORS estricto configurable por variables:
  - `CORS_ALLOWED_METHODS`
  - `CORS_ALLOWED_HEADERS`
  - `CORS_EXPOSED_HEADERS`
- Hardening HTTP con `helmet` y `compression` en `apps/api/src/main.ts`.

## 3) Performance

- Estrategia SWR:
  - Header HTTP `Cache-Control: stale-while-revalidate` via interceptor global.
  - Cache de datos SWR en Redis via `rememberJsonStaleWhileRevalidate`.
- Endpoints publicos con cache decorada:
  - `/api/businesses`
  - `/api/businesses/nearby`
  - `/api/businesses/:id`
  - `/api/search/businesses`
- Pipeline de imagenes:
  - Generacion AVIF/WebP con `sharp` en `UploadsService`.
  - Fallback seguro cuando `sharp` no esta disponible.
  - Componente frontend `<OptimizedImage />` con `picture` y source negotiation.

## 4) Growth y Analytics

- Eventos internos de crecimiento en `GrowthEvent` (Prisma).
- Tracking de:
  - `SEARCH_QUERY`
  - `SEARCH_RESULT_CLICK`
  - `CONTACT_CLICK`
  - `WHATSAPP_CLICK`
  - `BOOKING_INTENT`
- Insights admin en `GET /api/analytics/growth/insights`:
  - categorias mas buscadas
  - brechas demanda/oferta por provincia y ciudad
  - conversion Search -> WhatsApp
  - comparativa A/B por `variantKey`
- A/B testing activo en CTA de contacto del detalle de negocio (`business_contact_button`).

## 5) Stack sugerido de Produccion

- Telemetria:
  - OpenTelemetry Collector
  - Prometheus + Grafana
  - Sentry (errores + traces)
- Logs:
  - Loki/Promtail o Datadog Logs
- Producto/Growth:
  - Eventos internos (Prisma) para insights de negocio
  - Mixpanel/Amplitude opcional para analitica de producto cross-platform

## 6) Guia de despliegue escalable

### Opcion AWS

- Runtime:
  - ECS Fargate para `api` y `web`
  - ALB con TLS (ACM)
- Datos:
  - RDS PostgreSQL (con extension PostGIS y pgvector)
  - ElastiCache Redis
  - Meilisearch gestionado en ECS o OpenSearch si se requiere escalado mayor
- Assets:
  - S3 + CloudFront (imagenes y estaticos)
- Operacion:
  - Secrets Manager / SSM Parameter Store
  - CloudWatch + OTEL Collector sidecar
  - AutoScaling por CPU/RPS/latencia

### Opcion Google Cloud

- Runtime:
  - Cloud Run o GKE para `api` y `web`
  - HTTPS Load Balancer
- Datos:
  - Cloud SQL PostgreSQL (PostGIS + pgvector)
  - Memorystore Redis
  - Meilisearch en GKE o Elasticsearch/OpenSearch administrado
- Assets:
  - Cloud Storage + Cloud CDN
- Operacion:
  - Secret Manager
  - Cloud Monitoring + OTEL Collector
  - Autoscaling por concurrencia y latencia p95

## 7) Variables clave de produccion

Definir al menos:

- Observabilidad:
  - `OTEL_ENABLED`
  - `OTEL_SERVICE_NAME`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `SENTRY_DSN`
  - `SENTRY_TRACES_SAMPLE_RATE`
- Seguridad:
  - `SECURITY_TRUST_PROXY`
  - `RATE_LIMIT_*`
  - `CORS_*`
- Salud:
  - `HEALTH_AI_P95_MAX_MS`
  - `HEALTH_WHATSAPP_P95_MAX_MS`
  - `HEALTH_DB_POOL_WARN_RATIO`
  - `HEALTH_DB_POOL_CRITICAL_RATIO`

