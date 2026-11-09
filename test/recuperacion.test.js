/**
 * Pruebas de la recuperación de contraseña por correo.
 * Ejecutar con: npm test
 */
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app, request, mongoose, correo, buzon, enviarSimulado, prepararBD, cerrarBD, limpiarBD, registrarPendiente, registrarUsuario,
} = require('./helpers');

const EMAIL = 'ana@prueba.test';
const CLAVE = 'claveVieja1';
const NUEVA = 'claveNueva2';

const recuperar = (email) => request(app).post('/api/auth/recuperar').send({ email });
const restablecer = (email, codigo, password) => request(app).post('/api/auth/restablecer').send({ email, codigo, password });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const usuarios = () => mongoose.connection.db.collection('users');

/**
 * Devuelve un código de 6 dígitos distinto del indicado.
 * @param {string} codigo - Código correcto.
 * @returns {string}
 */
const codigoErroneo = (codigo) => (codigo === '111111' ? '222222' : '111111');

describe('Recuperación de contraseña', () => {
  let tokenAnterior;

  before(prepararBD);
  after(cerrarBD);
  beforeEach(async () => {
    await limpiarBD();
    buzon.clear();
    ({ token: tokenAnterior } = await registrarUsuario({ email: EMAIL, password: CLAVE }));
    buzon.clear();
  });
  afterEach(() => {
    correo.enviarCodigoRecuperacion = enviarSimulado;
  });

  it('cambia la contraseña con el código correcto', async () => {
    await recuperar(EMAIL);
    const res = await restablecer(EMAIL, buzon.get(EMAIL), NUEVA);
    assert.equal(res.status, 200);
    assert.equal((await login(EMAIL, CLAVE)).status, 401, 'la contraseña anterior deja de servir');
    assert.equal((await login(EMAIL, NUEVA)).status, 200);
  });

  it('guarda la contraseña nueva con hash y borra el código', async () => {
    await recuperar(EMAIL);
    await restablecer(EMAIL, buzon.get(EMAIL), NUEVA);
    const doc = await usuarios().findOne({ email: EMAIL });
    assert.match(doc.password, /^\$2[aby]\$10\$/);
    assert.equal(doc.codigoHash, undefined);
  });

  it('cierra las sesiones abiertas antes del cambio', async () => {
    const antes = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAnterior}`);
    assert.equal(antes.status, 200);
    await recuperar(EMAIL);
    await restablecer(EMAIL, buzon.get(EMAIL), NUEVA);
    const despues = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAnterior}`);
    assert.equal(despues.status, 401);
    const { body } = await login(EMAIL, NUEVA);
    assert.equal((await request(app).get('/api/tareas').set('Authorization', `Bearer ${body.token}`)).status, 200);
  });

  it('pedir un código sin usarlo no cambia nada', async () => {
    await recuperar(EMAIL);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
    assert.equal((await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAnterior}`)).status, 200);
  });

  it('responde igual si el correo no existe (no revela correos)', async () => {
    const existe = await recuperar(EMAIL);
    const noExiste = await recuperar('nadie@prueba.test');
    assert.equal(noExiste.status, existe.status);
    assert.deepEqual(noExiste.body, existe.body);
    assert.equal(buzon.has('nadie@prueba.test'), false);
  });

  it('rechaza un código incorrecto sin cambiar la contraseña', async () => {
    await recuperar(EMAIL);
    const res = await restablecer(EMAIL, codigoErroneo(buzon.get(EMAIL)), NUEVA);
    assert.equal(res.status, 400);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
  });

  it('invalida el código tras 5 intentos, aunque el sexto sea correcto', async () => {
    await recuperar(EMAIL);
    const codigo = buzon.get(EMAIL);
    for (let i = 0; i < 5; i++) await restablecer(EMAIL, codigoErroneo(codigo), NUEVA);
    assert.equal((await restablecer(EMAIL, codigo, NUEVA)).status, 400);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
  });

  it('rechaza un código vencido', async () => {
    await recuperar(EMAIL);
    await usuarios().updateOne({ email: EMAIL }, { $set: { codigoExpira: new Date(Date.now() - 1000) } });
    assert.equal((await restablecer(EMAIL, buzon.get(EMAIL), NUEVA)).status, 400);
  });

  it('no permite reutilizar un código', async () => {
    await recuperar(EMAIL);
    const codigo = buzon.get(EMAIL);
    assert.equal((await restablecer(EMAIL, codigo, NUEVA)).status, 200);
    assert.equal((await restablecer(EMAIL, codigo, 'otraClave3')).status, 400);
    assert.equal((await login(EMAIL, NUEVA)).status, 200);
  });

  it('rechaza una contraseña corta sin gastar un intento', async () => {
    await recuperar(EMAIL);
    const codigo = buzon.get(EMAIL);
    assert.equal((await restablecer(EMAIL, codigo, '123')).status, 400);
    const doc = await usuarios().findOne({ email: EMAIL });
    assert.equal(doc.codigoIntentos, 0);
    assert.equal((await restablecer(EMAIL, codigo, NUEVA)).status, 200);
  });

  it('limita a un envío por minuto', async () => {
    await recuperar(EMAIL);
    buzon.delete(EMAIL);
    await recuperar(EMAIL);
    assert.equal(buzon.has(EMAIL), false);
    await usuarios().updateOne({ email: EMAIL }, { $set: { codigoEnviadoEn: new Date(Date.now() - 61000) } });
    await recuperar(EMAIL);
    assert.ok(buzon.get(EMAIL));
  });

  it('no envía código a cuentas pendientes de verificar', async () => {
    await registrarPendiente({ email: 'pendiente@prueba.test' });
    const codigoVerificacion = buzon.get('pendiente@prueba.test');
    buzon.delete('pendiente@prueba.test');
    await recuperar('pendiente@prueba.test');
    assert.equal(buzon.has('pendiente@prueba.test'), false);
    assert.equal((await restablecer('pendiente@prueba.test', codigoVerificacion, NUEVA)).status, 400);
  });

  it('no acepta objetos de MongoDB como correo', async () => {
    await recuperar(EMAIL);
    assert.equal((await restablecer({ $ne: null }, { $ne: null }, NUEVA)).status, 400);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
  });

  it('funciona con cuentas anteriores a la verificación y mantiene su acceso', async () => {
    const User = mongoose.model('User');
    await User.create({ nombre: 'Antigua', email: 'antigua@prueba.test', password: CLAVE });
    await usuarios().updateOne({ email: 'antigua@prueba.test' }, { $unset: { sesionVersion: 1 } });
    assert.equal((await login('antigua@prueba.test', CLAVE)).status, 200);
    await recuperar('antigua@prueba.test');
    assert.equal((await restablecer('antigua@prueba.test', buzon.get('antigua@prueba.test'), NUEVA)).status, 200);
    assert.equal((await login('antigua@prueba.test', NUEVA)).status, 200);
  });

  it('sin poder enviar el correo responde igual y la contraseña no cambia', async () => {
    correo.enviarCodigoRecuperacion = async () => {
      throw new Error('SMTP caído');
    };
    assert.equal((await recuperar(EMAIL)).status, 200);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
  });
});
