/**
 * Modelo de tarea.
 * @module models/Task
 */
const mongoose = require('mongoose');

/**
 * @typedef {object} Tarea
 * @property {string} titulo - Título obligatorio (máx. 120 caracteres).
 * @property {string} [descripcion] - Detalle opcional (máx. 1000 caracteres).
 * @property {string} [categoria="General"] - Categoría para agrupar tareas.
 * @property {Date|null} [fechaVencimiento] - Fecha límite opcional (se guarda a medianoche UTC).
 * @property {boolean} [completada=false] - Si la tarea ya se terminó.
 * @property {mongoose.Types.ObjectId} usuario - Dueño de la tarea (referencia a User).
 * @property {Date} createdAt - Fecha de creación (automática).
 * @property {Date} updatedAt - Fecha de la última modificación (automática).
 */
const taskSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: 120,
    },
    descripcion: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    categoria: {
      type: String,
      trim: true,
      default: 'General',
      maxlength: 40,
    },
    fechaVencimiento: {
      type: Date,
      default: null,
    },
    completada: {
      type: Boolean,
      default: false,
    },
    // Cada tarea pertenece a un usuario
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Rendimiento: todas las consultas filtran por usuario y ordenan por estado y fecha.
// Este índice compuesto permite resolver el listado sin recorrer toda la colección.
taskSchema.index({ usuario: 1, completada: 1, fechaVencimiento: 1 });
// Para el filtro y la agrupación por categoría
taskSchema.index({ usuario: 1, categoria: 1 });

module.exports = mongoose.model('Task', taskSchema);
