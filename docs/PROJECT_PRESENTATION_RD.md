# AquiTa.do - Presentacion RD Reconciliada

Fecha de corte: 2026-03-30

## 1) Resumen ejecutivo

AquiTa.do llega a cierre de marzo 2026 con una fotografia materialmente mejor que la descrita por el analisis externo original. La plataforma ya no esta en etapa de "resolver huecos basicos" para inspirar confianza, sino en una fase de consolidacion donde la prioridad pasa por medir, afinar y preparar la siguiente capa de crecimiento.

Al reconciliar el documento externo con el estado real del repo, el balance correcto queda asi:

- Lo ya resuelto cubre los frentes que mas afectaban demo y adopcion: SEO tecnico base, slugs publicos, Open Graph, JSON-LD, 2FA obligatorio para admin, recuperacion de contrasena, moderacion preventiva previa a verificacion, experiencia lista/mapa integrada, geolocalizacion guiada, upload real de avatar y login social con Google.
- Lo que sigue parcial ya no es un bloqueo de operacion sino una decision de escala: la arquitectura SEO-first publica con SSR/ISR sigue siendo una evolucion futura, no una deuda urgente para operar.
- Lo pendiente real se movio hacia explotacion operativa y optimizacion iterativa: alertas y entregabilidad de correo, afinado de reglas de confianza, mejoras de onboarding/copy y una siguiente capa SEO cuando el canal organico sea prioridad comercial.

Conclusion ejecutiva: el proyecto ya absorbio la mayor parte del backlog critico identificado en el reforzamiento. La recomendacion correcta ahora no es "cerrar brechas basicas", sino convertir lo ya construido en una operacion medible, confiable y lista para escalar.

## 2) Estado actual verificado

- Plataforma web + API funcional en monorepo con roles `USER`, `BUSINESS_OWNER` y `ADMIN`.
- SEO tecnico base ya incorporado: `robots.txt`, `sitemap.xml`, canonical, OG/Twitter y JSON-LD por ficha.
- URLs publicas por slug para negocios, con detalle publico enriquecido.
- Seguridad reforzada para administracion con 2FA obligatorio en login admin y pantalla dedicada para su gestion.
- Modulo de verificacion operativo con envio a revision, premoderacion preventiva, revision administrativa y cola de trabajo unificada.
- Flujo de recuperacion de contrasena ya disponible con token temporal, email transaccional y pantalla de reset.
- Registro y login con Google ya disponibles para reducir friccion de onboarding.
- Registro y edicion de negocio ya no dependen de latitud/longitud manual; ahora usan direccion, geocodificacion y ayudas de ubicacion.
- El formulario de negocio ya anticipa senales de premoderacion y visibilidad con guia accionable antes de publicar.
- Listado publico ya integra modo lista/mapa con filtros sincronizados.
- Perfil de usuario ya usa upload gestionado de avatar en lugar de URL manual.
- Se incorporo una barrera automatica contra mojibake con `pnpm check:encoding` para evitar reintroducir textos rotos.
- El tracking de growth ya captura share de ficha, recovery, Google OAuth y CTA de contacto con contexto de placement para analisis operativo.
- Admin ya resume adopcion de lista/mapa, filtros, selecciones en mapa y tasa de liberacion de premoderacion para leer falsos positivos.
- El onboarding de negocios ya deja trazas por paso y publicacion completada, con alertas accionables cuando la friccion sube.
- Admin ya compara la ventana actual contra la previa para recovery, mapa, premoderacion y onboarding sin depender de lectura manual externa.
- Las alertas accionables ya exponen owner, SLA, cadencia y siguiente accion para bajar el tiempo de respuesta operativo.
- La premoderacion ya separa severidad y clusters de riesgo para distinguir mejor problemas de contenido, contacto, identidad o velocidad.
- Existe un playbook operativo base para recovery, 2FA admin y premoderacion, apoyado por la vista de observabilidad admin.

## 3) Hallazgos reconciliados

| Hallazgo | Estado | Impacto | Siguiente accion |
| --- | --- | --- | --- |
| SEO tecnico base (robots, sitemap, canonical, OG, JSON-LD) | Resuelto | Alto | Mantener QA SEO y conectar Search Console/analytics. |
| Arquitectura SEO-first publica con SSR/ISR para escalar | Parcial | Alto | Mantener Vite actual para operacion y planificar migracion del dominio publico cuando SEO entre como frente comercial prioritario. |
| 2FA obligatorio para cuentas admin | Resuelto | Alto | Mantener como control obligatorio y cerrar playbook de recuperacion/admin support. |
| Base de KYC y moderacion administrativa | Resuelto | Alto | Seguir ampliando cobertura sin reabrir el problema como si no existiera. |
| Moderacion preventiva previa a verificacion | Resuelto | Critico | Afinar scoring y reglas con base en la nueva lectura de release rate y top razones. |
| Recuperacion de contrasena | Resuelto | Critico | Medir entrega y uso real del flujo; agregar observabilidad operativa del email. |
| Encoding visible en UI | Resuelto | Critico | Mantener barrido con `check:encoding` y revisar copy en cada feature nueva. |
| Latitud/longitud editables en registro y edicion | Resuelto | Critico | Afinar experiencia visual de direccion/mapa segun feedback real. |
| Vista publica lista/mapa | Resuelto | Alto | Optimizar conversion usando los eventos de filtros, cambios de vista, selecciones en mapa y clicks ya capturados. |
| CTA sticky, compartir y negocios similares/cercanos | Resuelto | Medio | Explotar los eventos ya instrumentados y optimizar con datos reales. |
| Breadcrumbs y metadata contextual en listados | Resuelto | Medio | Mantener consistencia en nuevas rutas SEO. |
| Campo URL para foto de perfil | Resuelto | Medio | Mantener almacenamiento gestionado y revisar limites/politicas de archivos. |
| Google OAuth / login social | Resuelto | Medio | Analizar embudo de onboarding antes de evaluar un segundo proveedor. |
| Prefijos internos de categorias visibles al usuario | Desactualizado | Bajo | Mantener vigilancia visual, pero el problema no se reproduce en el estado actual. |

## 4) Capacidades ya implementadas que cambian la lectura del analisis

### 4.1 Lo que ya no debe tratarse como gap estructural

- SEO tecnico base ya existe en el frontend actual.
- El acceso ya no depende de una sola credencial local: hay recuperacion de contrasena y login con Google.
- La seguridad admin ya no depende solo del cliente: el login exige 2FA para cuentas admin.
- La plataforma ya tiene base real de KYC, premoderacion y revision, por lo que el backlog ahora debe enfocarse en endurecer y medir, no en "crear moderacion desde cero".
- El onboarding de negocio ya no expone coordenadas tecnicas como dato manual para el usuario final.
- El onboarding ya no deja al usuario adivinar por que lo bloquearian: la UI muestra senales preventivas y acciones sugeridas antes de publicar.

### 4.2 Lo que ya aporta valor visible en experiencia

- Sidebar/CTA sticky en ficha de negocio.
- Compartir desde la ficha y contacto directo por WhatsApp.
- Breadcrumbs SEO en listados.
- Seccion de negocios cercanos al final del detalle.
- Toggle real de lista/mapa con filtros sincronizados.
- Upload gestionado de avatar y acceso social con Google.
- Multi-tenant, observabilidad y operaciones admin ya presentes como base de escalado.

### 4.3 Lo que el analisis externo detecto bien, pero hoy cambia de naturaleza

- El problema de acceso ya no es ausencia de reset o login social; ahora pasa a ser calidad de medicion, entregabilidad y soporte operativo.
- El frente de confianza ya no es "falta moderacion", sino mejorar precision y productividad de la moderacion preventiva existente.
- El frente SEO ya no es base tecnica, sino decidir cuando conviene llevar el dominio publico a una arquitectura SEO-first de siguiente nivel.

## 5) Gaps reales pendientes

### 5.1 P0 actual: operacion y soporte

- Operar consistentemente las alertas ya disponibles con la rutina, owner y SLA visibles en admin.
- Expandir el playbook base de soporte para 2FA admin, reset de contrasena y resolucion de premoderacion con procedimientos de escalamiento y cierre.
- Revisar entregabilidad y trazabilidad del correo transaccional en entornos reales.
- Mantener QA funcional periodica de los flujos nuevos con criterios de soporte.

### 5.2 P1 de conversion y calidad

- Afinar copy y microinteracciones sobre la base ya estabilizada de encoding y de la nueva guia preventiva en onboarding.
- Seguir afinando reglas de premoderacion con datos reales de falsos positivos, aunque ya existe una lectura mas rica por severidad y cluster.
- Optimizar la experiencia lista/mapa segun uso real de filtros, seleccion y navegacion.
- Optimizar el onboarding de negocios usando el funnel por pasos y las alertas de friccion ya disponibles.

### 5.3 P2 estrategico

- Planificar la migracion del dominio publico a una capa SEO-first con SSR/ISR cuando el canal organico lo justifique.
- Conectar dashboards, tendencias y alertas con SLAs operativos antes de abrir nuevos modulos secundarios.
- Seguir optimizando onboarding de negocios para reducir tiempo a publicacion confiable y medible.

## 6) Backlog priorizado reconciliado

### Semana 1 - Operacion con disciplina

1. Operar alertas y rutina de lectura para Email, Recovery, lista/mapa, onboarding y premoderacion en base a los paneles ya existentes.
2. Expandir el playbook operativo con respuestas estandar, owners y escalamiento por tipo de incidente.
3. Hacer QA funcional completa de recovery, Google OAuth, avatar, premoderacion y lista/mapa con criterios de soporte.
4. Auditar entregabilidad real del correo transaccional en los entornos de uso.

### Semanas 2-3 - Conversion y calidad de decision

1. Afinar copy y UX de onboarding con base en el funnel por pasos ya capturado.
2. Mejorar scoring y razones de moderacion preventiva usando los datos de release rate y top razones.
3. Optimizar la experiencia lista/mapa segun CTR, seleccion y conversion.
4. Usar las comparativas temporales ya disponibles para detectar cambios semanales antes de abrir nuevos frentes.

### Mes 2+ - Escala y ventaja competitiva

1. Definir la migracion del dominio publico a una capa SEO-first con SSR/ISR cuando SEO entre como prioridad comercial.
2. Profundizar reputacion y confianza con denuncias, scoring y automatizaciones mas finas.
3. Seguir optimizando onboarding de negocios para reducir tiempo a publicacion confiable.
4. Fortalecer analitica de producto antes de ampliar modulos secundarios.

## 7) Decision de producto recomendada

La lectura correcta del proyecto al 30 de marzo de 2026 es:

- No partir de cero en SEO, acceso, seguridad admin, KYC ni experiencia publica base; esas capacidades ya existen y ya fueron integradas.
- Concentrar el siguiente ciclo en observabilidad, operacion y conversion sobre funcionalidades ya entregadas.
- Usar el analisis externo como insumo de direccion, no como fotografia literal del estado actual.

Si se ejecuta el bloque de Semana 1, AquiTa.do pasa de "producto con brechas visibles" a "operacion con fundamentos listos para medir y escalar", que es una posicion mucho mas util para demo, pilotos y conversaciones con aliados.
