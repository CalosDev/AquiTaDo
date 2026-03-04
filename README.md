# AquiTa.do - Directorio Inteligente de Negocios Locales

[![CI](https://github.com/CalosDev/AquiTaDo/actions/workflows/ci.yml/badge.svg)](https://github.com/CalosDev/AquiTaDo/actions/workflows/ci.yml)

Plataforma para descubrir negocios locales en Republica Dominicana.
Incluye frontend web, backend API y base de datos PostgreSQL en un monorepo con pnpm.

## Stack

- Frontend: React 19 + Vite 7 + TypeScript + TailwindCSS 4
- PWA: manifest + service worker + offline fallback
- Backend: NestJS + TypeScript
- Base de datos: PostgreSQL + Prisma ORM + PostGIS
- Auth: JWT (Passport)
- Cache/Busqueda: Redis + Meilisearch (fallback a PostgreSQL)
- Observabilidad: Prometheus (`/api/observability/metrics`, solo Admin)
- Monorepo: pnpm workspaces
- Contenedores: Docker + Docker Compose

## Arquitectura SuperApp

La propuesta de escalado B2B2C (Discovery + SaaS + Marketplace) esta documentada en:

- `docs/SUPERAPP_ARCHITECTURE.md`
- `docs/MONOLITH_MODULAR_STRUCTURE.md`
- `docs/PRODUCTION_BLINDAJE_PROMPT4.md`
- `docs/ROLE_ACCESS_MATRIX.md`
- `docs/DOMINICAN_PRODUCT_GUARDRAILS.md`
- `docs/PROJECT_PRESENTATION_RD.md`

## Estructura

```text
aquita/
|-- apps/
|   |-- web/                # Frontend React
|   |-- api/                # Backend NestJS
|-- docker-compose.yml
|-- pnpm-workspace.yaml
|-- package.json
```

## Requisitos

- Node.js 18+
- pnpm 8+
- Docker y Docker Compose

## Inicio rapido local

1. Instalar dependencias:

```bash
pnpm install
```

2. Crear archivos de entorno:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

En PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

3. Levantar PostgreSQL:

```bash
docker compose up -d db
```

4. Generar cliente Prisma y migrar:

```bash
pnpm db:generate
pnpm db:migrate
```

5. (Opcional) Seed de datos iniciales:

```bash
pnpm db:seed
```

6. Ejecutar frontend + backend:

```bash
pnpm dev
```

Servicios:

- Web: http://localhost:5173
- API: http://localhost:3000
- Health: http://localhost:3000/api/health

## Entorno

`apps/api/.env`:

- `DATABASE_URL=postgresql://aquita:aquita123@localhost:5432/aquita_db`
- `JWT_SECRET=change-this-secret-minimum-16-chars`
- `PORT=3000`
- `CORS_ORIGIN=http://localhost:5173`
- `SECURITY_TRUST_PROXY=true`
- `CORS_ALLOWED_METHODS=GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`
- `APP_PUBLIC_WEB_URL=http://localhost:5173`
- `THROTTLE_TTL_MS=60000`
- `THROTTLE_LIMIT=120`
- `RATE_LIMIT_SEARCH_IP_LIMIT=120`
- `RATE_LIMIT_AI_IP_LIMIT=30`
- `REDIS_URL=redis://localhost:6379`
- `REDIS_CACHE_TTL_SECONDS=120`
- `BULLMQ_PREFIX=aquita`
- `BULLMQ_DEFAULT_ATTEMPTS=3`
- `MEILISEARCH_HOST=http://localhost:7700`
- `MEILISEARCH_API_KEY=masterKeyChangeMe`
- `MEILISEARCH_INDEX_BUSINESSES=businesses`
- `AI_PROVIDER=auto` (`auto|openai|gemini|local`)
- `AI_EMBEDDING_DIMENSIONS=1536` (mantener en 1536 por compatibilidad pgvector actual)
- `OPENAI_API_KEY=...` (opcional, habilita embeddings y respuestas IA enriquecidas)
- `OPENAI_BASE_URL=...` (opcional, para proveedor OpenAI-compatible custom)
- `OPENAI_MODEL_EMBEDDING=text-embedding-3-small`
- `OPENAI_MODEL_CHAT=gpt-4o-mini`
- `GEMINI_API_KEY=...` (opcional, recomendado para plan gratis inicial)
- `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`
- `GEMINI_MODEL_EMBEDDING=gemini-embedding-001`
- `GEMINI_MODEL_CHAT=gemini-2.0-flash`
- `GROQ_API_KEY=...` (opcional, fallback automatico de chat cuando Gemini/OpenAI fallen por cuota)
- `GROQ_BASE_URL=https://api.groq.com/openai/v1`
- `GROQ_MODEL_CHAT=llama-3.3-70b-versatile`
- `OPENAI_EMBEDDING_DIMENSIONS=1536` (legacy alias)
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_VERIFY_TOKEN=...` (requerido si `WHATSAPP_ENABLED=true`)
- `WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com`
- `WHATSAPP_API_VERSION=v20.0`
- `WHATSAPP_PHONE_NUMBER_ID=...` (requerido si `WHATSAPP_ENABLED=true`)
- `WHATSAPP_ACCESS_TOKEN=...` (requerido si `WHATSAPP_ENABLED=true`)
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`
- `CIRCUIT_BREAKER_COOLDOWN_MS=60000`
- `JSON_API_RESPONSE_ENABLED=false`
- `SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0`
- `SENTRY_ENVIRONMENT=development`
- `SENTRY_TRACES_SAMPLE_RATE=0`
- `OTEL_ENABLED=false`
- `OTEL_SERVICE_NAME=aquita-api`
- `OTEL_EXPORTER_OTLP_ENDPOINT=...` (opcional)
- `HEALTH_AI_P95_MAX_MS=2500`
- `HEALTH_DB_POOL_WARN_RATIO=0.75`

`apps/web/.env`:

- `VITE_API_URL=http://localhost:3000`
- `VITE_API_TIMEOUT_MS=30000` (opcional, default 30000ms)

Nota PWA:
- La app registra `service-worker.js` automaticamente y expone `manifest.webmanifest`.
- En navegadores compatibles se habilita boton "Instalar app".

## Docker (stack completo)

Levantar DB + API + Web:

```bash
docker compose up -d --build
```

Nota:
- El servicio `migrate` ejecuta `prisma migrate deploy` automaticamente antes de levantar la API.
- El servicio `seed` ejecuta `prisma seed` para cargar datos base (planes/categorias/provincias/features).
- La salud de la API ahora se valida con `/api/health/ready` (DB + esquema).
- Se incluyen `redis` (cache distribuido) y `meilisearch` (busqueda full-text).
- La base de datos usa imagen PostGIS para consultas geoespaciales nativas.

Servicios en Docker:

- Web (nginx): http://localhost:8080 (default)
- API: http://localhost:3000 (default)
- PostgreSQL: localhost:5432 (default)
- Meilisearch: http://localhost:7700 (default)

Si tienes puertos ocupados, puedes sobrescribirlos:

```bash
DB_PORT=55432 API_PORT=3100 WEB_PORT=8081 docker compose up -d --build
```

Para ver logs:

```bash
docker compose logs -f api web db redis meilisearch
```

Para apagar servicios:

```bash
docker compose down
```

## Pruebas

- `pnpm test`: ejecuta pruebas unitarias/funcionales estables del monorepo (sin E2E que dependen de DB real).
- `pnpm test:unit`: alias explicito de pruebas unitarias.
- `pnpm test:e2e:api`: ejecuta E2E del backend (`apps/api`) y requiere PostgreSQL accesible + migraciones aplicadas.
- `pnpm perf:prod`: benchmark de latencia (Web + API) con reporte en consola y JSON opcional.
- `pnpm keepwarm:prod`: ejecuta pings livianos para evitar cold starts prolongados en produccion.

Mitigacion de cold start en produccion:
- Se incluye workflow programado `.github/workflows/keep-warm.yml` (cada 10 minutos).
- Variables opcionales del repo:
  - `KEEPWARM_API_BASE_URL` (default `https://aquitado.onrender.com`)
  - `KEEPWARM_WEB_BASE_URL` (default `https://aquitado.vercel.app`)

Para E2E de API:

1. Asegura `DATABASE_URL` valido en `apps/api/.env`.
2. Opcional recomendado: define `DATABASE_URL_E2E` para apuntar a una base de datos separada de pruebas.
3. Levanta PostgreSQL (por ejemplo `docker compose up -d db`).
4. Aplica esquema: `pnpm db:migrate`.
5. Ejecuta: `pnpm test:e2e:api`.

## Endpoints API

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Registrar usuario |
| POST | /api/auth/login | No | Login |
| GET | /api/users/me | Si | Perfil del usuario |
| GET | /api/businesses | No | Listar negocios (filtros/paginacion) |
| GET | /api/businesses/my | Si | Listar negocios de la organizacion activa |
| GET | /api/businesses/:id | No | Detalle negocio |
| POST | /api/businesses | Si (BUSINESS_OWNER) | Crear negocio |
| PUT | /api/businesses/:id | Si | Actualizar negocio |
| DELETE | /api/businesses/:id | Si | Eliminar negocio |
| GET | /api/businesses/nearby | No | Buscar negocios cercanos |
| GET | /api/discovery/businesses/nearby | No | Discovery geoespacial con PostGIS |
| GET | /api/search/businesses | No | Busqueda full-text con filtros |
| POST | /api/search/businesses/reindex | Admin | Reindexar documentos de negocios |
| PUT | /api/businesses/:id/verify | Admin | Aprobar negocio |
| GET | /api/categories | No | Listar categorias |
| GET | /api/categories/:id | No | Ver categoria |
| POST | /api/categories | Admin | Crear categoria |
| PUT | /api/categories/:id | Admin | Editar categoria |
| DELETE | /api/categories/:id | Admin | Eliminar categoria |
| GET | /api/features | No | Listar features |
| GET | /api/provinces | No | Listar provincias |
| GET | /api/provinces/:id/cities | No | Ciudades por provincia |
| POST | /api/reviews | Si | Crear resena |
| POST | /api/ai/concierge/query | No | Busqueda conversacional RAG |
| PATCH | /api/ai/businesses/:businessId/assistant-config | Si (OWNER/MANAGER) | Configurar auto-respondedor IA |
| POST | /api/ai/businesses/:businessId/reindex | Si (OWNER/MANAGER) | Reindexar embedding semantico |
| POST | /api/ai/businesses/:businessId/auto-reply | Si (OWNER/MANAGER/STAFF) | Probar respuesta IA del negocio |
| POST | /api/ai/reviews/:reviewId/analyze | Si (OWNER/MANAGER/STAFF) | Analizar sentimiento de resena |
| GET | /api/whatsapp/webhook | No | Verificacion webhook Meta |
| POST | /api/whatsapp/webhook | No | Recepcion de mensajes WhatsApp |
| POST | /api/whatsapp/click-to-chat | Opcional | Generar link WhatsApp y registrar conversion |
| GET | /api/whatsapp/conversations/my | Si | Listar conversaciones del tenant |
| PATCH | /api/whatsapp/conversations/my/:id/status | Si (OWNER/MANAGER) | Cambiar estado de conversacion |
| POST | /api/upload/business-image | Si | Subir imagen negocio |
| DELETE | /api/upload/business-image/:imageId | Si | Eliminar imagen negocio |
| POST | /api/organizations | Si (BUSINESS_OWNER) | Crear organizacion |
| GET | /api/organizations/mine | Si | Organizaciones del usuario |
| GET | /api/organizations/:id | Si | Detalle de organizacion |
| PATCH | /api/organizations/:id | Si | Actualizar organizacion |
| GET | /api/organizations/:id/members | Si | Listar miembros |
| PATCH | /api/organizations/:id/members/:userId/role | Si | Actualizar rol de miembro |
| DELETE | /api/organizations/:id/members/:userId | Si | Remover miembro |
| GET | /api/organizations/:id/invites | Si | Listar invitaciones pendientes |
| POST | /api/organizations/:id/invites | Si | Crear invitacion de miembro |
| POST | /api/organizations/invites/:token/accept | Si | Aceptar invitacion |
| GET | /api/organizations/:id/subscription | Si | Ver plan y estado de suscripcion |
| PATCH | /api/organizations/:id/subscription | Si (OWNER) | Cambiar plan/estado de suscripcion |
| GET | /api/organizations/:id/usage | Si | Ver uso y limites del plan |
| GET | /api/organizations/:id/audit-logs | Si | Ver actividad auditada de la organizacion |
| POST | /api/events/business (alias: /api/telemetry/business) | Opcional | Registrar evento de negocio (views/clicks/conversiones) |
| POST | /api/events/growth (alias: /api/telemetry/growth) | Opcional | Registrar evento de growth (search/click/whatsapp) |
| GET | /api/analytics/growth/insights | Admin | Insights de demanda/oferta y conversion |
| GET | /api/health | No | Liveness check |
| GET | /api/health/ready | No | Readiness check (DB) |
| GET | /api/health/dashboard | No | Salud operativa avanzada (latencia + saturacion) |
| GET | /api/observability/metrics | Admin | Metricas Prometheus |

Notas multi-tenant:
- Para endpoints de operacion por tenant (`/api/businesses/my`, `POST/PUT/DELETE /api/businesses/*`, uploads) enviar `x-organization-id`.
- El frontend lo envia automaticamente usando la organizacion activa.

## SaaS Multi-tenant (estado actual)

Planes disponibles por organizacion:
- `FREE`: hasta `1` negocio y `3` asientos (miembros + invitaciones pendientes).
- `GROWTH`: hasta `5` negocios y `15` asientos.
- `SCALE`: sin limite de negocios ni asientos.

Reglas aplicadas:
- Si una organizacion supera limite de plan, no puede crear mas negocios/invitaciones.
- Si la suscripcion esta `CANCELED`, se bloquean nuevas operaciones de crecimiento.
- Todas las operaciones clave de organizacion quedan en `audit_logs`.

## Roles

- `USER` (consumo B2C): buscar negocios, ver detalle, reservar, mensajeria y resenas.
- `BUSINESS_OWNER` (operacion SaaS por tenant): crear/gestionar negocios, promociones, inbox, CRM, facturacion y organizacion.
- `ADMIN` (gobierno de plataforma): moderacion global, verificacion/KYC, categorias, reportes globales y observabilidad.

Separacion aplicada:
- `USER` no puede crear negocios ni administrar organizaciones.
- `BUSINESS_OWNER` no puede acceder al panel admin global.
- `ADMIN` no opera organizaciones/negocios por flujos tenant (`x-organization-id`).

## Scripts raiz

- `pnpm dev`: Ejecuta frontend + backend
- `pnpm dev:web`: Solo frontend
- `pnpm dev:api`: Solo backend
- `pnpm build`: Build de todo el monorepo
- `pnpm lint`: Lint de todo el monorepo
- `pnpm smoke:api`: Smoke de endpoints health
- `pnpm smoke:full`: Smoke integral (API + datos base + marketplace publico + health web)
- `pnpm smoke:saas`: Smoke end-to-end de flujos SaaS y marketplace
- `pnpm smoke:prod`: Smoke de produccion (health + catalogo + IA concierge + check-ins + rutas web)
- `pnpm ai:reindex:embeddings`: Reindex masivo de embeddings IA para negocios verificados
- `pnpm db:generate`: Prisma generate
- `pnpm db:migrate`: Prisma migrate dev
- `pnpm db:migrate:deploy`: Prisma migrate deploy
- `pnpm db:seed`: Seed inicial

Reindex IA (Gemini/OpenAI) con filtros opcionales:

```bash
# Reindex de todos los negocios verificados (requiere AI_PROVIDER activo y API key)
pnpm ai:reindex:embeddings

# Reindex de una organizacion especifica
AI_REINDEX_ORGANIZATION_ID=org_uuid pnpm ai:reindex:embeddings

# Reindex limitado
AI_REINDEX_LIMIT=100 pnpm ai:reindex:embeddings
```

Ejemplo smoke en produccion (PowerShell):

```powershell
$env:SMOKE_PROD_API_BASE_URL="https://aquitado.onrender.com"
$env:SMOKE_PROD_WEB_BASE_URL="https://aquitado.vercel.app"
$env:SMOKE_PROD_SKIP_CHECKINS="1"   # usar "0" cuando migracion check-ins este aplicada
pnpm smoke:prod
```
