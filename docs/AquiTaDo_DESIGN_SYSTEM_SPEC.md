# AquiTa.do - Design System Spec

## Objetivo
Definir y mantener la base visual y estructural del frontend completo sobre un sistema estable, reutilizable y consistente entre marketing, auth, usuario/negocio y admin.

## Principios
- claridad antes que decoracion
- un patron por problema
- densidad controlada
- consistencia inter-roles
- escalabilidad visual
- prioridad operativa

## Arquitectura visual global
- marketing / publico
- auth
- negocio / usuario
- admin

## Design tokens
### Espaciado
Escala base de 4px:
- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48
- 64

### Radios
- sm
- md
- lg
- xl

### Sombras
- sm
- md
- lg

### Bordes
- 1px estandar
- mas fuerte solo para estados

## Escala tipografica
- display-lg
- display-md
- title-xl
- title-lg
- title-md
- title-sm
- body
- caption

Regla:
dashboards no usan display gigantes.

## Layout system
### Contenedores
- publico
- auth
- app shell
- admin

### Grids
- 12 columnas para vistas complejas
- 2 columnas para overview
- 1 columna para forms
- split layout para inbox/CRM

## App shell
### Sidebar
- navegacion
- contexto activo
- estado resumido
- CTA secundario

### Topbar
- titulo / contexto
- acciones globales
- perfil
- busqueda si aplica

## Section headers
Patron:
- titulo
- descripcion breve
- estado opcional
- acciones

## Card system
### `SummaryCard`
Metricas.

### `SectionCard`
Agrupacion funcional.

### `FilterCard`
Filtros y busqueda.

### `QueueCard`
Listas y colas.

### `EmptyStateCard`
Estados vacios.

## Buttons
- primary
- secondary
- ghost
- danger
- icon

## Forms
- labels claros
- helper text
- error consistente
- spacing homogeneo
- acciones coherentes

## Tabs / segmented / accordions
- tabs para vistas hermanas
- segmented para alternancias pequenas
- accordions solo para detalle secundario

## Tables y lists
- tabla cuando hay comparacion columnar
- lista/card cuando importa mas el contexto del item

## Badges y estado
Estados unificados:
- success
- warning
- danger
- info
- neutral
- pending

Ademas, estados de producto:
- reclamado
- no reclamado
- pendiente
- verificado
- suspendido
- free / growth / scale

## Empty / loading / error / skeleton
- loading con skeletons
- empty con CTA claro
- error con explicacion y accion siguiente
- feature-gated con explicacion de por que esta bloqueado

## Navigation patterns
- publico
- usuario
- negocio
- admin

## Densidad visual por area
- comoda: marketing / auth
- media: discovery
- compacta: negocio / admin

## Responsive rules
- mobile: una columna, prioridades claras
- tablet: reduccion controlada
- desktop: aprovechar espacio sin inflar heroes

## Surface-specific guidelines
### Auth
Formulario dominante.

### Discovery
Resultados y filtros claros.

### Dashboard negocio
Header compacto + modulos operativos.

### Claims / verification
Estados y pasos visibles.

### Inbox / WhatsApp / reservas
List + detail.

### CRM
Pipeline entendible.

### Billing
Plan, uso y pagos muy claros.

### Admin
Mas consola, menos ornamento.

## Component naming and reuse rules
Familias sugeridas:
- `AppShell`
- `SidebarNav`
- `SectionHeader`
- `SummaryCard`
- `SectionCard`
- `FilterBar`
- `EmptyState`
- `StatusBadge`
- `FormSection`
- `DataTable`
- `EntityListItem`

## Color semantics
- branding para CTA y acentos
- neutros para la mayor parte del sistema
- colores semanticos para estado

## Motion
- hover sutil
- focus visible
- expand/collapse suave
- nada de motion pesada en paneles operativos

## Accessibility baseline
- contraste
- foco
- labels
- estados no dependientes solo del color
- headings correctos

## QA checklist
- La jerarquia se entiende
- La accion principal es clara
- Usa patrones del sistema
- El espaciado es consistente
- Los estados estan resueltos
- Responsive correcto

## Prioridades de implementacion
1. foundation
2. auth / discovery / dashboard
3. claims / inbox / billing / CRM
4. cleanup y consolidacion

## Definition of Done
- principales superficies usando el mismo sistema
- menos variantes arbitrarias
- sidebar coherente
- responsive sistematico
- nuevas pantallas construibles sin inventar estructura

## Implementacion en el repo
- Tokens, densidad, contenedores y tipografia: `apps/web/src/index.css`
- Foundation base, app shell, sidebar nav y badges: `apps/web/src/components/ui/Foundation.tsx`
- Cards de negocio, claims, billing y timelines: `apps/web/src/components/ui/BusinessPrimitives.tsx`
- Estilos blueprint y estados semanticos: `apps/web/src/styles/blueprint.css`
- Shell autenticado negocio/usuario: `apps/web/src/layouts/DashboardLayout.tsx`
- Shell admin: `apps/web/src/layouts/AdminLayout.tsx`

## Cierre
AquiTa.do necesita apoyarse en un sistema estable, no en decisiones visuales aisladas.
