/**
 * Envío de correos de la aplicación mediante SMTP (por ejemplo, Gmail).
 * @module services/correo
 */
const nodemailer = require('nodemailer');

/** Transporte SMTP; se crea una sola vez y se reutiliza entre peticiones. */
let transporte = null;

/**
 * Crea (o reutiliza) el transporte SMTP con las variables de entorno.
 * @returns {import('nodemailer').Transporter}
 */
function obtenerTransporte() {
  if (!transporte) {
    const puerto = Number(process.env.SMTP_PORT) || 465;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporte;
}

/**
 * Envía un correo. Sin SMTP configurado y fuera de producción, muestra el contenido
 * en la consola para poder desarrollar en local; en producción lanza un error.
 * @param {string} email - Correo del destinatario.
 * @param {string} asunto - Asunto del correo.
 * @param {string} texto - Cuerpo en texto plano.
 * @returns {Promise<void>}
 * @throws {Error} Si falta la configuración en producción o el servidor SMTP rechaza el envío.
 */
async function enviar(email, asunto, texto) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Falta configurar SMTP_HOST para enviar correos');
    }
    console.log(`[Desarrollo] Correo para ${email}: ${asunto}`);
    return;
  }

  await obtenerTransporte().sendMail({
    from: `"Gestor de tareas" <${process.env.CORREO_REMITENTE || process.env.SMTP_USER}>`,
    to: email,
    subject: asunto,
    text: texto,
  });
}

/**
 * Envía el código de verificación de una cuenta nueva.
 * @param {string} email - Correo del destinatario.
 * @param {string} nombre - Nombre del destinatario.
 * @param {string} codigo - Código de 6 dígitos.
 * @returns {Promise<void>}
 * @example
 * await correo.enviarCodigoVerificacion('ana@correo.com', 'Ana', '482913');
 */
function enviarCodigoVerificacion(email, nombre, codigo) {
  return enviar(
    email,
    `${codigo} es tu código de verificación`,
    `Hola, ${nombre}.\n\nTu código para activar tu cuenta del Gestor de tareas es: ${codigo}\n\nVence en 15 minutos. Si no creaste esta cuenta, ignora este correo.`
  );
}

/**
 * Envía el código para restablecer la contraseña.
 * @param {string} email - Correo del destinatario.
 * @param {string} nombre - Nombre del destinatario.
 * @param {string} codigo - Código de 6 dígitos.
 * @returns {Promise<void>}
 */
function enviarCodigoRecuperacion(email, nombre, codigo) {
  return enviar(
    email,
    `${codigo} es tu código para restablecer la contraseña`,
    `Hola, ${nombre}.\n\nTu código para restablecer la contraseña del Gestor de tareas es: ${codigo}\n\nVence en 15 minutos. Si no lo pediste, ignora este correo: tu contraseña no cambiará.`
  );
}

module.exports = { enviarCodigoVerificacion, enviarCodigoRecuperacion };
