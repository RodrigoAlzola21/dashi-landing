# Dashi Landing (Reseñas + Feedback Privado)

Landing estática para gestión de reputación de Dashi:

- `4–5 estrellas` -> CTA principal a Google Reviews
- `1–3 estrellas` -> formulario de feedback privado + acceso a Google Reviews

## Archivos principales

- `index.html`: landing completa (HTML/CSS/JS vanilla)
- `apps-script/Code.gs`: webhook de Google Apps Script (guardar feedback en Google Sheets)
- `assets/`: logos
- `tools/trim-logo.html`: herramienta local para recortar PNG por alpha

## Cómo abrir localmente

No requiere build.

1. Abrí `index.html` en el navegador.
2. Probá el flujo de estrellas y formularios.
3. Nota: esta carpeta es una copia espejo de `Landing/`; priorizá cambios en `Landing/` y sincronizá solo cuando sea necesario.

## Webhooks configurados

### Google Reviews

Se configura en:

- `GOOGLE_REVIEW_URL` dentro de `index.html`

### Feedback privado (Apps Script)

Se configura en:

- `FEEDBACK_WEBHOOK_URL` dentro de `index.html`

## Modo debug (frontend)

Por defecto está desactivado.

Activar agregando query params:

- `?debug=1`

Opciones de envío:

- `?debug=1&sendMode=normal` (recomendado para QA, intenta leer respuesta)
- `?debug=1&sendMode=auto` (fallback a `no-cors` si falla por CORS)
- `?debug=1&sendMode=no-cors` (envía sin confirmación de respuesta)

## Qué muestra el debug panel

- Estado de envío (`submit recibido`, `Enviando...`)
- URL del webhook
- Payload enviado
- `status` de respuesta (si aplica)
- Body JSON/texto de respuesta (si aplica)
- Error (si falla)

## Deploy de Apps Script (manual)

1. Abrí el proyecto de Apps Script del webhook.
2. Pegá el contenido de `apps-script/Code.gs`.
3. Verificá que el script esté:
   - vinculado al spreadsheet correcto, o
   - con `FALLBACK_SPREADSHEET_ID` configurado si no está bound
4. Redeploy como **Web App**.
5. Probá un envío desde la landing con `?debug=1&sendMode=normal`.

## Hojas usadas en Google Sheets

El script trabaja con:

- `Respuestas` (crea si no existe)
- `Logs` (crea si no existe)

## Diagnóstico rápido

### Si `Logs` se llena pero `Respuestas` no

El POST llega, pero falla la escritura (`appendRow`, hoja, permisos o validación).

### Si `Logs` no se llena

El POST no está llegando al deployment correcto (URL, permisos, deploy viejo).

### Si el frontend cae en `no-cors`

Se pudo enviar, pero el navegador no pudo leer la respuesta (compatibilidad/CORS).
Revisar `Logs` y `Respuestas`.

## Logo recortado

La landing intenta cargar:

1. `assets/dashi-logo-cropped.png`
2. fallback a `assets/dashi-logo.png`

Importante:

- Si ambos archivos son iguales (mismo contenido), la mejora visual no cambia.
- Para que el logo ocupe menos espacio real, `dashi-logo-cropped.png` debe ser un recorte verdadero (sin padding transparente extra).

## Publicación / preview

El HTML tiene:

- `meta robots noindex,nofollow`

Esto es útil si lo subís a GitHub Pages solo como preview temporal.

## Notas de seguridad (mínimas)

- El webhook queda visible en el frontend (normal en landing estática).
- Hay honeypot + validaciones básicas de longitud.
- Si el repo va a ser público y el tráfico sube, conviene agregar mitigación de spam adicional del lado Apps Script.
