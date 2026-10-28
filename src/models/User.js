/**
 * Modelo de usuario con hash de contraseña.
 * @module models/User
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Rondas de sal de bcrypt: más rondas = hash más lento de romper (10 es el estándar recomendado). */
const RONDAS_SAL = 10;

/**
 * @typedef {object} Usuario
 * @property {string} nombre - Nombre visible (máx. 60 caracteres).
 * @property {string} email - Correo único, guardado en minúsculas.
 * @property {string} password - Hash bcrypt de la contraseña (nunca texto plano; no se devuelve en consultas).
 * @property {Date} createdAt - Fecha de registro (automática).
 * @property {Date} updatedAt - Fecha de la última modificación (automática).
 */
const userSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Correo no válido'],
    },
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
      select: false, // nunca se devuelve en las consultas por defecto
    },
  },
  { timestamps: true }
);

/**
 * Antes de guardar, reemplaza la contraseña por su hash bcrypt (solo si cambió).
 * Así la contraseña en texto plano nunca llega a la base de datos.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(RONDAS_SAL);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compara una contraseña escrita por el usuario con el hash guardado.
 * @param {string} passwordPlano - Contraseña tal como la escribió el usuario.
 * @returns {Promise<boolean>} `true` si coincide.
 * @example
 * const usuario = await User.findOne({ email }).select('+password');
 * if (await usuario.compararPassword('miClave123')) { ... }
 */
userSchema.methods.compararPassword = function (passwordPlano) {
  return bcrypt.compare(passwordPlano, this.password);
};

module.exports = mongoose.model('User', userSchema);
