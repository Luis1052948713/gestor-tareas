/**
 * Pruebas de registro, inicio de sesión y seguridad de usuarios.
 * Ejecutar con: npm test
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, mongoose, prepararBD, cerrarBD, limpiarBD, registrarUsuario } = require('./helpers');

describe('Autenticación', () => {
  before(prepararBD);
  after(cerrarBD);
  beforeEach(limpiarBD);

  describe('POST /api/auth/registro', () => {
    it('registra un usuario y devuelve token y datos públicos', async () => {
      const { respuesta } = await registrarUsuario({ nombre: 'Ana', email: 'ana@prueba.test' });
      assert.equal(respuesta.status, 201);
      assert.ok(respuesta.body.token, 'debe devolver un token');
      assert.equal(respuesta.body.usuario.nombre, 'Ana');
      assert.equal(respuesta.body.usuario.email, 'ana@prueba.test');
      assert.equal(respuesta.body.usuario.password, undefined, 'nunca debe devolver la contraseña');
    });

    it('guarda la contraseña con hash bcrypt, no en texto plano', async () => {
      await registrarUsuario({ email: 'hash@prueba.test', password: 'miClave123' });
      const doc = await mongoose.connection.db.collection('users').findOne({ email: 'hash@prueba.test' });
      assert.notEqual(doc.password, 'miClave123');
      assert.match(doc.password, /^\$2[aby]\$10\$/, 'debe ser un hash bcrypt de 10 rondas');
    });

    it('normaliza el correo a minúsculas', async () => {
      const { respuesta } = await registrarUsuario({ email: 'MAYUS@Prueba.TEST' });
      assert.equal(respuesta.body.usuario.email, 'mayus@prueba.test');
    });

    it('rechaza un correo ya registrado (409)', async () => {
      await registrarUsuario({ email: 'repetido@prueba.test' });
      const { respuesta } = await registrarUsuario({ email: 'repetido@prueba.test' });
      assert.equal(respuesta.status, 409);
    });

    it('rechaza contraseñas de menos de 6 caracteres (400)', async () => {
      const { respuesta } = await registrarUsuario({ password: '123' });
      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.error, /6 caracteres/);
    });

    it('rechaza un correo con formato inválido (400)', async () => {
      const { respuesta } = await registrarUsuario({ email: 'no-es-un-correo' });
      assert.equal(respuesta.status, 400);
    });

    it('rechaza el registro sin nombre (400)', async () => {
      const { respuesta } = await registrarUsuario({ nombre: '' });
      assert.equal(respuesta.status, 400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(() => registrarUsuario({ email: 'login@prueba.test', password: 'correcta1' }));

    it('inicia sesión con credenciales correctas', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'login@prueba.test', password: 'correcta1' });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });

    it('acepta el correo sin importar mayúsculas', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'LOGIN@prueba.test', password: 'correcta1' });
      assert.equal(res.status, 200);
    });

    it('rechaza una contraseña incorrecta (401)', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'login@prueba.test', password: 'incorrecta' });
      assert.equal(res.status, 401);
    });

    it('da el mismo mensaje si el correo no existe (no revela qué correos hay)', async () => {
      const malaClave = await request(app).post('/api/auth/login').send({ email: 'login@prueba.test', password: 'x' });
      const sinCuenta = await request(app).post('/api/auth/login').send({ email: 'nadie@prueba.test', password: 'x' });
      assert.equal(sinCuenta.status, 401);
      assert.equal(sinCuenta.body.error, malaClave.body.error);
    });

    it('exige correo y contraseña (400)', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'login@prueba.test' });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/auth/yo y protección de rutas', () => {
    it('devuelve el usuario de la sesión con un token válido', async () => {
      const { token } = await registrarUsuario({ nombre: 'Beto', email: 'beto@prueba.test' });
      const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.usuario.nombre, 'Beto');
    });

    it('rechaza peticiones sin token (401)', async () => {
      const res = await request(app).get('/api/auth/yo');
      assert.equal(res.status, 401);
    });

    it('rechaza un token falsificado (401)', async () => {
      const res = await request(app).get('/api/tareas').set('Authorization', 'Bearer token.falso.123');
      assert.equal(res.status, 401);
    });

    it('responde 400 ante un JSON mal formado', async () => {
      const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{malo');
      assert.equal(res.status, 400);
    });

    it('responde 404 en rutas de API inexistentes', async () => {
      const res = await request(app).get('/api/no-existe');
      assert.equal(res.status, 404);
    });
  });
});
