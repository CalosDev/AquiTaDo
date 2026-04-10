# AquiTa.do - Dossier Completo Para Evaluacion por IA

Fecha de corte: 2026-04-10

## 1) Proposito de este documento

Este documento existe para darle a otra IA un contexto completo, util y fiel del producto AquiTa.do, de su codigo y de su estado actual.

La idea no es vender humo ni describir solo la vision. La meta es dejar claro:

- que es la aplicacion
- que hace hoy en produccion
- como esta organizada
- que roles existen
- que dominios de negocio cubre
- que modulos, rutas y datos soporta
- que integraciones estan activas u opcionales
- que partes son arquitectura objetivo y no estado implementado

Si otra IA va a evaluar el proyecto, debe usar este documento como mapa base y luego contrastarlo con el codigo.

## 2) Resumen ejecutivo

AquiTa.do es una plataforma web orientada a Republica Dominicana que combina tres capas de producto:

1. Discovery B2C de negocios locales.
2. SaaS multi-tenant para negocios y organizaciones.
3. Operacion de plataforma con moderacion, verificacion, observabilidad y controles administrativos.

En terminos simples:

- un usuario final puede descubrir negocios, ver detalles, dejar resenas, guardar favoritos, hacer check-ins, reservar y contactar negocios
- un negocio puede operar su presencia digital, gestionar su organizacion, promociones, conversaciones, CRM, reservas, billing, ads y verificacion
- un administrador de plataforma puede revisar catalogo, moderar, verificar, observar salud del sistema y operar el producto a nivel global

La aplicacion no es solo un directorio. Es un monolito modular con capacidades de marketplace, SaaS y gobierno de plataforma.

## 3) Estado actual vs vision futura

### 3.1 Estado actual implementado

Lo siguiente esta implementado hoy en el repo y reflejado en la superficie real de frontend/API:

- frontend publico con discovery, detalle, auth, terminos, privacidad y about
- frontend autenticado con vistas separadas por rol
- backend NestJS modular
- PostgreSQL + Prisma + PostGIS
- auth JWT con refresh token y 2FA para admin
- multi-tenant por organizacion
- dashboard cliente
- dashboard de negocio
- dashboard admin
- observabilidad, health dashboard y metricas Prometheus
- smoke tests, auditorias Brave por rol y benchmark de performance

### 3.2 Vision futura / blueprint

El repo tambien incluye documentos de evolucion como [SUPERAPP_ARCHITECTURE.md](./SUPERAPP_ARCHITECTURE.md). Esos docs describen hacia donde puede crecer la plataforma, por ejemplo:

- migracion publica SEO-first a Next.js o Remix
- separacion mas DDD por bounded contexts
- mayor uso de colas async
- arquitectura mas fuerte de search/cache

Otra IA no debe confundir esa vision con "ya implementado". Este dossier prioriza el estado actual verificado.

## 4) Posicionamiento del producto

AquiTa.do esta pensada para el mercado dominicano y sigue reglas de producto profesionales:

- contexto geografico dominicano
- idioma principal: espanol
- moneda: DOP / RD$
- copy profesional, no fantasioso
- separacion estricta de roles
- no inventar datos de negocios, disponibilidad o reputacion

Estas reglas estan alineadas con [DOMINICAN_PRODUCT_GUARDRAILS.md](./DOMINICAN_PRODUCT_GUARDRAILS.md).

## 5) Stack tecnico

### 5.1 Frontend

- React 19
- Vite 7
- TypeScript
- Tailwind CSS 4
- React Router
- TanStack Query style caching/revalidation patterns sobre cliente propio
- PWA con manifest, service worker y offline fallback

### 5.2 Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- PostGIS
- Passport/JWT
- Redis
- Prometheus metrics

### 5.3 Monorepo / tooling

- pnpm workspaces
- Docker / Docker Compose
- Vitest
- ESLint
- scripts de smoke, benchmark, alertas y auditoria visual

## 6) Estructura general del repo

```text
aquita/
|-- apps/
|   |-- web/                # SPA publica + areas autenticadas por rol
|   |-- api/                # API NestJS modular
|-- docs/                   # documentacion operativa y arquitectonica
|-- scripts/                # smoke tests, benchmarks, auditorias, keep-warm, alertas
|-- docker-compose.yml
|-- package.json
|-- pnpm-workspace.yaml
```

## 7) Modelo de roles

### 7.1 Roles globales

- `USER`: cliente final / consumo B2C
- `BUSINESS_OWNER`: operador de negocio / tenant
- `ADMIN`: operador global de plataforma

### 7.2 Roles de organizacion

Dentro de una organizacion existen roles adicionales:

- `OWNER`
- `MANAGER`
- `STAFF`

Esos roles controlan acciones internas del tenant, especialmente:

- membresias
- invitaciones
- cambios de plan
- operacion del negocio

### 7.3 Reglas no negociables

- `USER` no crea negocios ni administra organizaciones
- `BUSINESS_OWNER` no entra al panel admin global
- `ADMIN` no debe usar flujos tenant como bypass
- las acciones tenant se atan a `x-organization-id`

La matriz formal esta en [ROLE_ACCESS_MATRIX.md](./ROLE_ACCESS_MATRIX.md).

## 8) Superficie real de frontend

### 8.1 Rutas publicas

La SPA publica hoy tiene estas rutas:

- `/`
- `/businesses`
- `/negocios/categoria/:categorySlug`
- `/negocios/provincia/:provinceSlug`
- `/negocios/intencion/:intentSlug`
- `/negocios/:provinceSlug/:categorySlug`
- `/businesses/:slug`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/register`
- `/terms`
- `/privacy`
- `/about`

### 8.2 Rutas autenticadas

- `/app`
- `/app/customer`
- `/profile`
- `/register-business`
- `/dashboard`
- `/dashboard/businesses/:businessId/edit`
- `/admin`
- `/security`

### 8.3 Superficies funcionales por area

#### Publico

- home de marketing/discovery
- listado de negocios
- detalle de negocio
- auth y recuperacion de password
- paginas legales
- informacion del proyecto

#### Cliente autenticado (`USER`)

- app home
- customer dashboard
- perfil
- favoritos y listas
- historial de check-ins
- reservas propias
- conversaciones propias

#### Negocio autenticado (`BUSINESS_OWNER`)

- register business
- dashboard de negocio
- edicion de negocio
- estado de verificacion
- reservas del negocio
- promociones
- ads
- billing / pagos / wallet
- CRM
- conversaciones / inbox
- organizacion y miembros

#### Admin (`ADMIN`)

- dashboard admin
- seguridad admin
- observabilidad
- health dashboard
- verificacion y moderacion
- gobernanza de categorias/features
- insights y data layer

## 9) Superficie real de API

Los grupos principales de controllers expuestos hoy son:

- `auth`
- `users`
- `businesses`
- `categories`
- `features`
- `locations`
- `search`
- `discovery`
- `reviews`
- `upload`
- `organizations`
- `plans`
- `subscriptions`
- `payments`
- `promotions`
- `bookings`
- `analytics`
- `events/telemetry`
- `messaging`
- `crm`
- `favorites`
- `checkins`
- `reputation`
- `ads`
- `verification`
- `whatsapp`
- `health`
- `observability`

## 10) Que hace la aplicacion por dominio

Esta es la parte mas importante del dossier. Resume, por dominio, las capacidades reales del producto.

### 10.1 Auth e identidad

Capacidades:

- registro de usuario
- login con email/password
- login con Google
- refresh token
- logout
- cambio de password
- forgot password
- reset password
- perfil basico
- estado de 2FA
- setup / enable / disable de 2FA

Notas:

- 2FA esta orientado especialmente a cuentas admin
- existe flujo de recovery y tokens persistidos

### 10.2 Perfil de usuario

Capacidades:

- ver perfil extendido
- editar nombre y telefono
- cambiar password
- ver resumen de actividad por rol

### 10.3 Discovery de negocios

Capacidades:

- listado publico de negocios
- filtros por categorias, provincias, ciudades, sectores y features
- ordenamiento
- modos de vista
- discovery por categoria/provincia/intencion
- negocios cercanos
- detalle publico de negocio
- leads publicos hacia el negocio

Notas:

- discovery usa cache corta para lecturas publicas
- existe integracion de mapa y carga diferida de partes pesadas

### 10.4 Search

Capacidades:

- busqueda de negocios
- filtros
- reindexado administrativo
- cache y TTL de lecturas publicas

Search no es solo UI; es un dominio del backend con endpoint propio.

### 10.5 Negocios

Capacidades:

- crear negocio
- actualizar negocio
- eliminar negocio
- listar negocios propios
- listar catalogo completo para admin
- ver detalle de negocio por ID, slug o identificador
- ver calidad de catalogo en admin
- ver y actualizar horas, imagenes y metadatos

### 10.6 Categorias y features

Capacidades:

- listar categorias publicas
- crear/editar/eliminar categorias desde admin
- listar features publicas

Estas dos piezas alimentan discovery, formularios de negocio y filtros.

### 10.7 Ubicaciones

Capacidades:

- listar provincias
- listar ciudades por provincia
- listar sectores por ciudad

Esto soporta contexto geografico dominicano real.

### 10.8 Reviews

Capacidades:

- crear resenas
- listar resenas por negocio
- ver resenas marcadas
- moderar resenas desde admin

### 10.9 Uploads y assets

Capacidades:

- upload de avatar
- delete avatar
- upload de imagen de negocio
- delete de imagen de negocio
- update de metadata de imagen de negocio

Notas:

- storage soporta provider local o S3-compatible

### 10.10 Organizaciones y multi-tenant SaaS

Capacidades:

- crear organizacion
- listar organizaciones del usuario
- ver organizacion por ID
- actualizar organizacion
- ver subscription de organizacion
- cambiar subscription
- ver uso y limites
- leer audit logs
- listar miembros
- listar invitaciones
- invitar miembros
- aceptar invitaciones
- cambiar rol de miembro
- remover miembro

Esto es el nucleo multi-tenant del SaaS.

### 10.11 Planes y suscripciones

Capacidades:

- listar planes
- ver suscripcion actual
- crear checkout session
- cancelar al final del periodo

Planes documentados hoy:

- `FREE`
- `GROWTH`
- `SCALE`

### 10.12 Pagos y billing

Capacidades:

- ver pagos propios
- ver invoices propias
- ver billing summary
- ver fiscal summary
- exportar invoices CSV
- exportar payments CSV
- exportar fiscal CSV
- ads wallet overview
- ads wallet checkout session
- booking checkout session

Esto cubre facturacion SaaS y parte marketplace.

### 10.13 Promociones

Capacidades:

- listar promociones publicas
- listar promociones propias
- crear promociones
- actualizar promociones
- eliminar promociones

### 10.14 Bookings

Capacidades:

- crear reserva
- listar reservas como usuario
- listar reservas del tenant
- actualizar estado de reserva
- listar transacciones de reservas del tenant

### 10.15 Analytics y growth

Capacidades:

- track de evento de negocio
- dashboard analytics del tenant
- analytics por negocio
- market insights
- generar market reports
- listar market reports
- ver market report especifico
- track de growth events
- growth insights

Los growth events cubren cosas como:

- busquedas
- clicks de resultados
- clicks de contacto
- clicks a WhatsApp
- intentos de reserva
- filtros del listado
- cambio lista/mapa
- onboarding de negocios
- recovery de password
- auth con Google
- premoderacion

### 10.16 WhatsApp

Capacidades:

- webhook de verificacion
- recepcion de eventos/mensajes
- click-to-chat link + tracking de conversion
- listar conversaciones del negocio
- cambiar estado de conversacion

Notas:

- `WHATSAPP_ENABLED` puede desactivar esta capa
- el dominio existe y esta integrado, pero puede estar opcionalmente apagado en runtime

### 10.17 Messaging

Capacidades:

- crear conversacion cliente -> negocio
- listar conversaciones del usuario
- ver thread del usuario
- enviar mensaje como cliente
- listar conversaciones del tenant
- ver thread del tenant
- enviar mensaje como negocio
- cambiar estado de conversacion
- convertir conversacion a booking

### 10.18 CRM

Capacidades:

- listar clientes
- ver historial por cliente
- ver pipeline
- crear lead
- mover lead de etapa

Stages soportados:

- `LEAD`
- `QUOTED`
- `BOOKED`
- `PAID`
- `LOST`

### 10.19 Favorites

Capacidades:

- listar negocios favoritos
- toggle de favorito
- listar listas del usuario
- crear lista
- eliminar lista
- agregar negocio a lista
- remover negocio de lista

### 10.20 Check-ins / loyalty

Capacidades:

- crear check-in
- listar check-ins propios
- ver stats de check-ins por negocio

### 10.21 Reputation

Capacidades:

- rankings reputacionales
- perfil reputacional de negocio

### 10.22 Ads

Capacidades:

- ver placements publicos
- track de impresiones
- track de clicks
- crear campanas
- listar campanas propias
- cambiar estado de campana

### 10.23 Verification y moderacion

Capacidades:

- upload de archivo de documento
- registrar documento de verificacion
- listar documentos propios
- enviar negocio a revision
- ver estado de verificacion del negocio
- listar pending businesses en admin
- listar moderation queue en admin
- resolver pre-moderacion preventiva
- revisar negocio
- revisar documento

Notas:

- el flujo separa premoderacion y KYC/review
- esta parte es importante para gobierno de plataforma

### 10.24 Observabilidad y salud operativa

Capacidades:

- liveness
- readiness
- health dashboard
- Prometheus metrics
- resumen de observabilidad frontend
- alertas por errores cliente y vitals
- dashboard admin de salud

Notas:

- la observabilidad frontend agrega route views, errores cliente y web vitals
- existe cache corta para resumen admin
- se han filtrado ruidos de auditoria interna para que el panel sea mas util

## 11) Inventario de modulos backend

Segun `apps/api/src/app.module.ts`, los modulos relevantes hoy son:

- `AuthModule`
- `UsersModule`
- `BusinessesModule`
- `CategoriesModule`
- `FeaturesModule`
- `SearchModule`
- `DiscoveryModule`
- `LocationsModule`
- `ReviewsModule`
- `UploadsModule`
- `HealthModule`
- `PlansModule`
- `SubscriptionsModule`
- `PaymentsModule`
- `PromotionsModule`
- `BookingsModule`
- `AnalyticsModule`
- `MessagingModule`
- `CrmModule`
- `OrganizationsModule`
- `ReputationModule`
- `AdsModule`
- `VerificationModule`
- `FavoritesModule`
- `CheckInsModule`
- `WhatsAppModule`
- `NotificationsModule`
- `ObservabilityModule`

Y modulos transversales:

- `ConfigModule`
- `PrismaModule`
- `CacheModule`
- `ResilienceModule`
- `RequestContextModule`
- `DomainEventsModule`
- `AuthorizationModule`
- `SecurityModule`
- `ThrottlerModule`

## 12) Modelo de datos actual

Este no es el schema completo, pero si el mapa de entidades principales reales de negocio.

### 12.1 Identidad y acceso

- `User`
- `RefreshToken`
- `PasswordResetToken`

### 12.2 Negocio y catalogo

- `Business`
- `BusinessImage`
- `BusinessHour`
- `Category`
- `BusinessCategory`
- `Feature`
- `BusinessFeature`

### 12.3 Geografia

- `Province`
- `City`
- `Sector`

### 12.4 Multi-tenant / SaaS

- `Organization`
- `OrganizationMember`
- `OrganizationInvite`
- `Plan`
- `Subscription`
- `UsageMetric`
- `AuditLog`

### 12.5 Trust / engagement / customer activity

- `Review`
- `CheckIn`
- `UserFavoriteBusiness`
- `UserBusinessList`
- `UserBusinessListItem`
- `SalesLead`

### 12.6 Commerce / billing / marketplace

- `Booking`
- `Promotion`
- `Payment`
- `Invoice`
- `Transaction`
- `WebhookEvent`

### 12.7 Messaging / WhatsApp / CRM

- `Conversation`
- `ConversationMessage`
- `WhatsAppConversation`
- `WhatsAppMessage`
- `WhatsAppWebhookEvent`
- `WhatsAppClickConversion`

### 12.8 Analytics / market / growth

- `BusinessAnalytics`
- `GrowthEvent`
- `MarketReportSnapshot`

### 12.9 Verification / ads / notifications

- `BusinessVerificationDocument`
- `AdCampaign`
- `AdEvent`
- `AdWalletTopup`
- `NotificationJob`

## 13) Lo que fue removido o ya no debe evaluarse como activo

### 13.1 IA

La parte de IA fue removida del producto y del runtime. Otra IA no debe evaluar AquiTa.do como una app con IA activa hoy.

Eso incluye:

- modulo AI
- surfaces de producto asociadas
- persistencia asociada a AI

Si aparece alguna referencia historica en migraciones viejas o en contexto pasado, no debe tratarse como feature actual.

### 13.2 Codigo muerto historico

Durante las podas recientes tambien se eliminaron:

- piezas de persistencia generica que no tenian consumidores reales
- scripts legacy de auditoria visual ya reemplazados
- docs historicos de remediation/performance/presentacion que ya no formaban parte del mantenimiento activo

## 14) PWA y experiencia de carga

La app soporta:

- `manifest.webmanifest`
- registro automatico de service worker
- offline fallback
- optimizaciones de lazy loading y code splitting
- auditorias visuales de CLS por rol

El proyecto ha sido trabajado especificamente para:

- evitar layout shifts
- reducir el JS cargado por ruta
- diferir paneles pesados
- evitar que el mapa cargue en el index si no hace falta

## 15) Seguridad y aislamiento

### 15.1 Seguridad de acceso

- auth por JWT
- refresh token
- 2FA admin
- guards por rol global
- checks por rol de organizacion
- enforcement tenant por `x-organization-id`

### 15.2 Seguridad operativa

- throttling
- validacion DTO
- audit logs en operaciones sensibles
- observabilidad de errores
- health dashboard
- filtros globales de excepcion

### 15.3 Regla de evaluacion importante

Otra IA debe prestar especial atencion a:

- fugas cross-role
- fugas cross-tenant
- endpoints admin expuestos por error en tenant UI
- acciones tenant permitidas a quien no tenga membership real

## 16) Observabilidad, health y operacion

El proyecto tiene una capa operativa bastante seria para su tamano:

- `pnpm smoke:api`
- `pnpm smoke:full`
- `pnpm smoke:saas`
- `pnpm smoke:prod`
- `pnpm alerts:prod`
- `pnpm smoke:brave:roles`
- `pnpm smoke:brave:roles:mobile`
- `pnpm perf:prod`
- `pnpm ops:prod`
- `pnpm keepwarm:prod`

Esto significa que el producto no solo tiene codigo; tambien tiene:

- smoke tests productivos
- benchmarks
- auditoria visual por rol
- lectura operativa de alertas
- keep-warm para reducir cold starts

## 17) Integraciones y capacidades opcionales

### 17.1 Email

Existe capa de email / recovery, pero el estado de email en produccion puede ser opcional o no configurado segun el entorno.

Otra IA debe evaluar:

- el codigo de recovery
- la dependencia de email
- la operacion real del entorno

Pero debe distinguir entre:

- feature implementada
- feature configurada hoy en el deployment

### 17.2 WhatsApp

WhatsApp existe como dominio y puede activarse con variables como:

- `WHATSAPP_ENABLED`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`

Puede existir codigo implementado aunque el canal este apagado en un entorno especifico.

### 17.3 Storage

Soporta:

- local
- S3 / compatibles

### 17.4 Google auth

Existe login con Google en la superficie auth.

## 18) Scripts y calidad del repo

El repositorio esta preparado para desarrollo y operacion:

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e:api`
- `pnpm quality:check`
- scripts de DB
- scripts de smoke
- scripts de alertas
- scripts de benchmark

Tambien se han hecho podas para mantener la estructura profesional y reducir ruido innecesario.

## 19) Estructura profesional de carpetas

### 19.1 Lo bueno de la estructura actual

- separacion clara `apps/web` vs `apps/api`
- `docs/` enfocado a arquitectura y operacion
- `scripts/` para calidad, smoke y benchmarks
- backend modular por dominio
- frontend organizado por pages, subcarpetas y componentes

### 19.2 Criterio de evaluacion

Otra IA deberia revisar:

- si algun modulo backend esta demasiado gordo
- si alguna page frontend mezcla demasiadas responsabilidades
- si algun dominio SaaS deberia extraerse en servicios internos mas pequenos

Pero a nivel repo, la estructura ya es coherente para un monolito modular.

## 20) Lo que otra IA deberia evaluar explicitamente

Si otra IA va a evaluar AquiTa.do, conviene pedirle que haga al menos estas 10 evaluaciones:

1. Evaluacion de producto:
   - que tan clara es la propuesta B2C + SaaS + plataforma

2. Evaluacion de UX:
   - discovery, detalle, auth, dashboards, formularios, estados vacios, errores

3. Evaluacion de arquitectura:
   - si el monolito modular esta bien separado

4. Evaluacion de seguridad:
   - auth, roles, multi-tenant, 2FA, auditoria, validacion

5. Evaluacion de rendimiento:
   - bundle, lazy loading, LCP/FCP, cache, mapas, imagenes

6. Evaluacion de base de datos:
   - modelo de datos, relaciones, indices, crecimiento, auditabilidad

7. Evaluacion de mantenibilidad:
   - claridad del repo, duplicacion, deuda tecnica, testing, scripts

8. Evaluacion operativa:
   - health dashboard, observabilidad, alertas, smoke prod, incident response

9. Evaluacion de readiness comercial:
   - que tan lista esta para beta, soft launch o mercado abierto

10. Evaluacion de riesgos:
   - que podria romperse primero, donde estan los puntos mas delicados y que faltaria para escalar

## 21) Instrucciones sugeridas para la IA evaluadora

Texto sugerido:

> Evalua AquiTa.do como un producto real en estado beta/soft-launch. Distingue entre estado implementado actual y arquitectura futura. Analiza frontend, backend, base de datos, seguridad, multi-tenant, roles, operacion, observabilidad, performance, UX y readiness de mercado. No asumas que la app es solo un directorio; tambien es un SaaS de negocios y una plataforma de operacion. Senala fortalezas, debilidades, riesgos, deuda tecnica, oportunidades de simplificacion y prioridades de mejora.

## 22) Limites y aclaraciones importantes

- Este dossier resume el estado real verificado desde rutas, controllers, schema y endpoints, pero no reemplaza una lectura directa del codigo.
- Algunas capacidades existen a nivel API aunque no todas tengan el mismo nivel de exposicion visual en la UI.
- Algunos componentes de operacion pueden estar habilitados o deshabilitados por configuracion de entorno.
- Los documentos de blueprint no deben confundirse con lo implementado hoy.

## 23) Veredicto corto sobre el proyecto

AquiTa.do, en su estado actual, es:

- mas que un directorio
- menos que una plataforma totalmente desacoplada por microservicios
- un monolito modular serio con discovery, SaaS y operacion de plataforma

Es un producto con:

- bastante amplitud funcional
- roles claros
- infraestructura operativa por encima del promedio para su etapa
- base tecnica suficiente para evaluacion profunda por otra IA

Si otra IA lo evalua bien, deberia tratarlo como:

- producto B2B2C dominicano
- plataforma multi-tenant
- codebase con ambicion de escalado
- sistema ya endurecido con smoke, observabilidad y controles de calidad

