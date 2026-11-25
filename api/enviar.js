// Envía una notificación push a la suscripción que manda la propia página (no se guarda nada en el servidor).
const webpush = require('web-push');

// Solo se aceptan los servicios de push de los navegadores, para que nadie use esta ruta contra otras direcciones.
const SERVICIOS_PUSH = [
  /(^|\.)fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/
];

function endpointPermitido(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && SERVICIOS_PUSH.some(r => r.test(url.hostname));
  } catch {
    return false;
  }
}

const texto = (valor, max, porDefecto) => (typeof valor === 'string' && valor.trim() ? valor.trim() : porDefecto).slice(0, max);

async function enviar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return res.status(503).json({ error: 'Push no configurado en el servidor' });
  }

  const { suscripcion, titulo, cuerpo } = req.body || {};
  const claves = suscripcion?.keys;
  if (typeof suscripcion?.endpoint !== 'string' || typeof claves?.p256dh !== 'string' || typeof claves?.auth !== 'string') {
    return res.status(400).json({ error: 'Suscripción no válida' });
  }
  if (!endpointPermitido(suscripcion.endpoint)) {
    return res.status(400).json({ error: 'Servicio de push no permitido' });
  }

  const mensaje = JSON.stringify({
    titulo: texto(titulo, 60, 'Convertidor de temperatura'),
    cuerpo: texto(cuerpo, 120, 'Notificación de prueba')
  });

  try {
    await webpush.sendNotification(
      { endpoint: suscripcion.endpoint, keys: { p256dh: claves.p256dh, auth: claves.auth } },
      mensaje,
      { TTL: 60, vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY } }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    const caducada = err.statusCode === 404 || err.statusCode === 410;
    res.status(caducada ? 410 : 502).json({ error: caducada ? 'Suscripción caducada' : 'No se pudo enviar el push' });
  }
}

module.exports = enviar;
module.exports.endpointPermitido = endpointPermitido;
