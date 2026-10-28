/**
 * Pruebas de la gestión de tareas: crear, listar, filtrar, editar, completar,
 * eliminar, agrupar por categorías y aislamiento entre usuarios.
 * Ejecutar con: npm test
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prepararBD, cerrarBD, limpiarBD, registrarUsuario } = require('./helpers');

/**
 * Crea un cliente HTTP autenticado con el token de un usuario.
 * @param {string} token - Token JWT del usuario.
 * @returns {{get: Function, post: Function, put: Function, patch: Function, delete: Function}}
 */
function clienteCon(token) {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, cuerpo) => auth(request(app).post(url)).send(cuerpo),
    put: (url, cuerpo) => auth(request(app).put(url)).send(cuerpo),
    patch: (url, cuerpo) => auth(request(app).patch(url)).send(cuerpo),
    delete: (url) => auth(request(app).delete(url)),
  };
}

describe('Tareas', () => {
  let ana;

  before(prepararBD);
  after(cerrarBD);
  beforeEach(async () => {
    await limpiarBD();
    const { token } = await registrarUsuario({ nombre: 'Ana', email: 'ana@prueba.test' });
    ana = clienteCon(token);
  });

  describe('Creación', () => {
    it('crea una tarea con todos sus campos', async () => {
      const res = await ana.post('/api/tareas', {
        titulo: 'Entregar informe', descripcion: 'Capítulo 1', categoria: 'Universidad', fechaVencimiento: '2026-11-15',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.titulo, 'Entregar informe');
      assert.equal(res.body.categoria, 'Universidad');
      assert.equal(res.body.fechaVencimiento.slice(0, 10), '2026-11-15');
      assert.equal(res.body.completada, false);
    });

    it('asigna la categoría "General" si no se indica', async () => {
      const res = await ana.post('/api/tareas', { titulo: 'Sin categoría', categoria: '' });
      assert.equal(res.body.categoria, 'General');
    });

    it('permite tareas sin fecha de vencimiento', async () => {
      const res = await ana.post('/api/tareas', { titulo: 'Sin fecha', fechaVencimiento: '' });
      assert.equal(res.status, 201);
      assert.equal(res.body.fechaVencimiento, null);
    });

    it('exige un título (400)', async () => {
      const res = await ana.post('/api/tareas', { titulo: '   ' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /título/);
    });

    it('rechaza una fecha inválida (400)', async () => {
      const res = await ana.post('/api/tareas', { titulo: 'Fecha mala', fechaVencimiento: 'no-es-fecha' });
      assert.equal(res.status, 400);
    });

    it('ignora un "usuario" enviado por el cliente (la tarea siempre es del dueño del token)', async () => {
      const res = await ana.post('/api/tareas', { titulo: 'Intento', usuario: '000000000000000000000000' });
      const yo = await ana.get('/api/auth/yo');
      assert.equal(res.body.usuario, yo.body.usuario.id);
    });
  });

  describe('Listado y filtros', () => {
    beforeEach(async () => {
      await ana.post('/api/tareas', { titulo: 'A', categoria: 'Casa', fechaVencimiento: '2026-12-01' });
      await ana.post('/api/tareas', { titulo: 'B', categoria: 'Trabajo', fechaVencimiento: '2026-11-01' });
      const c = await ana.post('/api/tareas', { titulo: 'C', categoria: 'Casa' });
      await ana.patch(`/api/tareas/${c.body._id}/completar`, { completada: true });
    });

    it('lista todas las tareas del usuario, pendientes primero y por fecha', async () => {
      const res = await ana.get('/api/tareas');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.map((t) => t.titulo), ['B', 'A', 'C']);
    });

    it('filtra por estado pendientes / completadas', async () => {
      const pendientes = await ana.get('/api/tareas?estado=pendientes');
      const completadas = await ana.get('/api/tareas?estado=completadas');
      assert.deepEqual(pendientes.body.map((t) => t.titulo).sort(), ['A', 'B']);
      assert.deepEqual(completadas.body.map((t) => t.titulo), ['C']);
    });

    it('filtra por categoría', async () => {
      const res = await ana.get('/api/tareas?categoria=Casa');
      assert.deepEqual(res.body.map((t) => t.titulo).sort(), ['A', 'C']);
    });

    it('agrupa por categorías con totales y pendientes', async () => {
      const res = await ana.get('/api/tareas/categorias');
      assert.deepEqual(res.body, [
        { nombre: 'Casa', total: 2, pendientes: 1 },
        { nombre: 'Trabajo', total: 1, pendientes: 1 },
      ]);
    });
  });

  describe('Edición, completado y eliminación', () => {
    let tarea;
    beforeEach(async () => {
      tarea = (await ana.post('/api/tareas', { titulo: 'Original', categoria: 'Casa' })).body;
    });

    it('edita título, descripción, categoría y fecha', async () => {
      const res = await ana.put(`/api/tareas/${tarea._id}`, {
        titulo: 'Editada', descripcion: 'Nueva', categoria: 'Trabajo', fechaVencimiento: '2026-12-24',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.titulo, 'Editada');
      assert.equal(res.body.descripcion, 'Nueva');
      assert.equal(res.body.categoria, 'Trabajo');
      assert.equal(res.body.fechaVencimiento.slice(0, 10), '2026-12-24');
    });

    it('permite quitar la fecha de vencimiento', async () => {
      await ana.put(`/api/tareas/${tarea._id}`, { fechaVencimiento: '2026-12-24' });
      const res = await ana.put(`/api/tareas/${tarea._id}`, { fechaVencimiento: '' });
      assert.equal(res.body.fechaVencimiento, null);
    });

    it('marca como completada y luego como pendiente', async () => {
      const hecha = await ana.patch(`/api/tareas/${tarea._id}/completar`, { completada: true });
      assert.equal(hecha.body.completada, true);
      const pendiente = await ana.patch(`/api/tareas/${tarea._id}/completar`, { completada: false });
      assert.equal(pendiente.body.completada, false);
    });

    it('alterna el estado si no se envía "completada"', async () => {
      const res = await ana.patch(`/api/tareas/${tarea._id}/completar`, {});
      assert.equal(res.body.completada, true);
    });

    it('elimina la tarea (204) y ya no aparece en el listado', async () => {
      const res = await ana.delete(`/api/tareas/${tarea._id}`);
      assert.equal(res.status, 204);
      const lista = await ana.get('/api/tareas');
      assert.equal(lista.body.length, 0);
    });

    it('responde 404 con un id inexistente o mal formado', async () => {
      assert.equal((await ana.delete('/api/tareas/000000000000000000000000')).status, 404);
      assert.equal((await ana.put('/api/tareas/abc', { titulo: 'x' })).status, 404);
    });
  });

  describe('Privacidad entre usuarios', () => {
    it('un usuario no puede ver, editar, completar ni borrar tareas de otro', async () => {
      const tareaDeAna = (await ana.post('/api/tareas', { titulo: 'Privada de Ana' })).body;
      const { token } = await registrarUsuario({ nombre: 'Beto', email: 'beto@prueba.test' });
      const beto = clienteCon(token);

      assert.equal((await beto.get('/api/tareas')).body.length, 0, 'Beto no ve las tareas de Ana');
      assert.equal((await beto.get('/api/tareas/categorias')).body.length, 0);
      assert.equal((await beto.put(`/api/tareas/${tareaDeAna._id}`, { titulo: 'Hackeada' })).status, 404);
      assert.equal((await beto.patch(`/api/tareas/${tareaDeAna._id}/completar`, {})).status, 404);
      assert.equal((await beto.delete(`/api/tareas/${tareaDeAna._id}`)).status, 404);

      const lista = await ana.get('/api/tareas');
      assert.equal(lista.body[0].titulo, 'Privada de Ana', 'la tarea de Ana sigue intacta');
    });
  });
});
