# AquiTa.do — Frontend Refactor Execution Plan

Fecha: 2026-04-15
Estado: Documento de ejecución
Propósito: convertir el blueprint de UI/UX en un plan de refactor ejecutable, incremental y seguro para todo el frontend de AquiTa.do.

---

## 1. Objetivo del documento

Este documento existe para transformar la dirección definida en `AquiTaDo_UI_UX_SYSTEM_BLUEPRINT.md` en una secuencia clara de trabajo técnico y visual.

No describe solo principios. Describe:

- qué se debe refactorizar primero
- qué partes del producto tienen mayor prioridad
- qué componentes deben unificarse
- cómo reducir el riesgo de romper el frontend
- cómo organizar el trabajo por fases
- cómo validar si cada etapa quedó bien

La meta no es rediseñar “pantalla por pantalla sin sistema”, sino refactorizar el frontend completo con una lógica consistente, controlada y acumulativa.

---

## 2. Resultado esperado

Al finalizar este plan, el frontend de AquiTa.do debe cumplir con estas condiciones:

1. Tener una arquitectura visual coherente entre público, negocio y admin.
2. Soportar el crecimiento funcional reciente sin verse inflado o desordenado.
3. Tener layouts y componentes reutilizables con jerarquía clara.
4. Reducir fricción visual, duplicación estructural y deuda de UI.
5. Mejorar claridad, escaneabilidad, responsive y mantenibilidad.

---

## 3. Principio rector del refactor

El problema actual no es ausencia de diseño, sino falta de absorción estructural del crecimiento funcional.

El frontend evolucionó de una app relativamente ligera hacia una plataforma con:

- discovery público
- panel de usuario
- panel de negocio
- admin global
- claims
- verificación
- reservas
- mensajería
- WhatsApp
- CRM
- billing
- ads
- observabilidad

Por tanto, el refactor debe seguir este principio:

> menos decoración aislada, más sistema; menos héroes visuales, más workbench; menos estilos únicos por pantalla, más patrones reutilizables por dominio.

---

## 4. Alcance del refactor

Este plan cubre todo el frontend del proyecto, con foco en las superficies reales descritas en el dossier del producto:

- rutas públicas de discovery
- auth
- áreas autenticadas de usuario
- dashboard de negocio
- dashboard admin
- claims y verificación
- inbox / conversaciones
- reservas
- CRM
- billing / pagos
- promociones / ads
- páginas de soporte y sistema

No incluye rediseño de branding completo, reescritura de backend ni cambio radical de stack.

---

## 5. Estrategia general de ejecución

El refactor debe hacerse en capas, no en paralelo caótico.

### Orden correcto

1. Definir base visual y estructural.
2. Refactorizar el app shell.
3. Refactorizar navegación y patrones globales.
4. Refactorizar superficies críticas por prioridad de uso.
5. Refactorizar módulos secundarios.
6. Cerrar con QA visual, responsive, accesibilidad y cleanup.

### Orden incorrecto

- tocar 20 pantallas a la vez
- arreglar spacing con parches locales
- crear nuevos componentes sin inventario previo
- cambiar layout dentro de cada página sin un shell unificado
- mezclar rediseño visual con cambio funcional innecesario

---

## 6. Priorización por impacto

### Prioridad P0 — fundación
Estas piezas deben existir o estabilizarse antes de tocar muchas pantallas:

- layout containers
- grid principal
- app shell autenticado
- sidebar unificada
- top header / section headers
- sistema base de cards
- acciones primarias/secundarias
- inputs y filtros base
- empty states
- estados loading/error/success

### Prioridad P1 — áreas más visibles y más rotas

- dashboard de negocio
- auth (login/register/forgot/reset)
- discovery público y listado
- detalle de negocio

### Prioridad P2 — operación del negocio

- claims
- verificación
- reservas
- inbox / messaging / WhatsApp
- promociones
- CRM
- billing

### Prioridad P3 — administración y módulos densos

- admin dashboard
- observabilidad
- moderation queue
- catalog quality
- gobernanza de categorías/features
- reportes

### Prioridad P4 — refinamiento

- microinteracciones
- animaciones sutiles
- consistencia de iconografía
- skeletons específicos
- polish visual final

---

## 7. Fase 0 — preparación y auditoría

Antes de mover UI, debe hacerse una auditoría rápida del frontend actual.

### 7.1 Inventario obligatorio

Crear inventario de:

- layouts existentes
- sidebars existentes
- wrappers de page
- cards repetidas
- headers repetidos
- formularios repetidos
- tablas/listados repetidos
- estados vacíos repetidos
- componentes de métricas repetidos

### 7.2 Clasificación de componentes

Cada componente debe marcarse como uno de estos:

- `KEEP`
- `REFINE`
- `MERGE`
- `REPLACE`
- `REMOVE`

### 7.3 Salida mínima de esta fase

- mapa de componentes actuales
- duplicaciones detectadas
- puntos de alto riesgo visual
- páginas con mayor dolor estructural

### 7.4 Regla

No se debe empezar por “mejorar pantallas” antes de entender qué base está duplicada.

---

## 8. Fase 1 — foundation UI

Esta es la fase más importante. Si falla, todo lo demás vuelve a desordenarse.

### 8.1 Definir layout system

Debe definirse un sistema único para:

- max width por contexto
- gutters
- espaciado vertical por sección
- grid de 12 columnas o equivalente consistente
- breakpoints reales del proyecto
- ancho estándar del sidebar
- ancho estándar de paneles secundarios
- reglas de stacking en tablet/mobile

### 8.2 Definir primitives

Crear o unificar los componentes base:

- `PageShell`
- `AppShell`
- `SectionHeader`
- `AppCard`
- `MetricCard`
- `FilterBar`
- `EmptyState`
- `StatusBanner`
- `ActionBar`
- `DataTableWrapper`
- `FormSection`
- `InfoList`
- `StatGroup`
- `InlineNotice`

### 8.3 Unificar visual language

Definir:

- escala tipográfica
- escala de spacing
- radios
- sombras
- pesos visuales
- densidad por rol
- jerarquía de color semántico
- tratamiento de badges/chips

### 8.4 Resultado esperado

Al cerrar esta fase ya debe poder montarse cualquier pantalla nueva usando piezas consistentes sin inventar contenedores nuevos.

---

## 9. Fase 2 — app shell unificado

### 9.1 Qué incluye

- shell autenticado completo
- sidebar negocio
- sidebar admin
- navegación secundaria si aplica
- top context bar
- page title / section header pattern
- layout de contenido principal

### 9.2 Objetivo

Pasar de “pantallas bonitas individuales” a “aplicación operativa coherente”.

### 9.3 Reglas del shell

1. La navegación no compite con el contenido.
2. El contenido central debe ganar prioridad visual.
3. El contexto activo del negocio/organización debe verse claro.
4. La navegación debe soportar crecimiento de módulos sin colapsar visualmente.
5. Debe haber una diferencia clara entre shell de negocio y shell admin.

### 9.4 Cambios concretos recomendados

- adelgazar sidebars visualmente
- reducir tarjetas decorativas dentro de sidebars
- colapsar o resumir información secundaria
- convertir el hero del dashboard en encabezado operativo compacto
- eliminar doble jerarquía visual entre sidebar y content hero

---

## 10. Fase 3 — auth surfaces

### Alcance

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

### Problema actual típico

Las pantallas de auth se sienten parcialmente como landing y parcialmente como formulario, lo cual reduce foco.

### Objetivo del refactor

- más claridad
- menos competencia decorativa
- mejor balance entre branding y tarea principal
- mejor legibilidad en desktop y mobile

### Reglas

1. El formulario siempre debe dominar la acción.
2. El panel informativo lateral no debe robar foco.
3. El tipo de cuenta debe ser claro y entendible.
4. Los errores deben ser visibles y sobrios.
5. Debe haber consistencia entre login, registro y recovery.

### Entregables

- auth layout unificado
- auth card o auth panel estándar
- estilos coherentes para forms, toggles, ayudas y errores

---

## 11. Fase 4 — discovery público

### Alcance

- `/`
- `/businesses`
- rutas por categoría/provincia/intención
- `/businesses/:slug`

### Objetivo

Asegurar que el discovery siga siendo claro aunque el producto tenga capas SaaS detrás.

### Principios

- público = exploración + confianza + claridad
- no mezclar lenguaje interno de tenant donde no corresponde
- filtros visibles pero no pesados
- cards de negocio fáciles de escanear
- detalle de negocio con jerarquía clara entre información, acciones y credibilidad

### Puntos de trabajo

- refactor del header y search/filter bar
- grid/lista consistente
- business card unificada
- detalle de negocio con bloques claros
- estados de negocio reclamado/no reclamado/verificado sin ruido

---

## 12. Fase 5 — business dashboard

Esta es la prioridad de mayor impacto después de foundation.

### Alcance

- `/dashboard`
- `/register-business`
- `/dashboard/businesses/:businessId/edit`
- secciones de overview del negocio

### Problema actual

Exceso de competencia visual entre sidebar, hero, métricas, badges y paneles.

### Objetivo

Convertir el dashboard en una interfaz operativa con jerarquía clara.

### Estructura recomendada

#### Bloque 1 — contexto y estado
- negocio activo
- claim status
- verification status
- profile completeness
- acciones rápidas

#### Bloque 2 — operación diaria
- reservas
- conversaciones
- WhatsApp
- leads

#### Bloque 3 — crecimiento
- promociones
- campañas
- analytics
- reputación

#### Bloque 4 — administración
- equipo
- organización
- plan actual
- billing

### Cambios obligatorios

- reducir drásticamente altura del hero
- separar summary de storytelling
- usar métricas compactas
- usar section cards con headers consistentes
- evitar bloques visuales vacíos muy grandes
- reducir chips redundantes

---

## 13. Fase 6 — claims y verification

### Alcance

- claim flows
- business ownership states
- verification status
- document upload / review state
- banners y estados contextuales relacionados

### Objetivo

Que el usuario de negocio entienda rápidamente:

- si el negocio está reclamado o no
- si tiene una solicitud pendiente
- qué falta para verificarlo
- qué acción debe tomar ahora

### Reglas

1. Claim y verification no deben verse como lo mismo.
2. Deben tener estados diferenciados y comprensibles.
3. Las acciones siguientes deben ser explícitas.
4. Los estados pendientes no deben depender de leer mucho texto.

### Componentes clave

- `ClaimStatusBanner`
- `VerificationChecklist`
- `DocumentUploadCard`
- `PendingReviewPanel`
- `NextStepCard`

---

## 14. Fase 7 — inbox, bookings, WhatsApp, CRM

Estas pantallas son densas y deben tratarse como work surfaces, no como marketing panels.

### Dominios incluidos

- messaging
- inbox de negocio
- threads
- reservas
- transacciones de reservas
- WhatsApp conversations
- CRM pipeline
- customer history

### Principios

- prioridad a claridad operativa
- filtros compactos
- listas claras
- detalle legible
- acciones rápidas visibles
- densidad controlada

### Patrones recomendados

- split view cuando aplique
- table/list + detail panel
- filter bar estándar
- bulk actions donde tenga sentido
- status chips muy sobrios
- empty states dirigidos a acción

### Error a evitar

No envolver estos módulos en cards gigantes vacías con mucho padding y poca información.

---

## 15. Fase 8 — promotions, ads, analytics, billing

### Naturaleza de estos módulos

Son módulos de crecimiento y gestión, no deben sentirse iguales que discovery ni igual que admin.

### Objetivo

Darles una interfaz más profesional, ordenada y orientada a resultados.

### Principios

- analytics: más señal, menos decoración
- billing: más claridad y confianza, menos ornamentación
- promociones/ads: más estructura de campaña/estado/rendimiento

### Componentes clave

- `KPIHeader`
- `TrendPanel`
- `BillingSummaryCard`
- `InvoiceTable`
- `PlanStatusCard`
- `CampaignTable`
- `PromotionList`

---

## 16. Fase 9 — admin frontend

### Alcance

- `/admin`
- observabilidad
- moderation
- verification queue
- catalog quality
- governance pages
- insights

### Objetivo

Diferenciar claramente admin de negocio.

### Reglas admin

1. Más densidad informativa es aceptable.
2. Menos hero, más control.
3. Más tablas, colas, filtros y estados.
4. Más claridad operativa, menos ornamentación.
5. El admin no debe parecer una landing premium.

### Patrones recomendados

- dashboards de control compactos
- tablas con filtros persistentes
- queue views
- banners de riesgo o prioridad
- cards solo cuando agreguen valor real

---

## 17. Fase 10 — responsive and accessibility stabilization

### Responsive

Debe revisarse sistemáticamente:

- desktop ancho
- laptop mediano
- tablet
- mobile grande
- mobile pequeño

### Reglas mínimas

1. No depender de desktop-first visual hacks.
2. Sidebars deben colapsar bien.
3. Filters deben wrapear o colapsar correctamente.
4. Tablas complejas deben tener estrategia mobile.
5. Forms largos deben mantenerse legibles.

### Accesibilidad mínima

- headings correctos
- foco visible
- contraste suficiente
- labels correctos
- errores enlazados a campos
- navegación usable por teclado en flows clave

---

## 18. Fase 11 — cleanup y consolidación

Esta fase existe para evitar que el refactor deje basura atrás.

### Debe incluir

- eliminar componentes duplicados
- eliminar variantes antiguas no usadas
- consolidar tokens/constantes
- limpiar estilos locales innecesarios
- remover wrappers heredados
- documentar patrones nuevos

### Regla

Ningún refactor se considera cerrado si solo agrega nuevas piezas sin retirar las viejas.

---

## 19. Rutas y áreas sugeridas por sprint

## Sprint 1 — foundation

- layout primitives
- app shell base
- cards base
- section headers
- filter bar
- empty states
- tokens y spacing

## Sprint 2 — auth + discovery

- login/register/recovery
- listado de negocios
- business cards
- detalle de negocio

## Sprint 3 — business dashboard

- dashboard overview
- summary cards
- acciones rápidas
- estado de claim/verificación

## Sprint 4 — operación core

- bookings
- messaging
- WhatsApp
- CRM

## Sprint 5 — growth y billing

- analytics
- promotions
- ads
- billing

## Sprint 6 — admin

- dashboard admin
- moderation
- catalog quality
- observabilidad

## Sprint 7 — cleanup

- deuda visual
- responsive QA
- accesibilidad
- eliminación de legacy UI

---

## 20. Mapeo de componentes a crear o unificar

## 20.1 Layout

- `AppShell`
- `PublicPageShell`
- `DashboardContentLayout`
- `SplitPanelLayout`
- `FormPageLayout`

## 20.2 Structure

- `SectionHeader`
- `PageIntroCompact`
- `ActionBar`
- `Toolbar`
- `FilterBar`

## 20.3 Cards

- `AppCard`
- `MetricCard`
- `StatusCard`
- `QueueCard`
- `InsightCard`
- `EmptyStateCard`

## 20.4 Data display

- `StatGroup`
- `InfoList`
- `DataTableWrapper`
- `EntityListItem`
- `TimelineBlock`

## 20.5 States

- `LoadingState`
- `EmptyState`
- `InlineErrorState`
- `PermissionState`
- `PendingReviewState`

## 20.6 Forms

- `FormSection`
- `FieldHint`
- `FieldError`
- `InlineChoiceGroup`
- `StickyFormActions`

---

## 21. Reglas de implementación para la IA o el equipo

### Regla 1
No rediseñar una pantalla desde cero si el problema real es que faltan primitives.

### Regla 2
Cada pantalla nueva o refactorizada debe construirse usando el sistema base antes de agregar estilos especiales.

### Regla 3
No crear variantes innecesarias de cards, headers, badges o sections.

### Regla 4
Cada cambio visual debe justificar qué mejora en jerarquía, claridad o mantenimiento.

### Regla 5
No usar “hero sections” grandes dentro de áreas operativas salvo casos muy específicos.

### Regla 6
Admin y business deben compartir sistema, pero no densidad ni prioridades visuales idénticas.

### Regla 7
Responsive no se revisa al final; se valida durante cada fase.

### Regla 8
El cleanup de legacy components es parte del trabajo, no trabajo opcional futuro.

---

## 22. Riesgos del refactor

### Riesgo 1 — rehacer demasiado a la vez
Mitigación: ejecutar por fases y por rutas prioritarias.

### Riesgo 2 — inconsistencia entre pantallas nuevas y viejas
Mitigación: foundation primero y cleanup continuo.

### Riesgo 3 — exceso de componentes “temporales”
Mitigación: inventario y política estricta de unificación.

### Riesgo 4 — romper flujos funcionales mientras se mejora UI
Mitigación: cambios visuales controlados, smoke tests y validación por ruta.

### Riesgo 5 — seguir decorando en vez de estructurar
Mitigación: revisar siempre jerarquía y densidad antes de polish visual.

---

## 23. Criterios de aceptación globales

El refactor se considera exitoso si se cumplen estas condiciones:

1. El frontend se ve como un sistema único, no como varias apps cosidas.
2. Las pantallas operativas tienen jerarquía clara y menos ruido.
3. Los layouts soportan crecimiento sin descuadrarse.
4. Auth, discovery, negocio y admin se diferencian sin romper coherencia.
5. Hay menos componentes duplicados y menos estilos locales ad hoc.
6. El responsive deja de romperse al agregar módulos.
7. Los estados vacíos, pendientes, errores y cargas son consistentes.
8. El dashboard de negocio deja de depender de un hero sobredimensionado.
9. Las superficies densas se comportan como herramientas de trabajo reales.
10. El mantenimiento del frontend mejora mediblemente.

---

## 24. Definition of Done por pantalla refactorizada

Cada pantalla o flujo se considera terminado solo si:

- usa layout y primitives del sistema
- tiene jerarquía visual clara
- no presenta spacing arbitrario
- no duplica patrones ya existentes
- funciona en mobile/tablet/desktop relevantes
- tiene loading, empty y error states coherentes
- no introduce deuda visual evidente
- no deja componentes legacy huérfanos si ya fueron reemplazados

---

## 25. Qué no hacer

- no seguir arreglando solo con padding y margin locales
- no crear una card nueva para cada módulo
- no usar gradientes fuertes como solución a falta de jerarquía
- no inflar dashboards con copy narrativo excesivo
- no mezclar comportamiento de discovery con comportamiento de SaaS dentro del mismo patrón visual
- no hacer admin “bonito” a costa de perder densidad útil
- no dejar cleanup para “después” indefinidamente

---

## 26. Instrucción sugerida para la IA implementadora

Texto sugerido:

> Ejecuta el refactor del frontend de AquiTa.do por fases. Prioriza foundation, app shell, navegación y componentes base antes de intervenir módulos individuales. Usa un sistema consistente de layout, cards, estados y jerarquía visual. No resuelvas los problemas con parches locales aislados. Mantén coherencia entre discovery, negocio y admin, diferenciando densidad y propósito según el rol. El objetivo es transformar el frontend en un sistema mantenible, claro, responsive y escalable.

---

## 27. Veredicto práctico

El siguiente gran salto de calidad para AquiTa.do no depende de agregar más features, sino de reorganizar visual y estructuralmente el frontend para que pueda soportar la complejidad que ya tiene.

Este plan existe para que ese salto se haga con orden, criterio y control.
