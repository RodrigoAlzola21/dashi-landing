# Revisión enfocada en errores críticos/medios (sin cambios cosméticos)

## Cambios aplicados en esta iteración

### 1) Error tipográfico (impacto bajo, corrección directa)
- **Aplicado:** Se corrigió `NO esta` -> `NO está` en comentarios de Apps Script.
- **Por qué sí vale la pena:** evita ambigüedad en instrucciones operativas del webhook y mejora la mantenibilidad.

### 2) Falla funcional en fallback de envío (impacto medio)
- **Aplicado:** En `sendMode=auto`, el fallback a `no-cors` ya no depende solo de `TypeError`; también cubre `AbortError` (timeout).
- **Por qué es relevante:** en redes inestables, un timeout es un caso frecuente. Antes se mostraba error al usuario aun cuando podía existir una vía de compatibilidad viable.

### 3) Discrepancia de documentación (impacto medio)
- **Aplicado:** Se corrigió el arranque en `README.md` raíz para apuntar a `Landing/index.html` y se aclaró el uso de carpetas espejo (`Landing/` vs `Landing/Landing/`).
- **Por qué es relevante:** evita onboarding fallido y edición accidental de la copia no canónica.

---

## Sugerencias adicionales (priorizadas, solo críticas/medias)

### A) CRÍTICA: evitar divergencia entre `Landing/` y `Landing/Landing/`
**Riesgo actual**
- Hay duplicación de archivos fuente (`index.html`, `README.md`, `apps-script/Code.gs`) en dos rutas.
- Esto aumenta riesgo de arreglar un bug en una carpeta y dejar la otra desactualizada.

**Tarea propuesta**
- Definir una fuente única de verdad (`Landing/`) y automatizar sincronización a `Landing/Landing/` con script (`npm script` o shell) + verificación en CI.

**Criterio de aceptación**
- Si hay diferencias no autorizadas entre ambas carpetas, CI falla con mensaje claro.

### B) MEDIA: endurecer telemetría de fallback
**Riesgo actual**
- El debug panel informa fallback, pero no tipifica explícitamente la causa (`TypeError` vs `AbortError`) de forma estructurada.

**Tarea propuesta**
- Incluir `fallbackReason` en logs debug (`network_type_error`, `request_timeout`, etc.).

**Criterio de aceptación**
- En `?debug=1`, cada fallback queda trazado con causa y timestamp.

### C) MEDIA: pruebas automatizadas para regresiones de envío
**Riesgo actual**
- El flujo de fallback depende de condiciones de error de runtime y es fácil romperlo con refactors.

**Tarea propuesta**
- Extraer la decisión de fallback a función pura (p.ej. `shouldFallbackToNoCors(sendMode, error)`) y testearla en unit tests.

**Criterio de aceptación**
- Cobertura mínima de casos: `auto+TypeError`, `auto+AbortError`, `auto+Error genérico`, `normal+TypeError`, `no-cors+Error`.

### D) MEDIA: revisar anti-spam por WhatsApp vacío en backend (defensa en profundidad)
**Riesgo actual**
- Aunque backend valida `whatsapp` requerido, `getAntiSpamKeys_` calcula keys sobre dígitos; conviene proteger explícitamente contra valores inesperados antes de cachear.

**Tarea propuesta**
- Blindar `getAntiSpamKeys_`/`assertAntiSpamAllowed_` para no operar con key inválida cuando el input llegue corrupto.

**Criterio de aceptación**
- Requests con payload malformado nunca generan claves vacías ni colisiones de cache.
