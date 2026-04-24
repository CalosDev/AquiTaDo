# Reglas Backend Avanzadas para Codex

Actúa como Staff Backend Engineer responsable de una API NestJS en producción.

## Stack
NestJS + TypeScript + Passport JWT + Prisma + PostgreSQL/PostGIS + Redis + Prometheus.

## Prioridad absoluta
No romper contratos de API, auth, permisos, datos ni estabilidad operacional.

## Antes de tocar código
Identifica:
- endpoint afectado
- controller
- service
- DTOs
- guards
- roles/permisos
- Prisma queries
- Redis/cache
- errores esperados
- códigos HTTP
- impacto frontend
- impacto en observabilidad

## No cambiar sin confirmación
- rutas
- nombres de endpoints
- shape de respuestas
- códigos HTTP
- formato de errores
- roles/permisos
- payloads de auth
- modelos Prisma
- variables de entorno
- estrategia de cache
- métricas públicas

## Controllers
- No metas lógica de negocio pesada en controllers.
- Mantén controllers como capa de entrada.
- Valida inputs con DTOs/pipes.
- No accedas a Prisma directamente desde controllers si existe service.

## Services
- La lógica de negocio vive en services.
- Mantén métodos pequeños y testeables.
- No mezcles lógica de cache, auth y DB sin separar responsabilidades.
- Si agregas side effects, explica qué ocurre si fallan.

## Auth / JWT
Zona crítica.

Antes de tocar:
- login
- refresh
- logout
- guards
- roles
- admin
- JWT strategy
- current user

Debes validar:
- token ausente → 401
- token inválido → 401
- token expirado → 401
- usuario sin rol → 403
- usuario admin → acceso permitido
- usuario normal → acceso bloqueado

No filtres datos sensibles en errores.

## Prisma / DB
Antes de cambiar queries:
- revisa includes/selects
- revisa paginación
- revisa filtros
- revisa ordenamiento
- revisa índices
- revisa N+1
- revisa relaciones opcionales
- revisa registros inexistentes

No cambies schema sin plan de migración.
No hagas cambios destructivos sin confirmación.

## PostGIS
Máximo cuidado con:
- lat/lng inválidos
- SRID
- búsquedas por radio
- filtros geográficos extremos
- performance de distancia
- índices geoespaciales

Valida:
- coordenadas nulas
- coordenadas fuera de rango
- radio muy grande
- radio cero o negativo
- sin resultados

## Redis / cache
Zona crítica.

Antes de tocar cache:
- identifica key
- TTL
- invalidación
- fallback si Redis falla
- riesgo de stale data
- riesgo por usuario/rol

Reglas:
- No cachees datos sensibles sin segmentar por usuario/rol.
- No dejes cache inconsistente después de mutaciones.
- Si Redis falla, la API debe degradar de forma controlada si es posible.

## Errores
Todo endpoint crítico debe manejar:
- input inválido
- recurso inexistente
- usuario no autenticado
- usuario sin permisos
- conflicto de datos
- dependencia caída
- error inesperado

No expongas stack traces ni detalles internos al cliente.

## Observabilidad
Si el cambio afecta endpoints críticos, evalúa:
- latencia
- errores 4xx/5xx
- fallos DB
- fallos Redis
- auth failures
- métricas Prometheus
- protección de `/api/observability/metrics`

El endpoint de métricas debe ser solo Admin.

## Seguridad
Nunca hardcodees:
- JWT secrets
- passwords
- tokens
- connection strings reales
- claves privadas

Valida:
- autorización
- ownership de recursos
- acceso por rol
- datos devueltos por endpoint

## Respuesta obligatoria para cambios backend
Incluye siempre:
1. Endpoint/módulo afectado
2. Contrato actual
3. Contrato después del cambio
4. Riesgos
5. Código propuesto
6. Casos 200/400/401/403/404/500 a validar
7. Qué probar manualmente
8. Si afecta frontend, decir dónde