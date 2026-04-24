# apps/api

Backend de producción basado en NestJS + TypeScript + Prisma + PostgreSQL + Redis.

Este módulo gestiona:
- lógica de negocio
- autenticación
- permisos
- acceso a datos
- integridad del sistema

Cualquier cambio puede afectar datos reales y usuarios reales.

---

# 🚨 Regla principal

NO romper contratos de API, auth, permisos ni integridad de datos.

Si no entiendes el flujo completo → no modifiques el código todavía.

---

# 🧠 Modo de trabajo obligatorio

Antes de cualquier cambio:

1. Identificar endpoint o módulo afectado
2. Revisar:
   - controller
   - service
   - DTOs
   - guards
   - roles/permisos
   - queries Prisma
   - uso de Redis/cache
3. Detectar impacto:
   - frontend
   - auth
   - datos
   - cache
   - observabilidad
4. Evaluar riesgos

Nunca saltar directo a código en cambios no triviales.

---

# 📁 Reglas críticas

## Debes leer antes de tocar código

- `apps/api/AGENTS.md` (obligatorio)

---

# ⚠️ Zonas críticas backend

Cambios en estas áreas requieren análisis previo:

- autenticación (JWT)
- guards
- roles/permisos
- endpoints públicos
- endpoints admin
- queries a base de datos
- mutaciones (create/update/delete)
- cache Redis
- integridad de datos
- errores y códigos HTTP
- métricas / observabilidad

---

# ❌ Prohibido

- Cambiar contratos de API sin validar impacto en frontend
- Cambiar códigos HTTP arbitrariamente
- Exponer datos sensibles en responses o errores
- Eliminar validaciones existentes
- Acceder a Prisma desde controllers si hay services
- Mezclar lógica de negocio con infraestructura
- Cambiar roles/permisos sin revisar todas las rutas
- Introducir cambios en auth sin validar todos los escenarios

---

# 🔐 Auth y permisos

Zona crítica.

Cualquier cambio debe validar:

- usuario no autenticado → 401
- token inválido → 401
- token expirado → 401
- usuario sin rol → 403
- usuario admin → acceso permitido
- usuario estándar → acceso restringido correctamente

Nunca exponer:
- tokens
- secrets
- información interna

---

# 🧩 Controllers

- Deben ser delgados
- Solo manejan entrada/salida
- No contienen lógica de negocio compleja
- Delegan en services

---

# ⚙️ Services

- Contienen lógica de negocio
- Deben ser consistentes y predecibles
- Evitar efectos secundarios ocultos
- Si hay side effects:
  - deben ser explícitos
  - deben manejar errores

---

# 🗄️ Base de datos (Prisma)

Antes de cambiar queries:

- revisar relaciones
- revisar includes/selects
- revisar paginación
- revisar filtros
- revisar índices
- evitar N+1
- manejar registros inexistentes

## Cambios en schema

- requieren migración
- deben ser backward compatible (si es posible)
- no hacer cambios destructivos sin confirmación

---

# 🌍 PostGIS (si aplica)

Máximo cuidado con:

- coordenadas inválidas
- radios extremos
- queries costosas
- índices geoespaciales

Validar:
- sin resultados
- coordenadas fuera de rango
- radio inválido

---

# ⚡ Redis / cache

Zona crítica.

Antes de tocar:

- identificar keys
- TTL
- invalidación
- fallback si Redis falla

Reglas:

- no cachear datos sensibles sin segmentar por usuario/rol
- no dejar cache inconsistente tras mutaciones
- asegurar coherencia con DB

---

# ❗ Manejo de errores

Todo endpoint debe manejar:

- input inválido → 400
- no encontrado → 404
- no autenticado → 401
- no autorizado → 403
- error interno → 500

Nunca exponer:
- stack traces
- errores internos
- detalles de DB

---

# 📊 Observabilidad

Cambios relevantes deben considerar:

- latencia
- errores 4xx/5xx
- fallos de DB
- fallos de Redis
- fallos de auth

## Métricas

- `/api/observability/metrics` debe estar protegido (Admin)
- no exponer datos sensibles

---

# 🔐 Seguridad

Nunca hardcodear:

- JWT secrets
- passwords
- tokens
- connection strings reales

Validar siempre:

- autorización
- ownership de recursos
- acceso por rol

---

# 🎯 Prioridades del backend

1. correctitud
2. integridad de datos
3. seguridad
4. consistencia
5. estabilidad
6. performance

---

# 🧪 Validación obligatoria

Después de cada cambio debes comprobar:

- endpoint responde correctamente (200)
- errores correctos (400/401/403/404/500)
- auth funciona
- permisos funcionan
- DB responde correctamente
- cache no rompe coherencia
- frontend no se rompe (si aplica)

---

# 🧭 Filosofía

Este backend no se “optimiza” agresivamente.

Se evoluciona con cambios:
- pequeños
- seguros
- verificables

---

# ⚙️ Cómo trabajar con Codex

Siempre iniciar con:

```txt
Modo: DIAGNOSTICO

Analiza este endpoint/módulo antes de modificarlo