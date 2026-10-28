# 4. Sustentación, ética y privacidad

## 4.1 Guion de la sustentación (≈ 15 minutos)

Todos los integrantes del CIPAS deben participar. Propuesta de reparto:

| Tiempo | Tema | Quién | Qué mostrar |
|---|---|---|---|
| 0:00 – 1:30 | Presentación del equipo y del problema | Integrante 1 | Objetivo: gestor de tareas con Node.js; requisitos del enunciado (tabla de `docs/01`, sección 1.1) |
| 1:30 – 4:00 | Arquitectura y diseño | Integrante 3 | Diagrama de arquitectura (navegador → Vercel → Atlas), por qué es distribuida, diseño de la base de datos |
| 4:00 – 9:00 | **Demostración en vivo** | Integrante 1 | Ver la sección 4.2 |
| 9:00 – 11:00 | Seguridad | Integrante 2 | Hash en Atlas, JWT, prueba de privacidad entre usuarios |
| 11:00 – 13:00 | Pruebas e integración continua | Integrante 3 | Ejecutar `npm test` (34 pruebas en verde) y mostrar GitHub Actions |
| 13:00 – 14:30 | Desafíos superados y aprendizajes | Los tres | Tabla 2.5 de `docs/02-pruebas.md` |
| 14:30 – 15:00 | Cierre y preguntas | Todos | — |

## 4.2 Demostración en vivo (paso a paso)

Preparen antes: la app abierta en <https://gestor-tareas-omega-bice.vercel.app>, MongoDB Atlas (*Browse Collections*) en otra pestaña y una terminal en la carpeta del proyecto.

1. **Registro:** crear una cuenta nueva. → Ir a Atlas, colección `users`: mostrar que la contraseña está guardada como `$2a$10$...` (hash), no en texto.
2. **Crear tareas rápido:** tecla `N`, escribir "Estudiar para el parcial", Enter. Crear 2–3 más.
3. **Más detalles:** crear "Entregar trabajo final" con descripción, categoría *Universidad* y fecha *Mañana*.
4. **Categorías:** mostrar el menú lateral con colores y contadores; entrar a *Universidad*.
5. **Fechas:** editar una tarea y ponerle una fecha pasada → aparece "Venció hace X días" y el contador rojo en *Vencidas*.
6. **Completar y deshacer:** marcar una tarea, ver la barra de progreso, pulsar "Deshacer".
7. **Eliminar y deshacer.**
8. **Búsqueda:** tecla `/` y buscar una palabra.
9. **Privacidad:** abrir una ventana de incógnito, crear otra cuenta → no ve las tareas de la primera.
10. **Persistencia:** recargar la página → todo sigue ahí. Mostrar las tareas en Atlas (colección `tasks`).
11. **Celular:** abrir la URL en un teléfono (o el modo responsive del navegador).

> **Plan B:** si falla internet durante la sustentación, ejecutar la app en local (`npm start`) y abrir <http://localhost:3000>. Si tampoco hay acceso a Atlas, usar MongoDB local cambiando `MONGODB_URI` en `.env`.

## 4.3 Preguntas probables y cómo responderlas

| Pregunta | Respuesta corta |
|---|---|
| ¿Qué es un hash y por qué no cifrar la contraseña? | Un hash es de una sola vía: no se puede "descifrar". Al iniciar sesión se calcula el hash de lo que escribe el usuario y se compara. bcrypt además agrega una *sal* aleatoria y es lento a propósito, para que probar millones de contraseñas sea impracticable. |
| ¿Qué es un JWT? | Un token firmado por el servidor con el id del usuario. El navegador lo envía en cada petición; el servidor verifica la firma sin guardar sesiones. Expira a los 7 días. |
| ¿Qué pasa si alguien cambia el id de una tarea en la petición? | Toda consulta filtra por `usuario: req.usuarioId` (sacado del token), así que solo encuentra sus propias tareas; recibe 404. Lo comprueba la prueba #34. |
| ¿Por qué MongoDB y no SQL? | Lo sugiere el enunciado; los documentos JSON encajan con JavaScript y con la forma de las tareas, y Mongoose agrega validación de esquema. |
| ¿Qué hace Mongoose? | Es un ODM: define esquemas (campos, tipos, validaciones), convierte documentos en objetos de JavaScript y ofrece métodos como `find`, `create`, `save`. |
| ¿Qué es serverless? | En Vercel no hay un servidor encendido siempre: cada petición a `/api` ejecuta una función. Por eso la conexión a la BD se abre bajo demanda y se reutiliza. |
| ¿Cómo se relaciona con programación distribuida? | Cliente, servidor y base de datos están en máquinas distintas y se comunican por red; Atlas replica los datos en 3 nodos; la API es *stateless* y puede escalar en varias instancias. |
| ¿Cómo evitan XSS? | El frontend nunca inserta texto del usuario con `innerHTML`; usa `textContent`. Probado con la tarea `<b>Node</b>`. |

## 4.4 Ética y privacidad de los usuarios

Las consideraciones piden una cultura ética y respeto por la privacidad. Medidas aplicadas:

**Protección de datos**
- **Contraseñas con hash bcrypt:** ni los desarrolladores pueden ver las contraseñas reales.
- **La contraseña nunca sale del servidor:** el campo tiene `select: false` y las respuestas solo incluyen nombre y correo.
- **Aislamiento entre usuarios:** cada persona solo puede leer y modificar sus propias tareas.
- **Mensaje de login genérico:** no revela si un correo está registrado (evita enumerar usuarios).
- **HTTPS** en Vercel: los datos viajan cifrados. La conexión a Atlas también usa TLS.

**Minimización de datos**
- Solo se pide lo necesario: nombre, correo y contraseña. No hay rastreadores, analítica ni cookies de terceros.

**Manejo de secretos**
- Las credenciales de la base de datos y la clave JWT están en variables de entorno (`.env` local y *Environment Variables* en Vercel), nunca en el código ni en GitHub.
- El `.env` está en `.gitignore` y `.vercelignore`; se verificó que no es accesible desde la URL pública.

**Datos de prueba**
- Las pruebas automatizadas usan una base separada (`gestor_tareas_test`) y se borraron los datos de prueba de la base real.

**Limitaciones conocidas** (honestidad sobre lo que falta para un producto real)
- No hay recuperación de contraseña ni verificación del correo.
- El token se guarda en `localStorage`; en producción sería más seguro una cookie `httpOnly`.
- No hay límite de intentos de inicio de sesión (se podría agregar `express-rate-limit`).
- Atlas acepta conexiones desde cualquier IP (`0.0.0.0/0`) porque Vercel no tiene IP fija; la base sigue protegida por usuario y contraseña.
- Falta una opción para que el usuario borre su cuenta y sus datos.
