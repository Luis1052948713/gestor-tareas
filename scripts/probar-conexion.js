// Comprueba que la URI de .env conecta (útil al configurar MongoDB Atlas)
// Uso: npm run probar-db
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const conectarDB = require('../src/config/db');

(async () => {
  try {
    await conectarDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gestor_tareas');
  } catch {
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const colecciones = await db.listCollections().toArray();
  if (!colecciones.length) {
    console.log('La base de datos está vacía (se crearán las colecciones al registrar el primer usuario).');
  }
  for (const { name } of colecciones) {
    console.log(`  ${name}: ${await db.collection(name).countDocuments()} documentos`);
  }

  await mongoose.disconnect();
  console.log('Conexión correcta.');
})();
