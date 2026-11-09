/**
 * Middleware de autenticación con JSON Web Tokens.
 * @module middleware/auth
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifica el token JWT enviado en el encabezado `Authorization: Bearer <token>`.
 * Si es válido y sigue vigente, guarda el id del usuario en `req.usuarioId` y continúa.
 * Responde 401 si falta, es inválido, expiró, el usuario ya no existe o la contraseña
 * se restableció después de emitirlo (por eso consulta la versión de sesión del usuario).
 *
 * @param {import('express').Request} req - Petición HTTP.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {import('express').NextFunction} next - Pasa al siguiente middleware.
 * @returns {Promise<void>}
 * @example
 * router.get('/privado', requiereAuth, (req, res) => res.json({ id: req.usuarioId }));
 */
async function requiereAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  try {
    const usuario = await User.findById(payload.id).select('sesionVersion').lean();
    // Los tokens y cuentas anteriores a esta función no tienen versión: equivale a 0
    if (!usuario || (usuario.sesionVersion || 0) !== (payload.sv || 0)) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
    req.usuarioId = payload.id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requiereAuth;
