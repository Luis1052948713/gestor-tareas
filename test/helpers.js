/**
 * Utilidades compartidas por las pruebas automatizadas.
 *
 * Las pruebas usan SIEMPRE la base de datos `gestor_tareas_test`, nunca la real.
 * - En local se conecta al mismo servidor de `.env` (por ejemplo Atlas), pero a esa base aparte.
 * - En integración continua (GitHub Actions) se define `MONGODB_URI_TEST` con un MongoDB temporal.
 *
 * @module test/helpers
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (process.env.MONGODB_URI_TEST) process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
process.env.DB_NAME = 'gestor_tareas_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const mongoose = require('mongoose');
const request = require('supertest');
const { app, MONGODB_URI } = require('../src/app');
const conectarDB = require('../src/config/db');

const BD_PRUEBAS = 'gestor_tareas_test';

/**
 * Vacía todas las colecciones de la base de pruebas (conserva los índices).
 * Se niega a ejecutarse sobre cualquier otra base para proteger los datos reales.
 * @returns {Promise<void>}
 * @throws {Error} Si la conexión activa no apunta a la base de pruebas.
 */
async function limpiarBD() {
  const db = mongoose.connection.db;
  if (!db || db.databaseName !== BD_PRUEBAS) {
    throw new Error(`Protección: solo se limpia la base "${BD_PRUEBAS}"`);
  }
  const colecciones = await db.collections();
  await Promise.all(colecciones.map((c) => c.deleteMany({})));
}

/**
 * Conecta a la base de pruebas, crea los índices de los modelos y la deja vacía.
 * @returns {Promise<void>}
 */
async function prepararBD() {
  await conectarDB(MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await limpiarBD();
}

/**
 * Vacía la base de pruebas y cierra la conexión.
 * @returns {Promise<void>}
 */
async function cerrarBD() {
  await limpiarBD();
  await mongoose.disconnect();
}

/**
 * Registra un usuario a través de la API.
 * @param {{nombre?: string, email?: string, password?: string}} [datos] - Datos del usuario (tienen valores por defecto).
 * @returns {Promise<{token: string, usuario: object, respuesta: import('supertest').Response}>}
 * @example
 * const { token } = await registrarUsuario({ email: 'ana@prueba.test' });
 */
async function registrarUsuario(datos = {}) {
  const cuerpo = { nombre: 'Usuario Prueba', email: 'usuario@prueba.test', password: 'clave123', ...datos };
  const respuesta = await request(app).post('/api/auth/registro').send(cuerpo);
  return { token: respuesta.body.token, usuario: respuesta.body.usuario, respuesta };
}

module.exports = { app, request, mongoose, prepararBD, cerrarBD, limpiarBD, registrarUsuario };
