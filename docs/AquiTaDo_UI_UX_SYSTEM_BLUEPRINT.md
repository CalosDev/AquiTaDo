# AquiTa.do — UI/UX System Blueprint

**Versión:** 1.0  
**Fecha:** 2026-04-14  
**Propósito:** definir una base de rediseño visual, estructural y de interacción para todo AquiTa.do, de manera que el crecimiento funcional del producto no siga rompiendo consistencia, legibilidad, responsive ni jerarquía operativa.

---

## 1. Objetivo del documento

Este documento existe para servir como guía de ejecución para una IA o para un equipo de producto/frontend que deba reorganizar la experiencia completa de AquiTa.do.

La meta no es “ponerlo más bonito”. La meta es:

- estabilizar el sistema visual
- absorber la complejidad del producto sin que el frontend se descuadre
- unificar layout, espaciado, densidad y jerarquía
- separar claramente marketing, discovery, operación SaaS y administración
- reducir fricción visual y técnica a medida que se agregan módulos

Este blueprint debe leerse como un documento de sistema, no como una colección de tweaks aislados.

---

## 2. Diagnóstico general

AquiTa.do ya opera como una combinación de:

- discovery B2C
- SaaS multi-tenant para negocios
- plataforma operativa/admin

Ese crecimiento funcional ya está presente en el producto. El dossier del proyecto deja claro que la app cubre discovery, negocios, organizaciones, planes, billing, promociones, bookings, analytics, messaging, CRM, ads, verificación, favoritos, check-ins y observabilidad. fileciteturn0file0L12-L24 fileciteturn0file0L194-L333

El problema actual no es de falta de diseño. El problema es que **la arquitectura visual no ha evolucionado al mismo ritmo que la arquitectura funcional**.

### Síntomas visibles

- demasiados bloques compitiendo visualmente
- uso excesivo de hero sections dentro de áreas operativas
- sidebars demasiado pesadas
- cards con roles visuales ambiguos
- formularios con demasiada decoración alrededor
- dashboards que mezclan resumen, narrativa, filtros, estados y acciones sin jerarquía firme
- desktop aceptable pero frágil al crecer contenido
- riesgo alto de inconsistencia entre módulos

### Conclusión

La app necesita pasar de un diseño tipo **“pantallas con bloques bonitos”** a un sistema tipo **“producto modular con shell, jerarquía, densidad y patrones reutilizables”**.

---

## 3. Principios rectores

### 3.1 Jerarquía antes que decoración

Cada pantalla debe dejar claro:

1. dónde está el usuario
2. qué está viendo
3. qué puede hacer ahora
4. qué es secundario

Si un elemento no ayuda a eso, debe bajar de intensidad o salir.

### 3.2 El layout debe absorber crecimiento

Cada vista debe soportar:

- más módulos
- más estados
- más métricas
- más filtros
- más acciones
- más vacíos / errores / loading

sin romper composición.

### 3.3 Una pantalla operativa no es una landing

En paneles y dashboards:

- menos hero
- menos copy ornamental
- más información útil arriba
- más acciones claras
- más patrones repetibles

### 3.4 Cada elemento debe tener un rol visual explícito

No todas las tarjetas pueden parecerse. El usuario debe distinguir rápidamente:

- navegación
- métricas
- filtros
- listas
- formularios
- estados vacíos
- alertas
- paneles de acción

### 3.5 Consistencia transversal

Un usuario que vea discovery, auth, dashboard negocio y admin debe sentir que todo pertenece al mismo producto, aunque cada superficie tenga distinta densidad.

### 3.6 Responsive real, no adaptaciones tardías

No se debe diseñar solo para desktop ancho y luego “hacer que baje”. Se deben definir desde el sistema:

- breakpoints
- reglas de colapso
- prioridades de contenido
- comportamiento de sidebars, grids y paneles

---

## 4. Arquitectura de experiencias del producto

AquiTa.do debe organizar su UX en 4 familias. Cada familia comparte branding, pero tiene distinto nivel de densidad.

### 4.1 Marketing / público institucional

Incluye:

- home
- about
- terms
- privacy
- páginas de marketing futuras

Debe ser:

- más expresivo
- más narrativo
- más visual
- menos denso

### 4.2 Discovery público

Incluye:

- listado de negocios
- filtros
- categorías
- provincias
- detalle de negocio
- resultados por intención / zona

Debe ser:

- escaneable
- rápido
- utilitario
- orientado a descubrimiento y conversión

### 4.3 SaaS / negocio / tenant

Incluye:

- dashboard negocio
- claims
- verificación
- reservas
n- inbox
- WhatsApp
- promociones
- campañas
- billing
- CRM
- organización

Debe ser:

- modular
- claro
- compacto
- operativo
- altamente jerárquico

### 4.4 Admin / plataforma

Incluye:

- panel admin
- moderación
- verificación
- observabilidad
- health dashboard
- gobernanza

Debe ser:

- sobrio
- muy funcional
- denso pero ordenado
- más parecido a una consola que a una landing

---

## 5. Diseño de layout global

## 5.1 Contenedores

Definir una escala única de anchura de contenido.

### Contenedores sugeridos

- `container-sm`: auth, legal, formularios simples
- `container-md`: detalle de negocio, profile, settings
- `container-lg`: discovery y páginas mixtas
- `container-xl`: dashboards y admin
- `container-full-shell`: app shell con sidebar + contenido

### Regla

Cada ruta debe declarar explícitamente qué contenedor usa. No dejar anchuras “accidentales” por página.

---

## 5.2 Grid base

### Público / marketing
- máximo 2 columnas fuertes
- mucho aire
- módulos grandes

### Discovery
- sidebar filtros + resultados
- o toolbar superior + grid/listado
- detalle con columna principal + sidebar secundaria

### SaaS
- sidebar persistente + contenido principal
- contenido interno con grids de 12 columnas o equivalentes
- summaries arriba, operación en el centro, administración abajo

### Admin
- navegación persistente
- tablas/listas/moderación como primera clase
- paneles de salud y estados como bloques compactos

---

## 5.3 Espaciado

Adoptar una escala de spacing estricta y limitada.

### Reglas

- no usar paddings arbitrarios por pantalla
- no crear “aire” artificial para compensar desorden
- el espacio debe marcar jerarquía, no decorar

### Jerarquía sugerida

- `space-xs`: separación intra-componente
- `space-sm`: labels, actions, chips
- `space-md`: bloques pequeños dentro de una card
- `space-lg`: separación entre cards de una sección
- `space-xl`: separación entre secciones mayores

---

## 6. App Shell del producto

## 6.1 Shell autenticado

Toda la app autenticada debe compartir una estructura base estable.

### Shell recomendado

- top bar global
- sidebar contextual
- content area principal
- paneles secundarios solo cuando aporten valor real

### Objetivo

Que el usuario siempre entienda:

- en qué zona de la plataforma está
- cuál es su contexto activo
- cuáles son sus áreas de trabajo

---

## 6.2 Sidebar

La sidebar debe dejar de funcionar como “mini landing” y pasar a ser navegación real.

### Debe contener

- identidad compacta
- contexto activo: organización / negocio actual
- estado resumido: claim, verificación, plan
- navegación principal por secciones
- CTA o insight secundario solo al final

### No debe contener

- demasiadas mini-cards decorativas
- exceso de copy secundario
- demasiadas cápsulas/badges por bloque
- múltiples niveles de énfasis visual compitiendo

### Regla visual

La sidebar debe ser más sobria que el contenido principal. Su trabajo es orientar, no protagonizar.

---

## 6.3 Header / top navigation

La barra superior debe unificarse.

### Debe resolver

- navegación principal pública o autenticada
- cambio de contexto si aplica
- CTA principal
- identidad del usuario
- accesos rápidos limitados

### Evitar

- demasiados pills del mismo peso
- headers que cambian demasiado entre pantallas
- exceso de microcopy en la barra

---

## 7. Sistema de componentes visuales

## 7.1 Tipos de tarjeta oficiales

Reducir el sistema a pocos tipos claros.

### 1. Summary Card
Para métricas y KPIs.

- compacta
- número dominante
- label claro
- delta/estado opcional

### 2. Section Card
Para agrupar módulos funcionales.

- título
- descripción breve opcional
- acciones en header
- contenido interno flexible

### 3. Filter Card
Para búsqueda, selects y acciones de refinamiento.

- muy clara
- liviana
- no confundir con lista o informe

### 4. List / Queue Card
Para colas, conversaciones, reservas, claims, revisiones.

- items escaneables
- filtros claros
- estados visibles

### 5. Form Card
Para edición o creación.

- inputs bien agrupados
- CTA claro
- jerarquía por bloques

### 6. Empty State Card
Para estados sin datos.

- mensaje simple
- acción sugerida
- nada de exceso decorativo

### Regla crítica

Cada componente debe poder clasificarse en una de estas categorías. Si no encaja, probablemente esté mezclando responsabilidades.

---

## 7.2 Botones y acciones

### Jerarquía de acciones

- `Primary`: una acción principal por bloque o vista
- `Secondary`: una o dos acciones complementarias
- `Tertiary/Ghost`: acciones de baja prioridad
- `Danger`: solo para acciones destructivas

### Reglas

- no poner 4 CTAs primarios juntos
- no repetir la misma acción en varios lugares de la misma vista
- los headers de sección deben tener pocas acciones

---

## 7.3 Chips / badges

Deben usarse para:

- estado
- clasificación
- conteo pequeño
- metadata breve

No deben usarse para llenar visualmente la pantalla.

### Regla

Si una vista necesita demasiados chips para explicarse, la arquitectura de información está fallando.

---

## 7.4 Tipografía

### Jerarquía sugerida

- display: marketing / hero público solamente
- h1: título principal de pantalla
- h2: título de sección mayor
- h3: título de card o módulo
- body: contenido principal
- small/meta: labels y apoyo

### Regla

Los dashboards no deben abusar de títulos gigantes. El tamaño debe acompañar la función operativa.

---

## 8. Color, contraste y profundidad visual

## 8.1 Intensidad visual

El sistema actual tiene una identidad fuerte. Eso se debe conservar, pero redistribuido.

### Mantener fuerte en:

- branding
- héroes públicos
- CTAs principales
- highlights de marca

### Bajar intensidad en:

- cards comunes
- filtros
- listas
- paneles internos
- formularios

## 8.2 Fondos

Los fondos deben separar contexto, no competir con el contenido.

### Regla

- fondo general suave
- cards principales claras
- contrastes suficientes para lectura
- gradientes reservados para momentos puntuales

## 8.3 Sombras y bordes

Usar sombras y bordes como sistema, no como maquillaje.

- cards informativas: sombra leve
- cards prioritarias: sombra moderada
- modales/paneles flotantes: profundidad clara
- evitar bordes pesados en todas las cards

---

## 9. Blueprint por tipo de superficie

## 9.1 Público / marketing

### Objetivo

Comunicar confianza, claridad y posicionamiento del producto.

### Reglas

- secciones más grandes y narrativas
- menos densidad
- CTA claros
- bloques de confianza y propuesta de valor
- responsivo muy limpio

### Evitar

- trasladar módulos de dashboard a marketing
- usar demasiados componentes del área SaaS en páginas públicas

---

## 9.2 Discovery

### Objetivo

Permitir encontrar negocios rápido.

### Reglas

- resultados escaneables
- filtros claros y plegables
- mapa opcional, no dominante si no aporta
- tarjetas de negocio consistentes
- acción de contacto/reserva claramente visible

### Estructura sugerida

- toolbar superior de filtros rápidos
- sidebar o drawer de filtros avanzados
- resultados en lista o grid
- detalles de negocio con CTA y metadata bien separadas

---

## 9.3 Auth

### Objetivo

Reducir fricción y dejar clarísimo el acceso.

### Reglas

- el formulario debe dominar sobre lo decorativo
- panel lateral opcional y más compacto
- máximo 1 bloque de contexto visual fuerte
- CTA claros
- estados de error y validación muy limpios

### Login

- más utilitario
- menos “landing”
- foco en entrar rápido

### Register

- explicar tipo de cuenta
- no saturar con demasiadas promesas visuales
- estructura progresiva

### Forgot / Reset

- pantallas simples, centradas, sin ruido

---

## 9.4 Dashboard negocio

### Objetivo

Ser un centro de trabajo, no una portada.

### Regla principal

Reducir hero y aumentar visibilidad de módulos útiles above the fold.

### Estructura recomendada

#### Fila 1
- contexto del negocio activo
- estado de claim
- verificación/KYC
- salud del perfil
- 1 o 2 quick actions

#### Fila 2
- operación diaria
  - reservas
  - inbox
  - WhatsApp

#### Fila 3
- crecimiento
  - promociones
  - campañas
  - leads
  - analytics

#### Fila 4
- administración
  - organización
  - miembros
  - billing
  - settings

### Qué evitar

- hero de gran altura
- demasiados chips de estado duplicados
- 3 tarjetas “premium” compitiendo arriba
- mezclar formularios, listas y métricas sin divisiones fuertes

---

## 9.5 Claims y verificación

### Objetivo

Convertir procesos sensibles en flujos claros y verificables.

### Reglas

- mostrar estado actual primero
- luego requerimientos
- luego evidencia / acciones
- luego historial o decisiones

### Patrones

- timeline/status header
- checklist de pasos
- formulario de evidencia
- panel de revisión

No mezclar todo en un solo bloque visual.

---

## 9.6 Reservas, inbox y WhatsApp

### Objetivo

Manejar operación diaria sin caos.

### Patrón recomendado

- filtros arriba
- lista/cola a la izquierda o arriba
- detalle o respuesta a la derecha o abajo
- estados vacíos bien tratados

### Reglas

- no usar cards idénticas para filtro y contenido
- destacar claramente el item seleccionado
- evitar paneles demasiado altos vacíos

---

## 9.7 CRM

### Objetivo

Que el pipeline y los leads se entiendan de inmediato.

### Reglas

- etapas claras
- conteos visibles
- cards de lead escaneables
- historial accesible sin sobrecargar la vista principal

---

## 9.8 Billing, planes y pagos

### Objetivo

Transmitir confianza y control.

### Reglas

- plan actual arriba
- uso/límites claros
- historial y facturas abajo
- acciones sensibles bien aisladas
- diseño más sobrio, menos ornamental

---

## 9.9 Admin / plataforma

### Objetivo

Facilitar operación global de forma robusta.

### Reglas

- diseño más consola, menos marketing
- tablas y colas como centro
- filtros y acciones batch bien definidos
- alertas/health visibles pero compactas
- logs y decisiones con trazabilidad

### Prioridades

- moderación
- verificación
- catálogo
- duplicados
- observabilidad
- seguridad

---

## 10. Estados UX obligatorios

Cada módulo principal debe soportar explícitamente:

- loading
- empty
- error
- success
- partial data
- no permission
- feature disabled

### Regla

No improvisar estados por pantalla. Deben existir componentes base para cada uno.

---

## 11. Responsive blueprint

## 11.1 Desktop ancho

- shell completo
- sidebar visible
- 2–3 columnas cuando aporte valor real

## 11.2 Laptop / desktop medio

- reducir ancho de sidebar
- compactar headers
- evitar cards gigantes
- empezar a colapsar bloques secundarios

## 11.3 Tablet

- sidebar colapsable
- una sola columna dominante
- filtros en drawer
- summaries horizontales desplazables si es necesario

## 11.4 Mobile

- navegación simplificada
- foco en tarea principal
- formularios por pasos si son complejos
- no replicar desktop comprimido

### Regla crítica

El responsive debe rediseñar prioridad, no solo apilar cajas.

---

## 12. Sistema de densidad

Definir tres niveles de densidad y aplicarlos por contexto.

### 12.1 Cómoda

Para marketing, legal, auth.

### 12.2 Media

Para discovery y detalle de negocio.

### 12.3 Compacta

Para dashboards, inbox, admin, CRM, colas.

### Regla

No usar densidad cómoda en módulos operativos complejos. Eso infla la UI y empeora el escaneo.

---

## 13. Reglas de contenido y copy

### Debe ser

- corto
- específico
- orientado a tarea
- alineado al contexto dominicano y al producto real

### Debe evitar

- frases heroicas dentro de paneles operativos
- microcopy redundante
- descripciones largas en cards utilitarias
- repetir el mismo estado en varios lugares

---

## 14. Accesibilidad y usabilidad

### Reglas mínimas

- contraste suficiente
- estados de foco visibles
- targets táctiles adecuados
- labels reales en forms
- iconos nunca solos si la acción no es obvia
- jerarquía semántica de headings
- navegación teclado razonable en paneles

---

## 15. Estrategia de rediseño

No rehacer pantalla por pantalla sin sistema.

### Fase 1 — Fundaciones

Definir y unificar:

- contenedores
- spacing
- breakpoints
- card types
- button hierarchy
- chips
- headings
- empty states
- form patterns
- list patterns

### Fase 2 — Shells globales

Rehacer:

- top navigation
- sidebar autenticada
- shell de dashboard negocio
- shell admin
- shell auth

### Fase 3 — Superficies prioritarias

En este orden:

1. dashboard negocio
2. claims + verificación
3. reservas + inbox + WhatsApp
4. auth
5. discovery
6. admin
7. billing / CRM / ads / promociones

### Fase 4 — Pulido transversal

- responsive fino
- estados vacíos
- mensajes de error
- skeletons
- motion mínima
- consistencia de iconografía

---

## 16. Qué no debe hacer la IA implementadora

- no resolver todo con más gradientes y sombras
- no crear variantes infinitas de cards
- no hacer “parches visuales” por pantalla
- no conservar héroes sobredimensionados dentro del dashboard
- no usar pills y badges para compensar jerarquía pobre
- no dejar la sidebar como mini-dashboard decorativo
- no diseñar desktop primero y mobile al final

---

## 17. Entregables esperados de una implementación correcta

La IA o equipo que ejecute este blueprint debería producir como mínimo:

1. un sistema de layout global
2. un sistema de contenedores y grid
3. una librería reducida de cards reutilizables
4. un app shell unificado
5. una sidebar rediseñada
6. pantallas de auth simplificadas
7. dashboard negocio compacto y jerárquico
8. módulos operativos con patrones lista/filtro/detalle claros
9. responsive robusto
10. guía de uso para futuras pantallas

---

## 18. Criterios de aceptación

Se considerará exitoso el rediseño cuando:

- el dashboard muestre información útil arriba sin depender de un hero gigante
- la sidebar deje de competir visualmente con el contenido
- auth sea clara y rápida de usar
- cada card tenga un rol visual reconocible
- la densidad operativa se sienta ordenada, no inflada
- agregar nuevos módulos no rompa el sistema
- discovery, SaaS y admin se sientan parte del mismo producto, pero con densidad apropiada a cada caso
- laptop y tablet no se vean como desktop comprimido

---

## 19. Veredicto final

AquiTa.do no necesita un “retoque”. Necesita una **normalización de sistema visual**.

El producto ya creció lo suficiente como para exigir:

- jerarquía fuerte
- shells estables
- densidad controlada
- patrones claros
- separación entre marketing, discovery, SaaS y admin

La buena noticia es que el problema no es de identidad ni de ambición. La identidad existe y el producto tiene base funcional sólida. Según el dossier, AquiTa.do ya es un monolito modular serio con discovery, SaaS y operación de plataforma. fileciteturn0file0L479-L487

Por tanto, la dirección correcta no es rediseñar “a ojo”. La dirección correcta es construir un sistema UI/UX que permita que el producto siga creciendo sin que el frontend se rompa cada vez que aparece un nuevo módulo.

---

## 20. Instrucción sugerida para otra IA

> Usa este documento como blueprint global de rediseño UI/UX para AquiTa.do. No hagas cambios aislados por pantalla. Primero define sistema de layout, contenedores, densidad, cards, shell autenticado y jerarquía de acciones. Después rediseña dashboard negocio, auth, módulos operativos, discovery y admin bajo un lenguaje visual coherente. Prioriza claridad, escalabilidad, responsive real y separación entre marketing, discovery, SaaS y plataforma.

