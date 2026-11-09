/**
 * Rutas de autenticación: registro con verificación de correo, inicio de sesión
 * y usuario actual. Se montan en `/api/auth`.
 * @module routes/auth
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requiereAuth = require('../middleware/auth');
const correo = require('../services/correo');

const router = express.Router();

/** Minutos de validez del código de verificación. */
const MINUTOS_VALIDEZ = 15;
/** Intentos permitidos por cada código antes de invalidarlo. */
const MAX_INTENTOS = 5;
/** Segundos de espera entre reenvíos del código. */
const SEGUNDOS_REENVIO = 60;

const CODIGO_INVALIDO = 'Código incorrecto o vencido. Revísalo o pide uno nuevo.';

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
 * Normaliza un correo recibido del cliente; siempre devuelve texto,
 * así un objeto enviado en el JSON no puede usarse como filtro de MongoDB.
 * @param {*} email - Valor recibido.
 * @returns {string} Correo en minúsculas y sin espacios.
 */
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Calcula el HMAC de un código. Con el secreto del servidor, una copia filtrada
 * de la base de datos no permite probar los 900 000 códigos posibles.
 * @param {string} email - Correo dueño del código.
 * @param {string} codigo - Código de 6 dígitos.
 * @returns {string} HMAC-SHA256 en hexadecimal.
 */
function hashCodigo(email, codigo) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${email}:${codigo}`).digest('hex');
}

/**
 * Genera un código nuevo y los campos que lo guardan en el usuario.
 * @param {string} email - Correo dueño del código.
 * @returns {{codigo: string, campos: object}} Código en texto plano (para el correo) y campos a guardar.
 */
function nuevoCodigo(email) {
  const codigo = String(crypto.randomInt(100000, 1000000));
  return {
    codigo,
    campos: {
      codigoHash: hashCodigo(email, codigo),
      codigoExpira: new Date(Date.now() + MINUTOS_VALIDEZ * 60 * 1000),
      codigoIntentos: 0,
      codigoEnviadoEn: new Date(),
    },
  };
}

/**
 * POST /api/auth/registro
 * Crea una cuenta pendiente y envía el código. Cuerpo: `{ nombre, email, password }`.
 * Responde 201 `{ requiereVerificacion, usuario }` sin token, 409 si el correo ya está
 * verificado, 400 si los datos no son válidos o 502 si no se pudo enviar el correo.
 * Si ya hay una cuenta pendiente con ese correo se reemplaza: así nadie bloquea
 * un correo ajeno registrándolo sin poder verificarlo.
 */
router.post('/registro', async (req, res, next) => {
  try {
    const { nombre, password } = req.body;
    const email = normalizarEmail(req.body.email);

    let usuario = await User.findOne({ email });
    if (usuario && usuario.emailVerificado !== false) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const { codigo, campos } = nuevoCodigo(email);
    const eraNueva = !usuario;
    if (eraNueva) usuario = new User({ email });
    Object.assign(usuario, { nombre, password, emailVerificado: false }, campos);
    await usuario.save();

    try {
      await correo.enviarCodigoVerificacion(email, usuario.nombre, codigo);
    } catch (err) {
      console.error('No se pudo enviar el correo de verificación:', err.message);
      if (eraNueva) await usuario.deleteOne(); // permite volver a intentar sin quedar a medias
      return res.status(502).json({ error: 'No pudimos enviar el correo de verificación. Intenta de nuevo en unos minutos.' });
    }

    res.status(201).json({ requiereVerificacion: true, usuario: datosPublicos(usuario) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verificar
 * Activa la cuenta con el código. Cuerpo: `{ email, codigo }`.
 * Responde 200 `{ token, usuario }` o 400 con un mensaje genérico.
 * Cada código admite 5 intentos: el contador se incrementa de forma atómica antes de
 * comparar, para que peticiones simultáneas no puedan probar más códigos de los permitidos.
 */
router.post('/verificar', async (req, res, next) => {
  try {
    const email = normalizarEmail(req.body.email);
    const codigo = String(req.body.codigo || '').trim();

    const usuario = await User.findOneAndUpdate(
      {
        email,
        emailVerificado: false,
        codigoExpira: { $gt: new Date() },
        codigoIntentos: { $lt: MAX_INTENTOS },
      },
      { $inc: { codigoIntentos: 1 } },
      { new: true }
    ).select('+codigoHash');

    if (!usuario) return res.status(400).json({ error: CODIGO_INVALIDO });

    const esperado = Buffer.from(usuario.codigoHash, 'hex');
    const recibido = Buffer.from(hashCodigo(email, codigo), 'hex');
    if (!crypto.timingSafeEqual(esperado, recibido)) {
      return res.status(400).json({ error: CODIGO_INVALIDO });
    }

    await User.updateOne(
      { _id: usuario._id },
      {
        $set: { emailVerificado: true },
        $unset: { codigoHash: 1, codigoExpira: 1, codigoIntentos: 1, codigoEnviadoEn: 1 },
      }
    );

    res.json({ token: generarToken(usuario), usuario: datosPublicos(usuario) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reenviar
 * Envía un código nuevo a una cuenta pendiente. Cuerpo: `{ email }`.
 * Responde siempre 200 con el mismo mensaje, exista o no la cuenta, para no revelar
 * qué correos están registrados. Permite un envío por minuto para cada correo.
 */
router.post('/reenviar', async (req, res, next) => {
  try {
    const email = normalizarEmail(req.body.email);
    const { codigo, campos } = nuevoCodigo(email);
    const limite = new Date(Date.now() - SEGUNDOS_REENVIO * 1000);

    const usuario = await User.findOneAndUpdate(
      { email, emailVerificado: false, codigoEnviadoEn: { $lte: limite } },
      { $set: campos },
      { new: true }
    );

    if (usuario) {
      await correo.enviarCodigoVerificacion(email, usuario.nombre, codigo).catch((err) => {
        console.error('No se pudo reenviar el correo de verificación:', err.message);
      });
    }

    res.json({ mensaje: 'Si la cuenta está pendiente, enviamos un código nuevo.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Inicia sesión. Cuerpo: `{ email, password }`.
 * Responde 200 `{ token, usuario }` o 401 con un mensaje genérico
 * (igual si el correo no existe o la contraseña falla, para no revelar qué correos están registrados).
 * Con la contraseña correcta pero el correo sin verificar responde 403 `EMAIL_NO_VERIFICADO`.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { password } = req.body;
    const email = normalizarEmail(req.body.email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    const usuario = await User.findOne({ email }).select('+password');
    if (!usuario || !(await usuario.compararPassword(String(password)))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (usuario.emailVerificado === false) {
      return res.status(403).json({
        error: 'Debes verificar tu correo antes de entrar',
        codigo: 'EMAIL_NO_VERIFICADO',
        email: usuario.email,
      });
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
