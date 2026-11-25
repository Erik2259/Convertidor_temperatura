importScripts('pendientes.js');

const CACHE = 'temperature-converter-v14';
const CACHE_WIDGET = 'tc-widget-datos';
const CLAVE_DATOS = './widgets/ultima-conversion-datos.json';
const CLAVE_NOTIF = './widgets/notif-diag.json';
const CLAVE_SYNC = './widgets/sync-estado.json';
const TAG_WIDGET = 'ultima-conversion';
const TAG_SYNC = 'actualizar-widget';      // Periodic Background Sync
const TAG_PENDIENTES = 'sincronizar-pendientes';  // Background Sync: conversiones hechas sin conexión
const TAG_REINTENTO = 'actualizar-cache';  // Background Sync: reintento al recuperar la conexión
const ARCHIVOS = [
  './', './index.html', './converter.css', './converter.js', './pendientes.js',
  './widgets/ultima-conversion-plantilla.json', './widgets/ultima-conversion-datos.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_WIDGET).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => registrarSync())
      .then(() => actualizarWidget())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then(r => r || fetch(e.request)));
});

// ---- Widget de Windows 11 ----
async function registrarSync() {
  try {
    await self.registration.periodicSync.register(TAG_SYNC, { minInterval: 60 * 60 * 1000 });
  } catch { /* permiso denegado o API no disponible: el widget se actualiza al convertir */ }
}

async function leerDatos() {
  const guardado = await (await caches.open(CACHE_WIDGET)).match(CLAVE_DATOS);
  return guardado || (await caches.match(CLAVE_DATOS)) || fetch(CLAVE_DATOS);
}

async function actualizarWidget() {
  if (!self.widgets) return;
  try {
    const [plantilla, datos] = await Promise.all([
      caches.match('./widgets/ultima-conversion-plantilla.json').then(r => r || fetch('./widgets/ultima-conversion-plantilla.json')).then(r => r.text()),
      leerDatos().then(r => r.text())
    ]);
    await self.widgets.updateByTag(TAG_WIDGET, { template: plantilla, data: datos });
  } catch (err) { console.error('Widget: no se pudo actualizar', err); }
}

self.addEventListener('widgetinstall', e => e.waitUntil(registrarSync().then(actualizarWidget)));
self.addEventListener('widgetresume', e => e.waitUntil(actualizarWidget()));
// Vuelve a descargar los archivos de la app para que las versiones nuevas estén listas al abrirla
async function actualizarCache() {
  const cache = await caches.open(CACHE);
  await Promise.all(ARCHIVOS.map(async url => {
    const r = await fetch(url, { cache: 'reload' });
    if (r.ok) await cache.put(url, r);
  }));
}

// Guarda el resultado de la última sincronización (lo lee la página) y avisa a las ventanas abiertas
async function registrarResultado(origen, ok) {
  const resultado = { origen, ok, fecha: Date.now() };
  const cache = await caches.open(CACHE_WIDGET);
  await cache.put(CLAVE_SYNC, new Response(JSON.stringify(resultado), { headers: { 'Content-Type': 'application/json' } }));
  for (const c of await clients.matchAll({ includeUncontrolled: true })) c.postMessage({ tipo: 'sync-resultado', ...resultado });
}

// Vacía la cola, quita el distintivo y, si la app está cerrada, avisa con una notificación
async function finalizarPendientes() {
  const n = await pendContar();
  await pendVaciar();
  try { await self.navigator.clearAppBadge?.(); } catch { /* sin API de distintivos */ }
  const diag = { fecha: new Date().toISOString(), pendientes: n, permiso: self.Notification?.permission ?? 'sin API', ventanas: [], resultado: '' };
  try {
    if (!n) diag.resultado = 'sin pendientes: no se avisa';
    else if (diag.permiso !== 'granted') diag.resultado = 'sin permiso: no se avisa';
    else {
      diag.ventanas = (await clients.matchAll({ type: 'window' })).map(v => v.visibilityState);
      if (diag.ventanas.includes('visible')) diag.resultado = 'app a la vista: no se avisa';
      else {
        await self.registration.showNotification('Convertidor de temperatura', {
          body: `Se actualizaron ${n} ${n === 1 ? 'cambio' : 'cambios'}`,
          icon: 'icons/icon512.png',
          tag: 'sync-pendientes',
          renotify: true,
          actions: [{ action: 'abrir', title: 'Abrir' }, { action: 'cerrar', title: 'Cerrar' }]
        });
        diag.resultado = `notificación enviada; activas: ${(await self.registration.getNotifications()).length}`;
      }
    }
  } catch (err) {
    diag.resultado = `error al notificar: ${err.name}: ${err.message}`;
  }
  console.log('[notificación]', diag);
  const cache = await caches.open(CACHE_WIDGET);   // el último intento queda guardado para consultarlo desde la consola
  await cache.put(CLAVE_NOTIF, new Response(JSON.stringify(diag), { headers: { 'Content-Type': 'application/json' } }));
}

async function sincronizar(origen) {
  let ok = true;
  try { await actualizarCache(); await finalizarPendientes(); }
  catch { ok = false; await self.registration.sync?.register(TAG_REINTENTO).catch(() => {}); }
  await actualizarWidget();
  await registrarResultado(origen, ok);
}

self.addEventListener('periodicsync', e => {
  if (e.tag === TAG_SYNC) e.waitUntil(sincronizar('periódica'));
});

self.addEventListener('sync', e => {
  if (e.tag !== TAG_REINTENTO && e.tag !== TAG_PENDIENTES) return;
  e.waitUntil((async () => {
    const ok = await actualizarCache().then(() => finalizarPendientes()).then(() => true, () => false);
    await actualizarWidget();
    await registrarResultado('reintento', ok);
    if (!ok) throw new Error('Reintento fallido');   // el navegador volverá a intentarlo
  })());
});

self.addEventListener('widgetclick', e => {
  const verbo = e.action;
  if (verbo === 'abrir' || verbo === 'nueva') {
    e.waitUntil(clients.openWindow(verbo === 'nueva' ? './index.html?nueva=1' : './index.html'));
  }
});

self.addEventListener('message', e => {
  const tipo = e.data?.tipo;
  if (tipo === 'widget-actualizar') e.waitUntil(actualizarWidget());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'cerrar') return;
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ventanas =>
    ventanas.length ? ventanas[0].focus() : clients.openWindow('./index.html')));
});

// Notificación push enviada desde el servidor (api/enviar.js); con userVisibleOnly siempre debe mostrarse
self.addEventListener('push', e => {
  let datos = {};
  try { datos = e.data?.json() ?? {}; } catch { datos = { cuerpo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(datos.titulo || 'Convertidor de temperatura', {
    body: datos.cuerpo || 'Tienes una notificación',
    icon: 'icons/icon512.png',
    tag: 'push',
    renotify: true,
    actions: [{ action: 'abrir', title: 'Abrir' }, { action: 'cerrar', title: 'Cerrar' }]
  }));
});
