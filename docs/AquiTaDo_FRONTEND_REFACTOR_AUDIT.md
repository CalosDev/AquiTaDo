# AquiTa.do — Frontend Refactor Audit

Fecha: 2026-04-15
Estado: Auditoria inicial de ejecucion
Fuente: `AquiTaDo_FRONTEND_REFACTOR_EXECUTION_PLAN.md` §7

---

## 1. Inventario actual

### Layouts existentes

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Main shell publico | `apps/web/src/layouts/MainLayout.tsx` | `REFINE` |
| Shell auth | `apps/web/src/layouts/AuthLayout.tsx` | `KEEP` |
| Shell negocio | `apps/web/src/layouts/DashboardLayout.tsx` | `KEEP` |
| Shell admin | `apps/web/src/layouts/AdminLayout.tsx` | `KEEP` |
| Auth page wrapper | `apps/web/src/components/auth/AuthPageShell.tsx` | `MERGE` |

### Sidebars y wrappers de navegacion

| Pieza | Uso actual | Estado |
| --- | --- | --- |
| Sidebar negocio | workspace, modulos operativos y contexto activo | `KEEP` |
| Sidebar admin | control, catalogo, observabilidad y seguridad | `KEEP` |
| Aside auth | branding + puntos de apoyo | `REFINE` |
| Workspace strip | tabs de trabajo dentro de pagina | `KEEP` |

### Cards y contenedores repetidos

| Pieza | Archivo / patron | Estado |
| --- | --- | --- |
| `SummaryCard` | `apps/web/src/components/ui/SummaryCard.tsx` | `MERGE` con `MetricCard` |
| `SectionCard` | `apps/web/src/components/ui/SectionCard.tsx` | `MERGE` con `AppCard` |
| `card-filter` / `card-list` / `card-form` | clases CSS estructurales | `KEEP` |
| Bloques de auth con `space-y-1.5` + label + input | `Login`, `Register`, `ForgotPassword`, `ResetPassword` | `REPLACE` |
| Tablas envueltas con `overflow-x-auto` local | admin y modulos densos | `REPLACE` |

### Estados UX existentes

| Pieza | Archivo | Estado |
| --- | --- | --- |
| `EmptyState` | `apps/web/src/components/ui/EmptyState.tsx` | `KEEP` |
| `LoadingState` | `apps/web/src/components/ui/LoadingState.tsx` | `KEEP` |
| `ErrorState` | `apps/web/src/components/ui/ErrorState.tsx` | `KEEP` |
| `SuccessState` | `apps/web/src/components/ui/SuccessState.tsx` | `KEEP` |
| `PartialDataState` | `apps/web/src/components/ui/PartialDataState.tsx` | `KEEP` |
| `NoPermissionState` | `apps/web/src/components/ui/NoPermissionState.tsx` | `MERGE` con `PermissionState` |
| `FeatureDisabledState` | `apps/web/src/components/ui/FeatureDisabledState.tsx` | `KEEP` |

### Modulos con mayor dolor estructural

- `apps/web/src/pages/AdminDashboard.tsx`
- `apps/web/src/pages/DashboardBusiness.tsx`
- `apps/web/src/pages/BusinessesList.tsx`
- `apps/web/src/pages/dashboard-business/OperationsWorkspace.tsx`
- `apps/web/src/pages/dashboard-business/OrganizationWorkspace.tsx`

---

## 2. Duplicaciones detectadas

### Formularios

- Repeticion del patron label + input + hint/error en auth y formularios operativos.
- Acciones de submit pegadas al contenido sin un patron comun de cierre (`StickyFormActions` aun no existe).
- Radios y elecciones inline construidas localmente en `Register.tsx`.

### Estructura

- Headers de seccion resueltos con combinaciones manuales de `p`, `h1/h2`, `actions` y copy.
- Wrappers de tablas y listas densas construidos ad hoc con `overflow-x-auto`, `border-b`, `p-4`.
- Avisos contextuales implementados como bloques locales en vez de un `InlineNotice`.

### Naming

- `SummaryCard` y `SectionCard` ya cumplen parte del rol de `MetricCard` y `AppCard`, pero el naming no esta alineado con el plan.
- `AuthPageShell` ya funciona como `FormPageLayout` especializado, pero todavia no se apoya en primitives base reutilizables.

---

## 3. Clasificacion por accion

### KEEP

- `DashboardLayout`
- `AdminLayout`
- `AuthLayout`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `SuccessState`
- `PartialDataState`
- `FeatureDisabledState`

### REFINE

- `MainLayout`
- `AuthPageShell`
- `PageFeedbackStack`
- `PageBlockingLoader`
- `BusinessesList`
- `AdminDashboard`

### MERGE

- `SummaryCard` → `MetricCard`
- `SectionCard` → `AppCard`
- `NoPermissionState` → `PermissionState`
- `AuthPageShell` + nuevo `FormPageLayout`

### REPLACE

- Wrappers manuales de fields en auth
- Radios inline locales de registro
- Wrappers locales de tablas/listados
- Notices contextuales hechos con `div` ad hoc

### REMOVE

- Patrones nuevos que queden totalmente cubiertos por primitives fundacionales.
- Variantes futuras duplicadas de cards/headers/forms si ya existe equivalente en `components/ui`.

---

## 4. Riesgos visuales altos

1. Crear nuevas pantallas operativas con wrappers locales seguiria expandiendo deuda de UI.
2. Admin, negocio y auth ya comparten lenguaje visual, pero no todavia primitives comunes para forms, tables y notices.
3. El naming actual de la libreria compartida no refleja todavia el sistema definido por el plan, lo que facilita que cada modulo vuelva a inventar su propia pieza.

---

## 5. Salida minima de esta fase

- Inventario base completado.
- Duplicaciones prioritarias identificadas.
- Puntos de alto riesgo listados.
- Base clara para ejecutar Fase 1: foundation UI.
