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
 * Envía el código de verificación de una cuenta nueva.
 * Sin SMTP configurado y fuera de producción, muestra el código en la consola
 * para poder desarrollar en local; en producción lanza un error.
 * @param {string} email - Correo del destinatario.
 * @param {string} nombre - Nombre del destinatario.
 * @param {string} codigo - Código de 6 dígitos.
 * @returns {Promise<void>}
 * @throws {Error} Si falta la configuración en producción o el servidor SMTP rechaza el envío.
 * @example
 * await correo.enviarCodigoVerificacion('ana@correo.com', 'Ana', '482913');
 */
async function enviarCodigoVerificacion(email, nombre, codigo) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Falta configurar SMTP_HOST para enviar correos');
    }
    console.log(`[Desarrollo] Código de verificación para ${email}: ${codigo}`);
    return;
  }

  await obtenerTransporte().sendMail({
    from: `"Gestor de tareas" <${process.env.CORREO_REMITENTE || process.env.SMTP_USER}>`,
    to: email,
    subject: `${codigo} es tu código de verificación`,
    text: `Hola, ${nombre}.\n\nTu código para activar tu cuenta del Gestor de tareas es: ${codigo}\n\nVence en 15 minutos. Si no creaste esta cuenta, ignora este correo.`,
  });
}

module.exports = { enviarCodigoVerificacion };
