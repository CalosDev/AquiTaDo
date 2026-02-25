# 🇩🇴 AquiTa.do — Directorio Inteligente de Negocios Locales

Plataforma de directorio de negocios locales en República Dominicana. Permite a usuarios buscar negocios, dejar reseñas, y a dueños de negocios registrar y gestionar sus establecimientos.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| Backend | NestJS + TypeScript |
| Base de Datos | PostgreSQL + Prisma ORM |
| Auth | JWT (Passport) |
| Monorepo | pnpm workspaces |
| Contenedores | Docker Compose |

## Estructura del Proyecto

```
aquita/
├── apps/
│   ├── web/           # Frontend React
│   └── api/           # Backend NestJS
├── packages/
│   ├── types/         # Interfaces TypeScript compartidas
│   └── config/        # Constantes y configuración compartida
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## Requisitos Previos

- **Node.js** 18+
- **pnpm** 8+ (`npm install -g pnpm`)
- **Docker** y Docker Compose (para PostgreSQL)

## Instalación Paso a Paso

### 1. Clonar e instalar dependencias

```bash
cd aquita
pnpm install
```

### 2. Iniciar PostgreSQL con Docker

```bash
docker-compose up -d db
```

Esto inicia PostgreSQL en `localhost:5432` con:
- Usuario: `aquita`
- Contraseña: `aquita123`
- Base de datos: `aquita_db`

### 3. Configurar variables de entorno

Los archivos `.env` ya están creados con valores por defecto:

- `apps/api/.env` — `DATABASE_URL`, `JWT_SECRET`, `PORT`
- `apps/web/.env` — `VITE_API_URL`

### 4. Generar cliente Prisma y ejecutar migraciones

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Ejecutar seed de datos

```bash
cd apps/api
npx ts-node prisma/seed.ts
```

Esto crea: admin (admin@aquita.do / admin12345), 15 categorías, 32 provincias, ciudades principales y 12 features.

### 6. Ejecutar la aplicación

```bash
# Desde la raíz del monorepo
pnpm dev
```

O por separado:

```bash
pnpm dev:api    # Backend en http://localhost:3000
pnpm dev:web    # Frontend en http://localhost:5173
```

## API REST Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /api/auth/register | ❌ | Registrar usuario |
| POST | /api/auth/login | ❌ | Login |
| GET | /api/users/me | ✅ | Perfil del usuario |
| GET | /api/businesses | ❌ | Listar negocios (con filtros) |
| GET | /api/businesses/:id | ❌ | Detalle de negocio |
| POST | /api/businesses | ✅ | Crear negocio |
| PUT | /api/businesses/:id | ✅ | Editar negocio |
| DELETE | /api/businesses/:id | ✅ | Eliminar negocio |
| GET | /api/businesses/nearby | ❌ | Negocios cercanos |
| PUT | /api/businesses/:id/verify | 🔒 ADMIN | Aprobar negocio |
| GET | /api/categories | ❌ | Listar categorías |
| GET | /api/provinces | ❌ | Listar provincias |
| GET | /api/provinces/:id/cities | ❌ | Ciudades por provincia |
| POST | /api/reviews | ✅ | Crear reseña |
| POST | /api/upload/business-image | ✅ | Subir imagen |
| GET | /api/health | ❌ | Liveness check |
| GET | /api/health/ready | ❌ | Readiness check (DB) |

## Roles de Usuario

| Rol | Permisos |
|-----|----------|
| `USER` | Buscar negocios, escribir reseñas |
| `BUSINESS_OWNER` | Todo de USER + gestionar sus negocios |
| `ADMIN` | Todo + aprobar negocios, gestionar categorías |

## Credenciales de Prueba

- **Admin**: `admin@aquita.do` / `admin12345`

## Geolocalización

Endpoint para buscar negocios cercanos usando la fórmula de Haversine:

```
GET /api/businesses/nearby?lat=18.48&lng=-69.90&radius=5
```

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `pnpm dev` | Inicia frontend y backend |
| `pnpm dev:web` | Solo frontend |
| `pnpm dev:api` | Solo backend |
| `pnpm build` | Build de producción |
| `pnpm smoke:api` | Smoke test de health/readiness |
| `pnpm db:migrate` | Ejecutar migraciones |
| `pnpm db:seed` | Seed de datos |

---

Hecho con ❤️ en República Dominicana
