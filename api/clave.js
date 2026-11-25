// Devuelve la clave pública VAPID para que la página pueda suscribirse a las notificaciones push.
module.exports = (req, res) => {
  const clave = process.env.VAPID_PUBLIC_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!clave) return res.status(503).json({ error: 'Push no configurado en el servidor' });
  res.status(200).json({ clave });
};
