// Entrada para Vercel: todas las rutas /api/* llegan a esta función,
// que delega en la misma aplicación Express que se usa en local.
const { app } = require('../src/app');

module.exports = app;
