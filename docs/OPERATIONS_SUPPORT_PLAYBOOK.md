# AquiTa.do - Playbook Operativo de Soporte

Fecha de corte: 2026-03-30

## Objetivo

Este playbook cubre los flujos operativos que hoy ya existen en producto y que mas impactan soporte:

- recuperacion de contrasena
- 2FA obligatorio para cuentas admin
- premoderacion previa a verificacion
- lectura rapida de salud de email, recovery y discovery

## 1) Recuperacion de contrasena

### Flujo esperado

1. El usuario abre `/forgot-password` y solicita recuperacion.
2. La API crea un `PasswordResetToken` nuevo y elimina tokens previos del mismo usuario.
3. Se intenta enviar el enlace por email transaccional.
4. El usuario abre `/reset-password?token=...` y define una nueva contrasena.
5. El token queda marcado con `usedAt` cuando el cambio se completa.

### Donde mirar

- Admin > `Observabilidad`
  - badge `Email`
  - tarjetas `Recovery 24h`, `Rate reset` y `Reset expirados`
- `GET /api/health/dashboard` como fuente operativa
- `GET /api/observability/metrics` para metricas raw Prometheus

### Senales operativas utiles

- `requestsLast24h`: solicitudes de recovery creadas en las ultimas 24h
- `completionsLast24h`: resets completados en las ultimas 24h
- `completionRatePct`: conversion request -> complete
- `activeTokens`: tokens pendientes todavia vigentes
- `expiredPendingTokens`: tokens no usados ya expirados
- `Email status`: salud del proveedor de correo segun latencia/error reciente

### Diagnostico rapido

- `Email up` + `requestsLast24h` sube + `completionsLast24h` no sube:
  - revisar spam/promotions en correo del usuario
  - validar que el usuario abra el enlace mas reciente
  - confirmar que el enlace no haya expirado
- `Email degraded/down`:
  - revisar configuracion `RESEND_API_KEY` y `RESEND_FROM_EMAIL`
  - revisar metricas Prometheus de dependencia externa
  - revisar logs de `AuthService` para errores HTTP de Resend
- `expiredPendingTokens` sube:
  - revisar copy del email, entregabilidad y tiempo de expiracion

### Limites actuales

- No existe panel de reenvio manual por admin.
- No existe bypass productivo para revelar tokens en produccion.
- `AUTH_DEBUG_RESET_TOKENS` solo debe usarse en entornos no productivos.

## 2) 2FA Admin

### Flujo esperado

- Solo cuentas `ADMIN` pueden configurar y usar 2FA.
- La configuracion vive en `/admin/security`.
- Para habilitar o deshabilitar 2FA siempre se exige codigo valido.
- En login admin, si 2FA esta activo, el acceso requiere el segundo factor.

### Soporte operativo

- Si el admin aun tiene acceso:
  - pedir que entre en `/admin/security`
  - regenerar setup si el cambio aun esta pendiente
  - deshabilitar 2FA solo como accion de recuperacion controlada
- Si el admin perdio acceso total al autenticador:
  - hoy no existe bypass de soporte via API/UI
  - escalar a ingenieria para intervencion manual controlada

## 3) Premoderacion previa a verificacion

### Flujo esperado

- Un negocio sospechoso no pasa directo a KYC.
- Entra en cola `BUSINESS_PREMODERATION`.
- Admin puede:
  - `Enviar a KYC`
  - `Mantener bloqueo`

### Donde actuar

- Admin > cola de verificacion/moderacion
- Revisar razones preventivas visibles en la tarjeta
- Admin > `KYC + Data Layer` > insights
  - tarjeta `Premoderacion resuelta`
  - bloque `Top razones de premoderacion`

### Criterio operativo

- Liberar a KYC solo si el caso parece falso positivo.
- Mantener bloqueo si hay senales claras de spam, desvio a canales externos o duplicacion.
- Si la tasa de liberacion sube demasiado para la misma razon preventiva, abrir ajuste de scoring/reglas.

## 4) Discovery lista/mapa

### Donde mirar

- Admin > `KYC + Data Layer` > insights
  - tarjetas de alerta accionable
  - comparativos vs ventana previa
  - tarjeta `Descubrimiento lista/mapa`
  - tarjeta `Filtros y orden`
  - bloque `Uso del listado`

### Que leer rapido

- `Mapa` vs `Lista`: cuantas veces cambian de vista
- `Filtros` y `Orden`: intensidad de refinamiento antes del click
- `Clicks a fichas desde listado`: trafico efectivo al detalle
- `Selecciones en mapa`: interes real por el mapa, no solo apertura de la vista
- `Clicks patrocinados`: peso de placements pagos dentro del discovery

### Uso operativo

- Si `Mapa` sube pero `Selecciones en mapa` no, revisar claridad de markers, viewport y cards resaltadas.
- Si `Filtros` sube y `Clicks a fichas` cae, revisar friccion o exceso de combinaciones vacias.
- Si `Clicks patrocinados` desplazan demasiado el click organico, revisar balance visual y relevancia.

## 4.1) Owners y SLA visibles en admin

- `Recovery con baja finalizacion`
  - owner: `Soporte`
  - SLA: `24h`
- `Premoderacion con release rate elevado`
  - owner: `Trust & Safety`
  - SLA: `8h`
- `Mapa abierto con poca seleccion`
  - owner: `Growth`
  - SLA: `72h`
- `Onboarding de negocios con friccion`
  - owner: `Producto`
  - SLA: `48h`

## 5) Onboarding de negocios

### Donde mirar

- Admin > `KYC + Data Layer` > insights
  - tarjeta `Onboarding negocios`
  - comparativos vs ventana previa
  - bloque `Funnel onboarding de negocios`
  - alertas accionables de friccion
- Web > `Registra tu negocio`
  - bloque `Guia de publicacion`

### Uso operativo

- Si el funnel cae fuerte entre pasos, revisar copy, longitud de formularios y ayudas contextuales del paso.
- Si la guia preventiva muestra contacto o links en descripcion, moverlos a campos estructurados antes de publicar.
- Si la alerta de friccion se mantiene, priorizar mejoras de UX antes de escalar adquisicion.

## 6) Checklist corto de guardia

- Verificar badge `Email` en Admin > Observabilidad.
- Revisar `Recovery 24h`, `Rate reset` y `Reset expirados`.
- Si hay incidente admin, validar si el problema es password o 2FA.
- Si hay bloqueo de negocio, revisar si esta en `BUSINESS_PREMODERATION` antes de tocar KYC.
- Si baja la conversion de discovery, revisar `Descubrimiento lista/mapa`, `Filtros y orden` y `Uso del listado`.
- Si aparece una alerta de friccion de onboarding o de release rate alto, abrir revision de copy/scoring antes de seguir escalando trafico.
- Contrastar la metrica actual contra la ventana previa antes de decidir si el problema es puntual o sostenido.
- Si hace falta una accion no disponible en UI, documentar caso y escalar a ingenieria.
