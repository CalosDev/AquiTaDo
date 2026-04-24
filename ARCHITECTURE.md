# Arquitectura del Proyecto

Este proyecto es un sistema full-stack en producción. Los cambios deben mantener estabilidad, contratos y consistencia entre capas.

## Stack

- Frontend: React + Vite + TypeScript + TailwindCSS
- Backend: NestJS + TypeScript
- Auth: JWT + Passport
- DB: PostgreSQL + Prisma + PostGIS
- Cache: Redis
- PWA: manifest + service worker + offline fallback
- Infra: Docker + Docker Compose
- Monorepo: pnpm workspaces

## Capas del sistema

### Frontend
Responsable de:
- UI
- UX
- rutas
- estado visual
- formularios
- estados loading/error/empty
- integración con API
- PWA

No debe contener lógica crítica de negocio que pertenezca al backend.

### Backend
Responsable de:
- reglas de negocio
- auth
- permisos
- validación
- contratos de API
- acceso a datos
- cache
- errores controlados

No debe filtrar detalles internos al frontend.

### Base de datos
Responsable de:
- persistencia
- relaciones
- integridad
- migraciones
- queries geoespaciales si aplica

Cambios en schema requieren análisis previo.

### Redis / Cache
Responsable de:
- mejorar rendimiento
- cachear lecturas seguras
- mantener coherencia con PostgreSQL

Toda mutación debe considerar invalidación de cache.

### PWA
Responsable de:
- instalación
- soporte offline
- fallback offline
- cache de assets

No modificar service worker sin plan de QA.

## Zonas críticas

Cambios en estas áreas requieren diagnóstico antes de código:

- auth
- permisos
- contratos de API
- Prisma schema
- migraciones
- cache Redis
- searchParams
- PWA/service worker
- Docker/env vars

## Reglas de integración

- El frontend no debe asumir shapes distintos a los contratos backend.
- El backend debe mantener respuestas consistentes.
- Redis nunca debe servir datos sensibles sin segmentación.
- Auth debe validarse tanto en frontend como en backend, pero la autoridad final es backend.
- Cambios en API deben revisar impacto en frontend.
- Cambios en DB deben revisar impacto en backend y cache.
- Cambios en PWA deben revisar riesgo de contenido stale.

## Prioridades

1. estabilidad
2. seguridad
3. integridad de datos
4. consistencia entre capas
5. mantenibilidad
6. performance
7. elegancia

## Cómo trabajar

Antes de cambios grandes:

1. Diagnóstico
2. Plan por fases
3. Cambio mínimo
4. QA de regresión

No hacer refactors globales sin necesidad.