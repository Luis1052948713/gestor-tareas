# Gestor de tareas con Node.js

Trabajo final colaborativo — Programación distribuida.

Aplicación web para gestionar tareas personales: registro e inicio de sesión de usuarios, creación, edición, marcado como completadas y eliminación de tareas, organización por categorías y fecha de vencimiento opcional.

**App publicada:** <https://gestor-tareas-omega-bice.vercel.app> · **Base de datos:** MongoDB Atlas

## Documentación

| Documento | Contenido |
|---|---|
| [1. Planificación y diseño](docs/01-planificacion-y-diseno.md) | Requisitos, arquitectura, diagramas de flujo y de secuencia, diseño de la base de datos, estructura de carpetas, decisiones de diseño y rendimiento |
| [2. Pruebas](docs/02-pruebas.md) | 34 pruebas automatizadas, pruebas manuales de la interfaz, pruebas de despliegue, integración continua y problemas resueltos |
| [3. División de tareas](docs/03-division-de-tareas.md) | Responsables por área (3 integrantes), plan por etapas, flujo de trabajo con Git y comunicación |
| [4. Sustentación, ética y privacidad](docs/04-sustentacion-y-etica.md) | Guion de la presentación, demostración en vivo, preguntas probables y medidas de privacidad |

El código está documentado con comentarios **JSDoc** (`@param`, `@returns`, `@example`) en el backend (`src/`) y en el frontend (`public/js/`).

## Tecnologías

| Capa | Tecnología |
|---|---|
| Entorno de ejecución | Node.js (≥ 18) |
| Framework web | Express.js |
| Base de datos | MongoDB |
| Modelado (ODM) | Mongoose |
| Seguridad | bcryptjs (hash de contraseñas), JSON Web Tokens (sesiones) |
| Interfaz | HTML, CSS y JavaScript (sin frameworks) |

## Estructura del proyecto

```
gestor-tareas/
├── src/
│   ├── app.js               # Aplicación Express: rutas, conexión a la BD, manejo de errores
│   ├── server.js            # Arranque local (npm start)
│   ├── config/db.js         # Conexión a MongoDB
│   ├── models/
│   │   ├── User.js          # Usuario (hash de contraseña con bcrypt)
│   │   └── Task.js          # Tarea (pertenece a un usuario)
│   ├── middleware/auth.js   # Verificación del token JWT
│   └── routes/
│       ├── auth.js          # Registro, login, usuario actual
│       └── tasks.js         # CRUD de tareas y categorías
├── public/                  # Frontend servido por Express
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── api.js           # Cliente de la API (fetch)
│       └── app.js           # Lógica de la interfaz
├── scripts/
│   └── probar-conexion.js   # npm run probar-db: verifica la conexión a MongoDB
├── test/                    # Pruebas automatizadas (npm test)
├── docs/                    # Documentación del proyecto
├── .github/workflows/       # Integración continua (GitHub Actions)
├── api/index.js             # Entrada para Vercel (función serverless)
├── vercel.json              # Configuración de rutas en Vercel
├── .env.example
└── package.json
```

## Instalación y ejecución

1. Tener instalado **Node.js** y **MongoDB** (local o un clúster en MongoDB Atlas).
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Crear el archivo de configuración copiando `.env.example` como `.env` y cambiar `JWT_SECRET` por una cadena larga y aleatoria. Si usas Atlas, reemplaza `MONGODB_URI` por tu cadena de conexión.
4. Iniciar el servidor:
   ```bash
   npm start
   ```
   o, en desarrollo (se reinicia al guardar cambios):
   ```bash
   npm run dev
   ```
5. Abrir <http://localhost:3000>.
6. Ejecutar las pruebas automatizadas (usan una base aparte, `gestor_tareas_test`):
   ```bash
   npm test
   ```

## Usar MongoDB Atlas (base de datos en la nube)

1. Entra a <https://cloud.mongodb.com> y crea un clúster gratuito (**M0**).
2. **Database Access** → *Add New Database User*: crea un usuario y una contraseña (método *Password*, rol *Read and write to any database*).
3. **Network Access** → *Add IP Address*: agrega tu IP actual (*Add Current IP Address*). Para pruebas en clase puedes usar `0.0.0.0/0` (cualquier IP), pero no lo dejes así en producción.
4. En el clúster, pulsa **Connect → Drivers** y copia la cadena de conexión `mongodb+srv://...`.
5. En `.env`, reemplaza `MONGODB_URI` por esa cadena y pon tu contraseña donde dice `<db_password>`. Si la contraseña tiene caracteres como `@ : / # %`, codifícalos (por ejemplo `@` → `%40`).
6. Comprueba la conexión:
   ```bash
   npm run probar-db
   ```
   Si algo falla, el script muestra una sugerencia (IP no autorizada, contraseña incorrecta, URI mal copiada…).
   En algunos Windows, Node no logra resolver las direcciones `mongodb+srv://` con el DNS del sistema (`querySrv ECONNREFUSED`); la app lo detecta y reintenta automáticamente con DNS públicos (8.8.8.8 y 1.1.1.1).
7. Inicia la app con `npm start`. Las colecciones `users` y `tasks` se crean solas en la base `gestor_tareas` (configurable con `DB_NAME`) al registrar el primer usuario.

## Publicar en Vercel

La app ya está preparada para Vercel:

- `api/index.js` expone la aplicación Express como **función serverless**; `vercel.json` envía todas las rutas `/api/*` a esa función.
- Los archivos de `public/` (HTML, CSS, JS) se sirven como sitio estático.
- La conexión a MongoDB se abre bajo demanda y se reutiliza entre peticiones (`src/config/db.js`).
- `.vercelignore` evita subir el `.env` y `node_modules`.

Pasos:

1. **Atlas → Network Access → Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`). Vercel no tiene una IP fija, así que Atlas debe aceptar conexiones desde cualquier IP (la contraseña de la base sigue protegiéndola).
2. En una terminal dentro de la carpeta `gestor-tareas`, inicia sesión en Vercel (se abre el navegador):
   ```bash
   npx vercel login
   ```
3. Crea el proyecto y haz el primer despliegue (acepta las opciones por defecto):
   ```bash
   npx vercel
   ```
4. En <https://vercel.com> → tu proyecto → **Settings → Environment Variables**, agrega `MONGODB_URI`, `JWT_SECRET`, `DB_NAME` y `JWT_EXPIRES_IN`. Puedes copiar el contenido de tu `.env` y pegarlo en el campo *Key*: Vercel separa las variables automáticamente.
5. Publica en producción con las variables ya cargadas:
   ```bash
   npx vercel --prod
   ```

Vercel muestra la URL pública (algo como `https://gestor-tareas-xxxx.vercel.app`).

### Publicación automática desde GitHub

El proyecto de Vercel está conectado al repositorio <https://github.com/Luis1052948713/gestor-tareas>:

- Cada `git push` a la rama **`main`** publica automáticamente una nueva versión en producción.
- Cada *pull request* genera una **versión de vista previa** con su propia URL, para revisar los cambios antes de fusionarlos.
- Al mismo tiempo, GitHub Actions ejecuta las pruebas (`npm test`); si fallan, el commit aparece con ❌ en GitHub.

## Cómo se usa la interfaz

- **Agregar rápido:** escribe en la barra superior y presiona Enter. Si estás dentro de una categoría o en la vista *Hoy*, la tarea se crea ahí. *Más detalles* abre el formulario completo.
- **Vistas:** *Todas*, *Hoy*, *Próximos 7 días* y *Vencidas* (con contador en rojo). Debajo, las categorías con su color y sus pendientes.
- **Completar:** clic en el círculo. Las completadas pasan a una sección plegable al final y la barra de progreso se actualiza.
- **Editar:** clic en cualquier parte de la tarea o en el lápiz. En el formulario hay botones rápidos de categoría y de fecha (*Hoy*, *Mañana*, *En una semana*, *Sin fecha*).
- **Eliminar y deshacer:** al eliminar o completar aparece un aviso con **Deshacer** durante 5 segundos.
- **Buscar:** por título, descripción o categoría (sin importar mayúsculas ni tildes).
- **Atajos:** `N` nueva tarea, `/` buscar, `Esc` cerrar o salir del campo.
- Modo oscuro automático según el sistema y diseño adaptado a celular.

## API REST

Todas las rutas de `/api/tareas` requieren el encabezado `Authorization: Bearer <token>`, que se obtiene al registrarse o iniciar sesión.

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/registro` | Crea un usuario. Cuerpo: `{ nombre, email, password }` |
| POST | `/api/auth/login` | Inicia sesión. Cuerpo: `{ email, password }` |
| GET | `/api/auth/yo` | Devuelve el usuario de la sesión actual |

Ambas respuestas de registro/login devuelven `{ token, usuario }`.

### Tareas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tareas` | Lista las tareas del usuario. Filtros opcionales: `?categoria=X&estado=pendientes\|completadas` |
| GET | `/api/tareas/categorias` | Categorías del usuario con total y pendientes |
| POST | `/api/tareas` | Crea una tarea. Cuerpo: `{ titulo, descripcion?, categoria?, fechaVencimiento? }` |
| PUT | `/api/tareas/:id` | Edita título, descripción, categoría, fecha o estado |
| PATCH | `/api/tareas/:id/completar` | Marca como completada/pendiente. Cuerpo: `{ completada: true\|false }` |
| DELETE | `/api/tareas/:id` | Elimina la tarea |

## Modelo de datos

**User**: `nombre`, `email` (único), `password` (hash bcrypt, nunca se devuelve en consultas), `createdAt`, `updatedAt`.

**Task**: `titulo`, `descripcion`, `categoria` (por defecto "General"), `fechaVencimiento` (opcional), `completada`, `usuario` (referencia a User), `createdAt`, `updatedAt`.

## Medidas de seguridad

- Las contraseñas se guardan con **hash bcrypt** (10 rondas de sal); nunca en texto plano.
- Las sesiones usan **JWT** firmados con un secreto del servidor y con expiración.
- Cada usuario solo puede ver, editar o eliminar **sus propias tareas** (toda consulta filtra por el id del usuario del token).
- El servidor solo acepta campos permitidos al crear/editar tareas (no se puede reasignar el dueño de una tarea).
- El login responde con el mismo mensaje si el correo no existe o la contraseña es incorrecta, para no revelar qué correos están registrados.
- La interfaz construye el HTML con `textContent`/`createElement`, de modo que el texto ingresado por usuarios no se ejecuta como código (protección contra XSS).

## Posibles mejoras

- Limitar intentos de inicio de sesión (p. ej. `express-rate-limit`).
- Guardar el token en una cookie `httpOnly` en lugar de `localStorage`.
- Pruebas automatizadas de la API (Jest + Supertest).
- Búsqueda de tareas por texto y ordenamiento configurable.
