// Arranque local: conecta a MongoDB y levanta el servidor HTTP.
// En Vercel no se usa este archivo; allí la entrada es api/index.js.
const { app, MONGODB_URI } = require('./app');
const conectarDB = require('./config/db');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en el archivo .env');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

conectarDB(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
  })
  .catch(() => process.exit(1));
