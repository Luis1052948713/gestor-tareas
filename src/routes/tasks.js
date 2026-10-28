/**
 * Rutas de tareas (CRUD, completado y categorías). Se montan en `/api/tareas`
 * y todas requieren sesión iniciada: cada usuario solo accede a sus propias tareas.
 * @module routes/tasks
 */
const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const requiereAuth = require('../middleware/auth');

const router = express.Router();

router.use(requiereAuth);

/** Campos que el cliente puede enviar. `usuario` no está: el dueño siempre sale del token. */
const CAMPOS_EDITABLES = ['titulo', 'descripcion', 'categoria', 'fechaVencimiento', 'completada'];

/**
 * Filtra el cuerpo de la petición para quedarse solo con los campos permitidos
 * y normaliza valores vacíos (categoría vacía → "General", fecha vacía → null).
 * @param {object} body - Cuerpo recibido del cliente.
 * @returns {object} Campos listos para guardar.
 * @example
 * camposPermitidos({ titulo: 'X', usuario: 'otro' }) // → { titulo: 'X' }
 */
function camposPermitidos(body) {
  const campos = {};
  for (const clave of CAMPOS_EDITABLES) {
    if (body[clave] !== undefined) campos[clave] = body[clave];
  }
  if (campos.categoria !== undefined && !String(campos.categoria).trim()) {
    campos.categoria = 'General';
  }
  if (campos.fechaVencimiento === '') campos.fechaVencimiento = null;
  return campos;
}

/**
 * Busca la tarea `req.params.id` solo entre las del usuario actual.
 * Si no existe (o es de otro usuario) responde 404 y devuelve `null`.
 * @param {import('express').Request} req - Petición con `params.id` y `usuarioId`.
 * @param {import('express').Response} res - Respuesta (se usa para el 404).
 * @returns {Promise<import('mongoose').Document|null>} La tarea o `null`.
 */
async function buscarTareaPropia(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Tarea no encontrada' });
    return null;
  }
  const tarea = await Task.findOne({ _id: req.params.id, usuario: req.usuarioId });
  if (!tarea) res.status(404).json({ error: 'Tarea no encontrada' });
  return tarea;
}

/**
 * GET /api/tareas?categoria=X&estado=pendientes|completadas
 * Lista las tareas del usuario: pendientes primero, luego por fecha de vencimiento.
 */
router.get('/', async (req, res, next) => {
  try {
    const filtro = { usuario: req.usuarioId };
    if (req.query.categoria) filtro.categoria = String(req.query.categoria);
    if (req.query.estado === 'pendientes') filtro.completada = false;
    if (req.query.estado === 'completadas') filtro.completada = true;

    // .lean() devuelve objetos simples (sin la sobrecarga de documentos Mongoose): lectura más rápida
    const tareas = await Task.find(filtro).sort({ completada: 1, fechaVencimiento: 1, createdAt: -1 }).lean();
    res.json(tareas);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tareas/categorias
 * Categorías del usuario con su total de tareas y cuántas siguen pendientes.
 * El conteo lo hace MongoDB (aggregate) en vez de traer todas las tareas al servidor.
 */
router.get('/categorias', async (req, res, next) => {
  try {
    const categorias = await Task.aggregate([
      { $match: { usuario: new mongoose.Types.ObjectId(req.usuarioId) } },
      {
        $group: {
          _id: '$categoria',
          total: { $sum: 1 },
          pendientes: { $sum: { $cond: ['$completada', 0, 1] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(categorias.map((c) => ({ nombre: c._id, total: c.total, pendientes: c.pendientes })));
  } catch (err) {
    next(err);
  }
});

/** POST /api/tareas — crea una tarea para el usuario actual. */
router.post('/', async (req, res, next) => {
  try {
    const tarea = await Task.create({ ...camposPermitidos(req.body), usuario: req.usuarioId });
    res.status(201).json(tarea);
  } catch (err) {
    next(err);
  }
});

/** PUT /api/tareas/:id — edita los campos enviados (título, descripción, categoría, fecha o estado). */
router.put('/:id', async (req, res, next) => {
  try {
    const tarea = await buscarTareaPropia(req, res);
    if (!tarea) return;
    Object.assign(tarea, camposPermitidos(req.body));
    await tarea.save();
    res.json(tarea);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/tareas/:id/completar
 * Cuerpo opcional `{ completada: boolean }`; si no se envía, alterna el estado actual.
 */
router.patch('/:id/completar', async (req, res, next) => {
  try {
    const tarea = await buscarTareaPropia(req, res);
    if (!tarea) return;
    tarea.completada = req.body.completada !== undefined ? Boolean(req.body.completada) : !tarea.completada;
    await tarea.save();
    res.json(tarea);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/tareas/:id — elimina la tarea (responde 204 sin contenido). */
router.delete('/:id', async (req, res, next) => {
  try {
    const tarea = await buscarTareaPropia(req, res);
    if (!tarea) return;
    await tarea.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
