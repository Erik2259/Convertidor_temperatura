const CACHE = 'temperature-converter-v9';
const CACHE_WIDGET = 'tc-widget-datos';
const CLAVE_DATOS = './widgets/ultima-conversion-datos.json';
const CLAVE_SYNC = './widgets/sync-estado.json';
const CLAVE_SIM = './widgets/sim-fallo.json';   // modo de demostración: fuerza que la sincronización falle
const TAG_WIDGET = 'ultima-conversion';
const TAG_SYNC = 'actualizar-widget';      // Periodic Background Sync
const TAG_REINTENTO = 'actualizar-cache';  // Background Sync: reintento al recuperar la conexión
const ARCHIVOS = [
  './', './index.html', './converter.css', './converter.js',
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
async function simulandoFallo() {
  const r = await (await caches.open(CACHE_WIDGET)).match(CLAVE_SIM);
  return r ? (await r.json()).activo === true : false;
}

async function actualizarCache() {
  if (await simulandoFallo()) throw new Error('Fallo simulado');
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

async function sincronizar(origen) {
  let ok = true;
  try { await actualizarCache(); }
  catch { ok = false; await self.registration.sync?.register(TAG_REINTENTO).catch(() => {}); }
  await actualizarWidget();
  await registrarResultado(origen, ok);
}

self.addEventListener('periodicsync', e => {
  if (e.tag === TAG_SYNC) e.waitUntil(sincronizar('periódica'));
});

self.addEventListener('sync', e => {
  if (e.tag !== TAG_REINTENTO) return;
  e.waitUntil((async () => {
    const ok = await actualizarCache().then(() => true, () => false);
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
  if (tipo === 'sync-ahora') e.waitUntil(sincronizar('manual'));
  if (tipo === 'sim-fallo') {
    e.waitUntil(caches.open(CACHE_WIDGET).then(c =>
      c.put(CLAVE_SIM, new Response(JSON.stringify({ activo: !!e.data.activo }), { headers: { 'Content-Type': 'application/json' } }))));
  }
});
