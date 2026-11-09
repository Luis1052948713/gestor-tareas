/**
 * Pruebas de la verificación de correo con código de 6 dígitos.
 * Ejecutar con: npm test
 */
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  app, request, mongoose, correo, buzon, enviarSimulado, prepararBD, cerrarBD, limpiarBD, registrarPendiente,
} = require('./helpers');

const EMAIL = 'nueva@prueba.test';
const CLAVE = 'clave123';

const verificar = (email, codigo) => request(app).post('/api/auth/verificar').send({ email, codigo });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const reenviar = (email) => request(app).post('/api/auth/reenviar').send({ email });
const usuarios = () => mongoose.connection.db.collection('users');

/**
 * Devuelve un código de 6 dígitos distinto del indicado.
 * @param {string} codigo - Código correcto.
 * @returns {string}
 */
const codigoErroneo = (codigo) => (codigo === '111111' ? '222222' : '111111');

describe('Verificación de correo', () => {
  before(prepararBD);
  after(cerrarBD);
  beforeEach(async () => {
    await limpiarBD();
    buzon.clear();
  });
  afterEach(() => {
    correo.enviarCodigoVerificacion = enviarSimulado;
  });

  it('envía un código de 6 dígitos y no lo guarda en texto plano', async () => {
    await registrarPendiente({ email: EMAIL });
    const codigo = buzon.get(EMAIL);
    assert.match(codigo, /^\d{6}$/);
    const doc = await usuarios().findOne({ email: EMAIL });
    assert.equal(doc.emailVerificado, false);
    assert.ok(doc.codigoHash);
    assert.ok(!JSON.stringify(doc).includes(codigo), 'el código no debe estar en la base de datos');
  });

  it('no deja iniciar sesión sin verificar (403), solo con la contraseña correcta', async () => {
    await registrarPendiente({ email: EMAIL, password: CLAVE });
    const res = await login(EMAIL, CLAVE);
    assert.equal(res.status, 403);
    assert.equal(res.body.codigo, 'EMAIL_NO_VERIFICADO');
    assert.equal(res.body.token, undefined);
    assert.equal((await login(EMAIL, 'incorrecta')).status, 401);
  });

  it('con el código correcto activa la cuenta y da acceso', async () => {
    await registrarPendiente({ email: EMAIL, password: CLAVE });
    const res = await verificar(EMAIL, buzon.get(EMAIL));
    assert.equal(res.status, 200);
    const yo = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${res.body.token}`);
    assert.equal(yo.status, 200);
    assert.equal((await login(EMAIL, CLAVE)).status, 200);
    const doc = await usuarios().findOne({ email: EMAIL });
    assert.equal(doc.emailVerificado, true);
    assert.equal(doc.codigoHash, undefined, 'el código se borra al usarlo');
  });

  it('rechaza un código incorrecto', async () => {
    await registrarPendiente({ email: EMAIL });
    const res = await verificar(EMAIL, codigoErroneo(buzon.get(EMAIL)));
    assert.equal(res.status, 400);
    assert.equal(res.body.token, undefined);
  });

  it('invalida el código tras 5 intentos, aunque el sexto sea correcto', async () => {
    await registrarPendiente({ email: EMAIL });
    const codigo = buzon.get(EMAIL);
    for (let i = 0; i < 5; i++) await verificar(EMAIL, codigoErroneo(codigo));
    assert.equal((await verificar(EMAIL, codigo)).status, 400);
  });

  it('rechaza un código vencido', async () => {
    await registrarPendiente({ email: EMAIL });
    await usuarios().updateOne({ email: EMAIL }, { $set: { codigoExpira: new Date(Date.now() - 1000) } });
    assert.equal((await verificar(EMAIL, buzon.get(EMAIL))).status, 400);
  });

  it('no permite reutilizar un código ya usado', async () => {
    await registrarPendiente({ email: EMAIL });
    const codigo = buzon.get(EMAIL);
    assert.equal((await verificar(EMAIL, codigo)).status, 200);
    assert.equal((await verificar(EMAIL, codigo)).status, 400);
  });

  it('un código no sirve para otra cuenta', async () => {
    await registrarPendiente({ email: EMAIL });
    await registrarPendiente({ email: 'otra@prueba.test' });
    const codigoOtra = buzon.get('otra@prueba.test');
    if (codigoOtra !== buzon.get(EMAIL)) assert.equal((await verificar(EMAIL, codigoOtra)).status, 400);
  });

  it('no acepta objetos de MongoDB como correo o código', async () => {
    await registrarPendiente({ email: EMAIL });
    const res = await verificar({ $ne: null }, { $ne: null });
    assert.equal(res.status, 400);
    assert.equal((await reenviar({ $ne: null })).status, 200);
    assert.equal((await usuarios().findOne({ email: EMAIL })).emailVerificado, false);
  });

  it('limita los reenvíos a uno por minuto y el código nuevo reemplaza al anterior', async () => {
    await registrarPendiente({ email: EMAIL });
    const primero = buzon.get(EMAIL);
    buzon.delete(EMAIL);

    assert.equal((await reenviar(EMAIL)).status, 200);
    assert.equal(buzon.has(EMAIL), false, 'antes de un minuto no se envía otro');

    await usuarios().updateOne({ email: EMAIL }, { $set: { codigoEnviadoEn: new Date(Date.now() - 61000) } });
    await reenviar(EMAIL);
    const segundo = buzon.get(EMAIL);
    assert.ok(segundo);
    if (segundo !== primero) assert.equal((await verificar(EMAIL, primero)).status, 400);
    assert.equal((await verificar(EMAIL, segundo)).status, 200);
  });

  it('reenviar responde igual si la cuenta no existe (no revela correos)', async () => {
    await registrarPendiente({ email: EMAIL });
    const existe = await reenviar(EMAIL);
    const noExiste = await reenviar('nadie@prueba.test');
    assert.equal(noExiste.status, existe.status);
    assert.deepEqual(noExiste.body, existe.body);
    assert.equal(buzon.has('nadie@prueba.test'), false);
  });

  it('permite registrar de nuevo un correo pendiente: nadie puede bloquear un correo ajeno', async () => {
    await registrarPendiente({ email: EMAIL, password: 'delIntruso1' });
    const res = await registrarPendiente({ email: EMAIL, password: 'delDueno123' });
    assert.equal(res.status, 201);
    assert.equal((await verificar(EMAIL, buzon.get(EMAIL))).status, 200);
    assert.equal((await login(EMAIL, 'delIntruso1')).status, 401);
    assert.equal((await login(EMAIL, 'delDueno123')).status, 200);
  });

  it('si el correo no se puede enviar responde 502 y no deja la cuenta creada', async () => {
    correo.enviarCodigoVerificacion = async () => {
      throw new Error('SMTP caído');
    };
    const res = await registrarPendiente({ email: EMAIL });
    assert.equal(res.status, 502);
    assert.equal(await usuarios().countDocuments({ email: EMAIL }), 0);
  });

  it('las cuentas creadas antes de la verificación siguen entrando', async () => {
    const User = mongoose.model('User');
    await User.create({ nombre: 'Antigua', email: 'antigua@prueba.test', password: CLAVE });
    const doc = await usuarios().findOne({ email: 'antigua@prueba.test' });
    assert.equal(doc.emailVerificado, undefined);
    assert.equal((await login('antigua@prueba.test', CLAVE)).status, 200);
  });
});
