# apps/web

Frontend de producción basado en React + Vite + TypeScript + TailwindCSS.

Este módulo NO es experimental. Cualquier cambio puede impactar usuarios reales.

---

# 🚨 Regla principal

NO romper comportamiento existente.

Si no entiendes una parte del código → no la modifiques todavía.

---

# 🧠 Modo de trabajo obligatorio

Antes de cualquier cambio:

1. Analizar el componente
2. Identificar dependencias
3. Detectar riesgos
4. Definir alcance mínimo

Nunca saltar directamente a código en cambios no triviales.

---

# 📁 Reglas críticas

## Debes leer antes de tocar código

- `apps/web/AGENTS.md` (obligatorio)

---

# ⚠️ Zonas críticas del frontend

Cambios en estas áreas requieren análisis previo:

- routing
- searchParams / URL state
- auth state
- formularios
- loading / error / empty states
- hooks con side effects (`useEffect`)
- sincronización con backend
- PWA (service worker, cache)
- SEO / metadata
- tracking / analytics

---

# ❌ Prohibido

- Reescribir componentes grandes sin diagnóstico
- Cambiar rutas sin revisar impacto global
- Modificar `useEffect` sin analizar dependencias
- Eliminar lógica sin entender su propósito
- Mezclar refactor + feature en un mismo cambio
- Introducir patrones nuevos sin consistencia
- Cambiar estilos globales sin revisar UI completa

---

# 🧩 Componentes grandes

Si un componente mezcla:

- data fetching
- estado complejo
- URL state
- lógica de negocio
- UI
- tracking
- SEO

Entonces:

1. NO lo refactorices de golpe
2. Divide en fases
3. Empieza por:
   - componentes visuales
4. Luego:
   - hooks simples
5. Deja para el final:
   - searchParams
   - auth
   - lógica compleja

---

# 🎯 Prioridades del frontend

1. estabilidad visual
2. UX
3. correctitud funcional
4. consistencia
5. performance
6. elegancia

---

# 🧪 Validación obligatoria

Después de cada cambio debes comprobar:

- desktop
- mobile
- loading state
- error state
- empty state
- usuario autenticado
- usuario no autenticado
- datos largos / edge cases

---

# 📡 PWA

Cambios en PWA requieren extremo cuidado:

- service worker
- cache
- offline fallback
- actualización de versión

No modificar sin plan de validación.

---

# 🔍 SEO

Si el cambio afecta SEO:

- no romper canonical
- no duplicar JSON-LD
- validar rutas públicas
- validar slugs

---

# 📊 Tracking

No cambiar eventos sin confirmar:

- nombre
- payload
- contexto

---

# 🧭 Filosofía

Este frontend no se “mejora” agresivamente.

Se evoluciona con cambios:
- pequeños
- controlados
- verificables

---

# ⚙️ Cómo trabajar con Codex

Siempre iniciar con:

```txt
Modo: DIAGNOSTICO

Analiza este componente antes de modificarlo