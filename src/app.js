const path = require('path');
// Carga el .env del proyecto aunque se inicie desde otra carpeta (en Vercel no existe y se usan sus variables de entorno)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const mongoose = require('mongoose');
const conectarDB = require('./config/db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gestor_tareas';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Antes de cada petición a la API se asegura la conexión a MongoDB.
// En Vercel cada función puede arrancar "en frío", así que se conecta bajo demanda
// y la conexión se reutiliza mientras la función siga activa.
app.use('/api', async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    console.error('Falta la variable de entorno JWT_SECRET');
    return res.status(500).json({ error: 'El servidor no está configurado (falta JWT_SECRET)' });
  }
  try {
    await conectarDB(MONGODB_URI);
    next();
  } catch {
    res.status(503).json({ error: 'No se pudo conectar a la base de datos. Intenta de nuevo en unos segundos.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/tareas', taskRoutes);

// Rutas de API inexistentes
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejador central de errores
app.use((err, req, res, next) => {
  if (err instanceof mongoose.Error.ValidationError) {
    const mensaje = Object.values(err.errors).map((e) => e.message).join('. ');
    return res.status(400).json({ error: mensaje });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Valor no válido para ${err.path}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = { app, MONGODB_URI };
