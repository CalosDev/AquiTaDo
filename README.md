# AquiTa.do - Directorio Inteligente de Negocios Locales

[![CI](https://github.com/CalosDev/AquiTaDo/actions/workflows/ci.yml/badge.svg)](https://github.com/CalosDev/AquiTaDo/actions/workflows/ci.yml)

Plataforma para descubrir negocios locales en Republica Dominicana.
Incluye frontend web, backend API y base de datos PostgreSQL en un monorepo con pnpm.

## Stack

- Frontend: React 19 + Vite 7 + TypeScript + TailwindCSS 4
- Backend: NestJS + TypeScript
- Base de datos: PostgreSQL + Prisma ORM
- Auth: JWT (Passport)
- Monorepo: pnpm workspaces
- Contenedores: Docker + Docker Compose

## Estructura

```text
aquita/
|-- apps/
|   |-- web/                # Frontend React
|   |-- api/                # Backend NestJS
|-- packages/
|   |-- types/              # Tipos compartidos
|   |-- config/             # Configuracion compartida
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
docker-compose up -d db
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
- `THROTTLE_TTL_MS=60000`
- `THROTTLE_LIMIT=120`

`apps/web/.env`:

- `VITE_API_URL=http://localhost:3000`

## Docker (stack completo)

Levantar DB + API + Web:

```bash
docker-compose up -d --build
```

Servicios en Docker:

- Web (nginx): http://localhost:8080 (default)
- API: http://localhost:3000 (default)
- PostgreSQL: localhost:5432 (default)

Si tienes puertos ocupados, puedes sobrescribirlos:

```bash
DB_PORT=55432 API_PORT=3100 WEB_PORT=8081 docker-compose up -d --build
```

Para ver logs:

```bash
docker-compose logs -f api web db
```

Para apagar servicios:

```bash
docker-compose down
```

## Endpoints API

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Registrar usuario |
| POST | /api/auth/login | No | Login |
| GET | /api/users/me | Si | Perfil del usuario |
| GET | /api/businesses | No | Listar negocios (filtros/paginacion) |
| GET | /api/businesses/:id | No | Detalle negocio |
| POST | /api/businesses | Si | Crear negocio |
| PUT | /api/businesses/:id | Si | Actualizar negocio |
| DELETE | /api/businesses/:id | Si | Eliminar negocio |
| GET | /api/businesses/nearby | No | Buscar negocios cercanos |
| PUT | /api/businesses/:id/verify | Admin | Aprobar negocio |
| GET | /api/categories | No | Listar categorias |
| GET | /api/categories/:id | No | Ver categoria |
| POST | /api/categories | Admin | Crear categoria |
| PUT | /api/categories/:id | Admin | Editar categoria |
| DELETE | /api/categories/:id | Admin | Eliminar categoria |
| GET | /api/provinces | No | Listar provincias |
| GET | /api/provinces/:id/cities | No | Ciudades por provincia |
| POST | /api/reviews | Si | Crear resena |
| POST | /api/upload/business-image | Si | Subir imagen negocio |
| DELETE | /api/upload/business-image/:imageId | Si | Eliminar imagen negocio |
| GET | /api/health | No | Liveness check |
| GET | /api/health/ready | No | Readiness check (DB) |

## Roles

- `USER`: Buscar negocios y publicar resenas
- `BUSINESS_OWNER`: Todo lo de USER + gestionar sus negocios
- `ADMIN`: Todo lo anterior + moderacion y categorias

## Scripts raiz

- `pnpm dev`: Ejecuta frontend + backend
- `pnpm dev:web`: Solo frontend
- `pnpm dev:api`: Solo backend
- `pnpm build`: Build de todo el monorepo
- `pnpm lint`: Lint de todo el monorepo
- `pnpm smoke:api`: Smoke de endpoints health
- `pnpm db:generate`: Prisma generate
- `pnpm db:migrate`: Prisma migrate dev
- `pnpm db:migrate:deploy`: Prisma migrate deploy
- `pnpm db:seed`: Seed inicial
