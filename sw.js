const CACHE = 'temperature-converter-v6';
const CACHE_WIDGET = 'tc-widget-datos';
const CLAVE_DATOS = './widgets/ultima-conversion-datos.json';
const TAG_WIDGET = 'ultima-conversion';
const TAG_SYNC = 'actualizar-widget';
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
self.addEventListener('periodicsync', e => { if (e.tag === TAG_SYNC) e.waitUntil(actualizarWidget()); });

self.addEventListener('widgetclick', e => {
  const verbo = e.action;
  if (verbo === 'abrir' || verbo === 'nueva') {
    e.waitUntil(clients.openWindow(verbo === 'nueva' ? './index.html?nueva=1' : './index.html'));
  }
});

self.addEventListener('message', e => {
  if (e.data?.tipo === 'widget-actualizar') e.waitUntil(actualizarWidget());
});
