# 2. Pruebas

Las consideraciones del trabajo piden "probar cada característica para asegurarse de que funcione según lo previsto" y documentar esas pruebas. Se hicieron tres tipos:

1. **Pruebas automatizadas de la API** (34 casos), que se ejecutan con un comando.
2. **Pruebas manuales de la interfaz** en el navegador (escritorio, celular y modo oscuro).
3. **Pruebas de despliegue** contra la app publicada en Vercel y la base en Atlas.

## 2.1 Pruebas automatizadas

**Herramientas:** el ejecutor de pruebas incluido en Node.js (`node:test`), `assert` y [supertest](https://github.com/ladjs/supertest), que hace peticiones HTTP a la app de Express sin levantar un servidor.

**Cómo ejecutarlas:**

```bash
npm test
```

**Base de datos de pruebas:** las pruebas usan siempre la base `gestor_tareas_test`, nunca la real (`gestor_tareas`). Antes de cada caso se vacían sus colecciones; el código se niega a vaciar cualquier otra base (`test/helpers.js`). En GitHub Actions se usa un MongoDB temporal (ver [integración continua](#24-integración-continua)).

### Casos y resultados

Resultado de la última ejecución (27/10/2026, Node.js 22, MongoDB Atlas): **34 de 34 pruebas superadas, 0 fallidas.**

#### Autenticación (`test/auth.test.js`)

| # | Caso | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Registrar un usuario | 201, devuelve token y datos sin la contraseña | ✅ |
| 2 | La contraseña se guarda con hash | En la BD hay un hash `$2a$10$...`, no el texto plano | ✅ |
| 3 | Correo en mayúsculas | Se guarda en minúsculas | ✅ |
| 4 | Correo ya registrado | 409 | ✅ |
| 5 | Contraseña de menos de 6 caracteres | 400 con mensaje | ✅ |
| 6 | Correo con formato inválido | 400 | ✅ |
| 7 | Registro sin nombre | 400 | ✅ |
| 8 | Login con credenciales correctas | 200 con token | ✅ |
| 9 | Login con el correo en mayúsculas | 200 | ✅ |
| 10 | Login con contraseña incorrecta | 401 | ✅ |
| 11 | Login con un correo que no existe | 401 con el **mismo** mensaje que el caso 10 (no revela qué correos existen) | ✅ |
| 12 | Login sin contraseña | 400 | ✅ |
| 13 | `GET /api/auth/yo` con token válido | 200 con el usuario | ✅ |
| 14 | Ruta protegida sin token | 401 | ✅ |
| 15 | Token falsificado | 401 | ✅ |
| 16 | JSON mal formado | 400 | ✅ |
| 17 | Ruta de API inexistente | 404 | ✅ |

#### Tareas (`test/tareas.test.js`)

| # | Caso | Resultado esperado | Estado |
|---|---|---|---|
| 18 | Crear una tarea con todos los campos | 201 con los datos guardados | ✅ |
| 19 | Crear sin categoría | Categoría "General" | ✅ |
| 20 | Crear sin fecha de vencimiento | 201, fecha `null` | ✅ |
| 21 | Crear sin título | 400 | ✅ |
| 22 | Fecha inválida | 400 | ✅ |
| 23 | El cliente envía otro `usuario` | Se ignora: la tarea queda a nombre del dueño del token | ✅ |
| 24 | Listar tareas | Pendientes primero, ordenadas por fecha | ✅ |
| 25 | Filtrar por estado | Solo pendientes / solo completadas | ✅ |
| 26 | Filtrar por categoría | Solo las de esa categoría | ✅ |
| 27 | Agrupar por categorías | Totales y pendientes correctos | ✅ |
| 28 | Editar título, descripción, categoría y fecha | 200 con los cambios | ✅ |
| 29 | Quitar la fecha de vencimiento | Fecha `null` | ✅ |
| 30 | Completar y volver a pendiente | `completada` cambia a `true` y luego a `false` | ✅ |
| 31 | Completar sin indicar el estado | Alterna el estado actual | ✅ |
| 32 | Eliminar | 204 y ya no aparece en la lista | ✅ |
| 33 | Id inexistente o mal formado | 404 | ✅ |
| 34 | **Privacidad:** otro usuario intenta ver, editar, completar o borrar | No ve nada y recibe 404; la tarea original queda intacta | ✅ |

Salida real de `npm test` (resumen):

```
▶ Autenticación
  ✔ POST /api/auth/registro (7 pruebas)
  ✔ POST /api/auth/login (5 pruebas)
  ✔ GET /api/auth/yo y protección de rutas (5 pruebas)
▶ Tareas
  ✔ Creación (6 pruebas)
  ✔ Listado y filtros (4 pruebas)
  ✔ Edición, completado y eliminación (6 pruebas)
  ✔ Privacidad entre usuarios (1 prueba)
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

## 2.2 Pruebas manuales de la interfaz

Realizadas en el navegador con la app conectada a la base de datos.

| # | Prueba | Pasos | Resultado |
|---|---|---|---|
| M1 | Registro | "Crear cuenta" → llenar datos → "Crear cuenta" | Entra a la app con el nombre en la barra superior ✅ |
| M2 | Ver contraseña | Botón "Ver" en el campo de contraseña | Muestra / oculta el texto ✅ |
| M3 | Sesión persistente | Recargar la página | Sigue con la sesión iniciada ✅ |
| M4 | Agregar rápido | Tecla `N`, escribir, Enter | La tarea aparece en "General" ✅ |
| M5 | Más detalles | Escribir título → "Más detalles" → elegir categoría y "Mañana" → Guardar | Título precargado; aparece con la etiqueta "Mañana" ✅ |
| M6 | Fechas relativas | Tareas con fecha de hoy, mañana, pasada y futura | "Vence hoy" (naranja), "Mañana" (azul), "Venció hace 2 días" (rojo), "jue, 12 nov" ✅ |
| M7 | Completar + deshacer | Clic en el círculo → "Deshacer" | Pasa a "Completadas", sube el progreso; deshacer la regresa ✅ |
| M8 | Eliminar + deshacer | Papelera → "Deshacer" | Desaparece y vuelve ✅ |
| M9 | Editar | Clic en una tarea, cambiar título, Guardar | Se actualiza y aparece "Cambios guardados" ✅ |
| M10 | Vistas | Hoy / Próximos 7 días / Vencidas | Cada vista muestra solo las tareas correspondientes y su contador ✅ |
| M11 | Categorías | Clic en una categoría | Lista filtrada; la tarea rápida se crea en esa categoría ✅ |
| M12 | Búsqueda | Tecla `/`, escribir "mongoose" | "1 resultado", sin importar mayúsculas ni tildes ✅ |
| M13 | Texto con HTML | Crear la tarea `<b>Node</b>` | Se muestra como texto, no se interpreta (protección XSS) ✅ |
| M14 | Celular (375 px) | Vista móvil | Menú horizontal, sin desplazamiento lateral ✅ |
| M15 | Modo oscuro | Sistema en modo oscuro | Colores oscuros legibles ✅ |
| M16 | Cerrar sesión | Icono de salida | Vuelve a la pantalla de acceso ✅ |

## 2.3 Pruebas de despliegue

Contra la app publicada en <https://gestor-tareas-omega-bice.vercel.app> y la base en MongoDB Atlas:

| Prueba | Resultado |
|---|---|
| La página principal carga | 200 ✅ |
| El archivo `.env` no es accesible públicamente | 404 ✅ |
| Registro, login, crear, completar, listar y eliminar desde la URL pública | Todos correctos ✅ |
| Los datos creados aparecen en Atlas (con la contraseña hasheada) | ✅ |
| La función de Vercel conecta "en frío" a Atlas en la primera petición | ✅ |

## 2.4 Integración continua

El archivo `.github/workflows/pruebas.yml` hace que **GitHub Actions ejecute `npm test` automáticamente** en cada `push` y en cada *pull request*. Levanta un MongoDB temporal en un contenedor, así que no necesita la contraseña de Atlas. Si alguna prueba falla, GitHub marca el commit con una ❌ y se detecta el error antes de publicarlo.

## 2.5 Problemas encontrados y cómo se resolvieron

| Problema | Causa | Solución |
|---|---|---|
| MongoDB local se cerraba solo | El PC se quedó sin memoria virtual (`out of memory`) | Migrar a MongoDB Atlas; se dejó una configuración de bajo consumo en `config-mongodb/` |
| `querySrv ECONNREFUSED` al conectar a Atlas | Node usaba un DNS (`127.0.0.1`) que no resolvía registros SRV | `src/config/db.js` detecta el fallo y usa DNS públicos |
| `bad auth: authentication failed` | La contraseña del usuario de Atlas no coincidía | Se restableció la contraseña en *Database Access* |
| La app arrancaba con la base local | Leía otro `.env` según la carpeta desde la que se iniciaba | `dotenv` carga siempre el `.env` junto al código |
| Página principal con error 500 en Vercel | Vercel enviaba `/` al servidor Express | `vercel.json` sirve `public/` como estático y solo `/api` va a la función |
| Aparecía el texto "null" en la interfaz | `replaceChildren(null)` inserta la palabra "null" | Filtrar los valores vacíos antes de insertarlos |
