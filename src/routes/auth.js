/**
 * Rutas de autenticación: registro, inicio de sesión y usuario actual.
 * Se montan en `/api/auth`.
 * @module routes/auth
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requiereAuth = require('../middleware/auth');

const router = express.Router();

/**
 * Firma un token JWT con el id del usuario.
 * @param {{_id: import('mongoose').Types.ObjectId}} usuario - Usuario autenticado.
 * @returns {string} Token que expira según `JWT_EXPIRES_IN` (por defecto 7 días).
 */
function generarToken(usuario) {
  return jwt.sign({ id: usuario._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Devuelve solo los datos que se pueden mostrar al cliente (nunca la contraseña).
 * @param {object} usuario - Documento de usuario.
 * @returns {{id: string, nombre: string, email: string}}
 */
function datosPublicos(usuario) {
  return { id: usuario._id, nombre: usuario.nombre, email: usuario.email };
}

/**
 * POST /api/auth/registro
 * Crea una cuenta nueva. Cuerpo: `{ nombre, email, password }`.
 * Responde 201 `{ token, usuario }`, 409 si el correo ya existe o 400 si los datos no son válidos.
 */
router.post('/registro', async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body;

    const existe = await User.exists({ email: String(email || '').toLowerCase() });
    if (existe) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const usuario = await User.create({ nombre, email, password });
    res.status(201).json({ token: generarToken(usuario), usuario: datosPublicos(usuario) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Inicia sesión. Cuerpo: `{ email, password }`.
 * Responde 200 `{ token, usuario }` o 401 con un mensaje genérico
 * (igual si el correo no existe o la contraseña falla, para no revelar qué correos están registrados).
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    const usuario = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    if (!usuario || !(await usuario.compararPassword(password))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    res.json({ token: generarToken(usuario), usuario: datosPublicos(usuario) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/yo
 * Devuelve el usuario de la sesión actual (requiere token).
 */
router.get('/yo', requiereAuth, async (req, res, next) => {
  try {
    const usuario = await User.findById(req.usuarioId).lean();
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ usuario: datosPublicos(usuario) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
