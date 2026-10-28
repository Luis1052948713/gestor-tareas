/**
 * Conexión a MongoDB (local o Atlas) reutilizable entre peticiones.
 * @module config/db
 */
const dns = require('dns');
const mongoose = require('mongoose');

/**
 * Las URI `mongodb+srv://` de Atlas necesitan una consulta DNS de tipo SRV.
 * En algunos Windows, Node usa un DNS (p. ej. 127.0.0.1) que no responde estas
 * consultas; en ese caso se cambia a DNS públicos antes de conectar.
 * @param {string} uri - Cadena de conexión.
 * @returns {Promise<void>}
 */
async function prepararDNS(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;
  const host = new URL(uri).hostname;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('El DNS del sistema no resolvió el clúster de Atlas; usando DNS públicos (8.8.8.8, 1.1.1.1).');
  }
}

/**
 * Oculta usuario y contraseña para poder mostrar la URI en consola sin exponerlos.
 * @param {string} uri - Cadena de conexión.
 * @returns {string} La URI con las credenciales reemplazadas por `****`.
 * @example
 * uriSegura('mongodb+srv://ana:clave@cluster0.mongodb.net') // → 'mongodb+srv://****@cluster0.mongodb.net'
 */
function uriSegura(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//****@');
}

/**
 * Traduce los errores de conexión más comunes (sobre todo de Atlas) a una sugerencia en español.
 * @param {Error} err - Error devuelto por el driver de MongoDB.
 * @returns {string|null} Sugerencia para resolverlo, o `null` si no se reconoce.
 */
function sugerencia(err) {
  const m = err.message || '';
  if (/authentication failed|bad auth/i.test(m)) {
    return 'Revisa el usuario y la contraseña de la URI (Atlas → Database Access). Si la contraseña tiene caracteres como @ : / # %, codifícalos (por ejemplo @ → %40).';
  }
  if (/ENOTFOUND|querySrv/i.test(m)) {
    return 'No se encontró el servidor. Revisa que la URI esté bien copiada y que tengas conexión a internet. '
      + 'Si la URI es correcta y usas "mongodb+srv://", tu red puede estar bloqueando las consultas DNS SRV: '
      + 'cambia el DNS a 8.8.8.8 o usa la cadena de conexión estándar ("mongodb://...") que ofrece Atlas para drivers antiguos.';
  }
  if (/ECONNREFUSED/.test(m)) {
    return 'No hay un MongoDB escuchando en esa dirección. ¿Está iniciado el servicio de MongoDB local?';
  }
  if (/whitelist|IP address|Could not connect to any servers|Server selection timed out/i.test(m)) {
    return 'Atlas no acepta conexiones desde tu IP. Agrégala en Atlas → Network Access → Add IP Address.';
  }
  return null;
}

// Conexión en curso o ya establecida; se reutiliza entre peticiones (clave en Vercel)
let conexion = null;

/**
 * Conecta a MongoDB. Si ya hay conexión (o una en curso) la reutiliza, lo que evita
 * abrir una conexión nueva en cada petición cuando la app corre en Vercel.
 * Si falla, muestra una sugerencia en consola y lanza el error para que quien llama decida.
 * @param {string} uri - Cadena de conexión (`mongodb://` o `mongodb+srv://`).
 * @returns {Promise<void>} Se resuelve cuando la conexión está lista.
 * @throws {Error} Si no se puede conectar.
 * @example
 * await conectarDB(process.env.MONGODB_URI);
 */
function conectarDB(uri) {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (conexion) return conexion;

  conexion = (async () => {
    await prepararDNS(uri);
    await mongoose.connect(uri, {
      // Siempre usamos esta base de datos, aunque la URI de Atlas no la incluya
      dbName: process.env.DB_NAME || 'gestor_tareas',
      serverSelectionTimeoutMS: 10000,
    });
    const { host, name } = mongoose.connection;
    console.log(`Conectado a MongoDB (${host}) - base de datos: ${name}`);
  })().catch((err) => {
    conexion = null; // permite reintentar en la siguiente petición
    console.error(`No se pudo conectar a MongoDB en ${uriSegura(uri)}`);
    console.error(err.message);
    const pista = sugerencia(err);
    if (pista) console.error('Sugerencia:', pista);
    throw err;
  });

  return conexion;
}

module.exports = conectarDB;
