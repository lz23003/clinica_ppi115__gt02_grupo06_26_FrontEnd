# GalenoSV — frontend

Aplicación SPA/PWA estática desarrollada con ECMAScript nativo y Web Components, sin frameworks de UI. Mocha, Chai y Sinon se usan únicamente para pruebas. Los tickets PDF se generan en Jakarta EE y el navegador descarga la respuesta como `Blob`.

## Estructura modular

```text
GalenoFE/
├── assets/                 # Identidad visual e iconos
├── src/
│   ├── core/
│   │   ├── router.js       # Enrutador SPA con rutas hash
│   │   └── routes.js       # Mapa de rutas y parámetros
│   ├── components/
│   │   ├── login.component.js
│   │   ├── citas.component.js
│   │   ├── cita-card.component.js
│   │   ├── dashboard.component.js
│   │   └── consulta.component.js
│   ├── pages/
│   │   └── galeno-placeholder.js
│   ├── app.js              # Componente raíz, instalación y actualizaciones
│   ├── api.js              # Fachada de compatibilidad para personas
│   ├── api.service.js      # Cliente REST, errores, Bearer token y cola offline
│   ├── offline-queue.js    # Outbox IndexedDB y sincronización pendiente
│   ├── offline-strategies.js # Respuestas REST amigables sin conexión
│   ├── pwa.js              # Registro testeable del Service Worker
│   ├── persona-app.js      # Componente de personas ya existente
│   └── personas-worker.js  # Web Worker del directorio
├── tests/
│   ├── js/lib/             # Mocha, Chai y Sinon locales para las pruebas
│   ├── api.browser.js      # REST, headers, token y consultas (Mocha)
│   ├── components.browser.js # Componentes y flujos (Mocha)
│   ├── offline.browser.js  # Cola IndexedDB real (Mocha)
│   ├── offline.test.js     # Cola IndexedDB y fallback offline
│   ├── sw.browser.js       # Registro del Service Worker (Mocha)
│   ├── browser.js          # Inicializa Mocha y los módulos de prueba
│   ├── index.html          # Runner de pruebas en navegador
│   └── routes.test.js      # Pruebas del enrutamiento
├── index.html              # Entrada y plantilla del componente raíz
├── manifest.json           # Metadatos de instalación PWA
├── service-worker.js       # Cache del app shell y fallback offline
└── styles.css              # Estilos propios responsive
```

## Ejecutar en desarrollo

Desde esta carpeta inicia un servidor estático, por ejemplo:

```bash
python3 -m http.server 5500
```

Abre `http://localhost:5500/#/citas`. El `api-base-url` de `index.html` apunta al backend local de desarrollo:

```html
<meta name="api-base-url" content="http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/">
```

Como el frontend en el puerto `5500` y el REST en `9080` usan orígenes distintos, `CorsFilter` permite CORS para `http://localhost:5500` y `http://127.0.0.1:5500`, incluidos los encabezados `Content-Type` y `Authorization`. En producción, ajusta la lista de orígenes permitidos; CORS no reemplaza autenticación. Si frontend y backend se despliegan bajo el mismo origen, se puede cambiar el valor por una ruta relativa.

## Funcionalidades

- Diseño responsive con CSS Grid y navegación para la vista de personas.
- CRUD con `fetch`, `async`/`await`, listado paginado e indicador de errores.
- Búsqueda sin distinción de acentos en la página cargada, procesada en un Web Worker.
- Componente `persona-app` con Shadow DOM, Custom Element Registry, plantilla y slots.
- Proxy de estado para reflejar los cambios del componente en la interfaz.
- PWA con manifiesto y service worker para la carcasa estática.
- Los catálogos REST usan caché y las consultas protegidas usan Network First, con una caché privada separada por token de sesión.
- Guardados de consulta sin conexión quedan en una cola IndexedDB y se reintentan con Background Sync o al recuperar conexión.
- Notificaciones del navegador con permiso explícito del usuario.
- La API agrega el token `galenosv.authToken` como Bearer si existe en `localStorage` o `sessionStorage`.

El service worker y la instalación PWA requieren `localhost` o HTTPS. La API REST ofrece `POST /auth/login`, `POST /citas/busqueda`, `GET /citas/{id}/ticket`, catálogos en `/clinicas/all`, `/roles/all` y `/examenes/all`, así como consultas en `/consultas`. La búsqueda pública de citas envía el documento en el cuerpo del POST, junto con clínica y rango de fechas. El guardado de HU4 actualiza `/consultas/{id}` y conserva los pasos en `observaciones` como JSON. Si frontend y backend usan distintos orígenes, configura CORS.

## Rutas SPA

- `#/citas` — HU1, búsqueda pública conectada al contrato `/citas/busqueda`.
- `#/empleados/login` — HU2, autenticación conectada al contrato `/auth/login`.
- `#/empleados/dashboard` — HU3, agenda y catálogos consultados al REST.
- `#/consultas/:consultaId` — HU4, flujo de atención y asignación de exámenes conectado al REST.
- `#/personas` — módulo existente de personas.

El ticket PDF de HU1 se genera en backend con Apache PDFBox. HU3 emite `atender-consulta`, que el enrutador utiliza para abrir HU4 y pasar la consulta seleccionada. HU4 también recupera la consulta por el ID de la ruta y emite eventos para guardado, asignación de exámenes, avance de pasos y cierre.

## Estado actual de integración

Esta sección prevalece sobre cualquier descripción anterior de datos simulados o descargas en cliente:

- `/auth/login` debe devolver un JWT firmado por el backend. Configura `GALENOSV_JWT_SECRET` (mínimo 32 bytes) en el proceso del servidor; sin esa clave, el endpoint responde `503`.
- El login valida el tipo y número de documento contra una asignación activa, tal como solicita HU2; no se agrega contraseña al flujo.
- `GET /citas/{id}/ticket` genera el PDF en backend con Apache PDFBox. El frontend descarga su `Blob`, sin cargar librerías externas.
- El diagnóstico de HU4 es texto libre: el frontend toma el valor del campo y lo envía en el historial JSON de `Consulta.observaciones`.
- Los exámenes seleccionados se envían como `examenIds` a `PUT /consultas/{id}` y se guardan en la relación JPA `Consulta`–`Examen` (`consulta_examen`); las notas, diagnóstico y plan permanecen en el historial JSON de `Consulta.observaciones`.
- El service worker intercepta el host/contexto local configurado en `service-worker.js`. Las lecturas de consultas se cachean con Network First y por token; se borran al cerrar sesión o al iniciar una nueva. En dispositivos compartidos, los datos clínicos offline siguen requiriendo cifrado y una política de retención antes de producción.

## Pruebas

```bash
npm test
```

`npm test` ejecuta todos los archivos Node `tests/*.test.js`. La suite de navegador con Mocha, Chai y Sinon está disponible en `http://localhost:5500/tests/index.html`, usando el servidor estático de desarrollo.

La búsqueda pública de citas necesita conexión: si falla por red, el Service Worker devuelve un error HTTP 503 con un mensaje claro y no guarda una consulta de búsqueda para sincronizar. El dashboard envía `idClinica`, `idRol`, `desde` y `hasta` al REST; cuando recibe un rango, el backend devuelve todas las consultas coincidentes sin el límite paginado general.

La tabla puente de exámenes debe crearse en PostgreSQL aplicando una vez [V2__consulta_examen.sql](../main/resources/db/migration/V2__consulta_examen.sql). No se utiliza `import.sql`.
