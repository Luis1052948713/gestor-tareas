/**
 * Middleware de autenticación con JSON Web Tokens.
 * @module middleware/auth
 */
const jwt = require('jsonwebtoken');

/**
 * Verifica el token JWT enviado en el encabezado `Authorization: Bearer <token>`.
 * Si es válido, guarda el id del usuario en `req.usuarioId` y continúa;
 * si falta o es inválido/expiró, responde 401.
 *
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Pasa al siguiente middleware.
 * @returns {void}
 * @example
 * router.get('/privado', requiereAuth, (req, res) => res.json({ id: req.usuarioId }));
 */
function requiereAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = payload.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = requiereAuth;
