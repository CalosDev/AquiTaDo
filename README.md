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
- Cache/Busqueda: Redis + PostgreSQL
- Observabilidad: Prometheus (`/api/observability/metrics`, solo Admin)
- Monorepo: pnpm workspaces
- Contenedores: Docker + Docker Compose

## Arquitectura SuperApp

La propuesta de escalado B2B2C (Discovery + SaaS + Marketplace) esta documentada en:

- `docs/SUPERAPP_ARCHITECTURE.md`
- `docs/MONOLITH_MODULAR_STRUCTURE.md`
- `docs/ROLE_ACCESS_MATRIX.md`
- `docs/DOMINICAN_PRODUCT_GUARDRAILS.md`
- `docs/OPERATIONS_SUPPORT_PLAYBOOK.md`

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

4. Generar cliente Prisma y preparar esquema local:

```bash
pnpm db:generate
pnpm db:migrate
```

Para entornos ya provisionados o despliegues sin cambios interactivos de esquema, usa `pnpm db:migrate:deploy`.

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
- `STORAGE_PROVIDER=local|s3` (en produccion usa `s3`, `local` es efimero)
- `STORAGE_S3_BUCKET=...` (requerido si `STORAGE_PROVIDER=s3`)
- `STORAGE_S3_REGION=us-east-1` (requerido si `STORAGE_PROVIDER=s3`)
- `STORAGE_S3_ENDPOINT=...` (opcional, para R2/MinIO/S3 compatible)
- `STORAGE_S3_ACCESS_KEY_ID=...` (opcional segun proveedor)
- `STORAGE_S3_SECRET_ACCESS_KEY=...` (opcional segun proveedor)
- `STORAGE_S3_FORCE_PATH_STYLE=false` (true para algunos S3 compatibles)
- `STORAGE_PUBLIC_BASE_URL=...` (opcional, recomendado para CDN/public bucket)
- `PORT=3000`
- `CORS_ORIGIN=http://localhost:5173`
- `SECURITY_TRUST_PROXY=true`
- `CORS_ALLOWED_METHODS=GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`
- `APP_PUBLIC_WEB_URL=http://localhost:5173`
- `THROTTLE_TTL_MS=60000`
- `THROTTLE_LIMIT=120`
- `RATE_LIMIT_SEARCH_IP_LIMIT=120`
- `REDIS_URL=redis://localhost:6379`
- `REDIS_CACHE_TTL_SECONDS=120`
- `BULLMQ_PREFIX=aquita`
- `BULLMQ_DEFAULT_ATTEMPTS=3`
- `EXTERNAL_DATA_CACHE_TTL_SECONDS=600`
- `EXTERNAL_DATA_TIMEOUT_MS=3500`
- `OPEN_METEO_BASE_URL=https://api.open-meteo.com`
- `FRANKFURTER_BASE_URL=https://api.frankfurter.app`
- `NAGER_BASE_URL=https://date.nager.at`
- `NOMINATIM_ENABLED=false` (opcional, fallback de geocoding cuando Geoapify no responda)
- `NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org`
- `NOMINATIM_USER_AGENT=AquiTaDo-Geocoder/1.0 (+https://aquitado.vercel.app)` (requerido por politica del proveedor)
- `NOMINATIM_EMAIL=` (opcional, recomendado para identificar contacto)
- `NOMINATIM_MIN_INTERVAL_MS=1100` (evita exceder limites de uso)
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_VERIFY_TOKEN=...` (requerido si `WHATSAPP_ENABLED=true`)
- `WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com`
- `WHATSAPP_API_VERSION=v20.0`
- `WHATSAPP_PHONE_NUMBER_ID=...` (requerido si `WHATSAPP_ENABLED=true`)
- `WHATSAPP_ACCESS_TOKEN=...` (requerido si `WHATSAPP_ENABLED=true`)
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`
- `CIRCUIT_BREAKER_COOLDOWN_MS=60000`
- `JSON_API_RESPONSE_ENABLED=false`
- `HEALTH_EMAIL_P95_MAX_MS=4000`
- `HEALTH_WHATSAPP_P95_MAX_MS=3000`
- `HEALTH_DB_POOL_WARN_RATIO=0.75`
- `HEALTH_DB_POOL_CRITICAL_RATIO=0.9`
- `HEALTH_DEPENDENCY_CRITICAL_MIN_SAMPLES=3`
- `HEALTH_EMAIL_CRITICAL=false`
- `HEALTH_WHATSAPP_CRITICAL=false`

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
- Se incluye `redis` (cache distribuido).
- La base de datos usa imagen PostGIS para consultas geoespaciales nativas.

Servicios en Docker:

- Web (nginx): http://localhost:8080 (default)
- API: http://localhost:3000 (default)
- PostgreSQL: localhost:5432 (default)

Si tienes puertos ocupados, puedes sobrescribirlos:

```bash
DB_PORT=55432 API_PORT=3100 WEB_PORT=8081 docker compose up -d --build
```

Para ver logs:

```bash
docker compose logs -f api web db redis
```

Para apagar servicios:

```bash
docker compose down
```

## Pruebas

- `pnpm test`: ejecuta pruebas unitarias/funcionales estables del monorepo (sin E2E que dependen de DB real).
- `pnpm test:unit`: alias explicito de pruebas unitarias.
- `pnpm test:e2e:api`: ejecuta E2E del backend (`apps/api`) y requiere PostgreSQL accesible + migraciones aplicadas.
- `pnpm db:status`: valida si el esquema local ya esta alineado con todas las migraciones de Prisma.
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
4. Aplica esquema: `pnpm db:migrate:deploy`.
5. Ejecuta: `pnpm test:e2e:api` (el runner vuelve a validar conectividad y ejecuta `prisma migrate deploy` antes de correr Vitest).

Arranque de produccion del API:

- `pnpm --filter @aquita/api start:prod` ahora intenta `prisma migrate deploy` automaticamente cuando el runtime tiene `DATABASE_URL`, `prisma/schema.prisma` y Prisma CLI disponibles.
- Si el runtime no trae Prisma CLI o el schema de Prisma (por ejemplo, una imagen ya separada con job `migrate` dedicado), el bootstrap lo detecta y continua sin romper el proceso.
- Puedes desactivar ese intento con `PRISMA_MIGRATE_ON_START=false`.

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
- `pnpm smoke:saas`: Smoke end-to-end local con matriz real de roles (`USER`, `BUSINESS_OWNER`, `ADMIN`)
- `pnpm smoke:prod`: Smoke de produccion (publico + roles opcionales por credenciales)
- `pnpm db:generate`: Prisma generate
- `pnpm db:migrate`: Prisma migrate dev (flujo local interactivo)
- `pnpm db:migrate:deploy`: Prisma migrate deploy
- `pnpm db:status`: Estado actual de migraciones aplicadas
- `pnpm db:seed`: Seed inicial


Smoke SaaS local por roles:

```powershell
# Requiere API local activa en http://localhost:3000
# Si usas el stack docker + seed local, el admin seeded se resuelve automaticamente
$env:SAAS_SMOKE_API_BASE_URL="http://localhost:3000"
pnpm smoke:saas
```

Variables opcionales para smoke SaaS:

- `SAAS_SMOKE_API_BASE_URL`: base URL del API local o de staging.
- `SAAS_SMOKE_ADMIN_EMAIL` / `SAAS_SMOKE_ADMIN_PASSWORD`: admin explicito para flujos de verificacion, moderacion y observabilidad. Si el API es `localhost`, el script usa por defecto `admin@aquita.do` / `admin12345` del seed local.
- `SAAS_SMOKE_VERIFICATION_FILE_URL`: habilita la subida de documento KYC dentro del smoke.

Ejemplo smoke en produccion (PowerShell):

```powershell
$env:SMOKE_PROD_API_BASE_URL="https://aquitado.onrender.com"
$env:SMOKE_PROD_WEB_BASE_URL="https://aquitado.vercel.app"
$env:SMOKE_PROD_SKIP_CHECKINS="1"   # usar "0" cuando migracion check-ins este aplicada
$env:SMOKE_PROD_MUTATE_USER="1"     # toggle favorito + crear/eliminar lista temporal
$env:SMOKE_PROD_MUTATE_OWNER="1"    # PATCH no-op de organizacion del owner
$env:SMOKE_PROD_USER_EMAIL="user@example.com"
$env:SMOKE_PROD_USER_PASSWORD="..."
$env:SMOKE_PROD_OWNER_EMAIL="owner@example.com"
$env:SMOKE_PROD_OWNER_PASSWORD="..."
$env:SMOKE_PROD_ADMIN_EMAIL="admin@example.com"
$env:SMOKE_PROD_ADMIN_PASSWORD="..."
pnpm smoke:prod
```

Variables soportadas por `pnpm smoke:prod`:

- `SMOKE_PROD_API_BASE_URL`: API productiva o de staging.
- `SMOKE_PROD_WEB_BASE_URL`: frontend productivo o de staging.
- `SMOKE_PROD_SKIP_CHECKINS=1`: omite la validacion publica de check-ins si el entorno aun no la tiene lista.
- `SMOKE_PROD_SKIP_WEB=1`: omite las rutas web cuando solo quieres validar API.
- `SMOKE_PROD_MUTATE_USER=1`: activa mutaciones reversibles del actor `USER` (`toggle` de favorito y ciclo crear/agregar/eliminar lista).
- `SMOKE_PROD_MUTATE_OWNER=1`: activa un `PATCH` no-op sobre la organizacion del `BUSINESS_OWNER` para validar permisos de escritura sin cambiar datos visibles.
- `SMOKE_PROD_CHECKIN_CREATE=1`: habilita un `POST /api/checkins` real en el actor `USER`.
- `SMOKE_PROD_OWNER_PROMOTION_CREATE=1`: activa un ciclo reversible crear/eliminar promocion draft para `BUSINESS_OWNER`. Requiere tenant con suscripcion compatible.
- `SMOKE_PROD_USER_EMAIL` / `SMOKE_PROD_USER_PASSWORD`: smoke autenticado de cliente final.
- `SMOKE_PROD_OWNER_EMAIL` / `SMOKE_PROD_OWNER_PASSWORD`: smoke autenticado de propietario de negocio.
- `SMOKE_PROD_OWNER_ORGANIZATION_ID`: fuerza el tenant a usar para endpoints con `x-organization-id`.
- `SMOKE_PROD_ADMIN_EMAIL` / `SMOKE_PROD_ADMIN_PASSWORD`: smoke autenticado del panel admin y observabilidad.

Alertas operativas de produccion:

```powershell
$env:SMOKE_PROD_API_BASE_URL="https://aquitado.onrender.com"
$env:SMOKE_PROD_ADMIN_EMAIL="admin@example.com"
$env:SMOKE_PROD_ADMIN_PASSWORD="..."
pnpm alerts:prod
```

Variables soportadas por `pnpm alerts:prod`:

- `SMOKE_PROD_API_BASE_URL`: API productiva o de staging.
- `SMOKE_PROD_ADMIN_EMAIL` / `SMOKE_PROD_ADMIN_PASSWORD`: admin para consultar dashboard operacional y resumen frontend.
- `SMOKE_PROD_ALERT_CLIENT_ERRORS_WARN`: umbral de advertencia para errores cliente acumulados. Default `5`.
- `SMOKE_PROD_ALERT_POOR_VITALS_WARN`: umbral de advertencia para web vitals no saludables acumulados. Default `5`.
- `SMOKE_PROD_ALERT_FAIL_ON_WARN=1`: hace fallar el script tambien cuando solo hay `warn`, no solo `critical`.
- `SMOKE_PROD_REQUIRE_EMAIL=1`: trata email transaccional sin configurar como un error critico en vez de advertencia.

Notas operativas para `GET /api/health/dashboard`:

- `HEALTH_EMAIL_CRITICAL` y `HEALTH_WHATSAPP_CRITICAL` controlan si una dependencia externa puede bajar el estado global a `down`.
- Por defecto esas dependencias quedan como senales operativas visibles, pero no tiran el servicio completo a `down` a menos que se marque explicitamente.
