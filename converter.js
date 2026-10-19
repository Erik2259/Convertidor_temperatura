const inputTemp = document.getElementById('input-temp');
const inputUnit = document.getElementById('input-unit');
const outputUnit = document.getElementById('output-unit');
const outputTemp = document.getElementById('output-temp');

const nombres = { c: 'C', f: 'F', k: 'K' };

function toCelsius(valor, unidad) {
  if (unidad === 'f') return (valor - 32) * 5 / 9;
  if (unidad === 'k') return valor - 273.15;
  return valor;
}

function fromCelsius(celsius, unidad) {
  if (unidad === 'f') return celsius * 9 / 5 + 32;
  if (unidad === 'k') return celsius + 273.15;
  return celsius;
}

let ultimoResultado = NaN;

function convertir() {
  const valor = parseFloat(inputTemp.value);
  if (Number.isNaN(valor)) {
    ultimoResultado = NaN;
    outputTemp.textContent = '—';
    return;
  }
  const resultado = fromCelsius(toCelsius(valor, inputUnit.value), outputUnit.value);
  ultimoResultado = resultado;
  const texto = resultado.toLocaleString('es-MX', { maximumFractionDigits: 1 });
  outputTemp.textContent = `${texto} ${nombres[outputUnit.value]}`;
}

[inputTemp, inputUnit, outputUnit].forEach(el => el.addEventListener('input', convertir));
convertir();

// ---- Superposición de controles de ventana (Window Controls Overlay) ----
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const wcoStatus = document.getElementById('wco-status');

function actualizarEstadoWCO(rect) {
  const wco = navigator.windowControlsOverlay;
  const visible = wco.visible;
  const ancho = Math.round((rect || wco.getTitlebarAreaRect()).width);
  wcoStatus.textContent = visible ? `Superposición activa · ${ancho}px` : '';
  console.log(`The overlay is ${visible ? 'visible' : 'hidden'}, the title bar width is ${ancho}px`);
}

if ('windowControlsOverlay' in navigator) {
  actualizarEstadoWCO();
  navigator.windowControlsOverlay.addEventListener('geometrychange', debounce(e => {
    actualizarEstadoWCO(e.titlebarAreaRect);
  }, 200));
}

// ---- Controles de la barra de título ----
const $ = (id) => document.getElementById(id);

// 1. Intercambiar unidades
function intercambiar() {
  const resultado = ultimoResultado;
  const desde = inputUnit.value;
  inputUnit.value = outputUnit.value;
  outputUnit.value = desde;
  if (!Number.isNaN(resultado)) inputTemp.value = Math.round(resultado * 10) / 10;
  convertir();
}
$('btn-swap').addEventListener('click', intercambiar);

// 2. Copiar resultado
$('btn-copy').addEventListener('click', async () => {
  const texto = `${inputTemp.value} ${nombres[inputUnit.value]} = ${outputTemp.textContent}`;
  try {
    await navigator.clipboard.writeText(texto);
    avisar('Copiado: ' + texto);
  } catch {
    avisar('No se pudo copiar');
  }
});

// 2b. Compartir (Web Share API). El enlace va dentro de "text": WhatsApp ignora "text" si llega "url".
function enlaceCompartido() {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('v', inputTemp.value);
  u.searchParams.set('d', inputUnit.value);
  u.searchParams.set('a', outputUnit.value);
  return u.href;
}
$('btn-share').addEventListener('click', async () => {
  if (Number.isNaN(ultimoResultado)) { avisar('Escribe una temperatura para compartir'); return; }
  const texto = `${inputTemp.value} ${nombres[inputUnit.value]} = ${outputTemp.textContent}

${enlaceCompartido()}`;
  if (!navigator.share) {
    try { await navigator.clipboard.writeText(texto); avisar('Compartir no disponible; se copió el resultado'); }
    catch { avisar('Tu navegador no permite compartir'); }
    return;
  }
  try {
    await navigator.share({ title: 'Convertidor de temperatura', text: texto });
  } catch (err) {
    if (err.name !== 'AbortError') avisar('No se pudo compartir');
  }
});

// 2c. Recibir contenido (share_target del manifest) o enlace propio ?v=&d=&a=
function procesarParametrosURL() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  let datos = null;
  const enlaces = [location.href, q.get('url'), q.get('text')?.match(/https?:\/\/\S+/)?.[0]];
  for (const enlace of enlaces) {
    try {
      const p = new URL(enlace, location.href).searchParams;
      if (p.get('v') !== null && p.get('v') !== '') { datos = { valor: p.get('v'), de: p.get('d'), a: p.get('a') }; break; }
    } catch { /* no era un enlace */ }
  }
  // Texto como "22 C = 71,6 F" o "100 Celsius a Kelvin"; si solo hay un número, se usa Celsius
  if (!datos) {
    const t = `${q.get('title') || ''} ${q.get('text') || ''}`;
    const m = t.match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*(celsius|fahrenheit|kelvin|[cfk])?(?:\s*(?:=|a|to|->)\s*[-\d.,]+\s*°?\s*(celsius|fahrenheit|kelvin|[cfk])?)?/i);
    if (m) datos = { valor: m[1], de: m[2]?.[0].toLowerCase(), a: m[3]?.[0].toLowerCase() };
  }
  const valor = datos && parseFloat(String(datos.valor).replace(',', '.'));
  if (datos && !Number.isNaN(valor)) {
    inputTemp.value = valor;
    if (['c', 'f', 'k'].includes(datos.de)) inputUnit.value = datos.de;
    if (['c', 'f', 'k'].includes(datos.a)) outputUnit.value = datos.a;
    convertir();
    avisar('Temperatura recibida');
  } else if (q.has('title') || q.has('text') || q.has('url')) {
    avisar('Lo compartido no incluye una temperatura');
  }
  history.replaceState(null, '', location.pathname);
}

// 3. Restablecer
function restablecer() {
  inputTemp.value = 22;
  inputUnit.value = 'c';
  outputUnit.value = 'f';
  convertir();
  inputTemp.focus();
}
$('btn-reset').addEventListener('click', restablecer);

// 4. Tema claro / oscuro (se recuerda)
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  try { localStorage.setItem('tc.tema', tema); } catch { /* sin almacenamiento */ }
}
try {
  const guardado = localStorage.getItem('tc.tema');
  if (guardado) document.documentElement.dataset.theme = guardado;
} catch { /* sin almacenamiento */ }
$('btn-theme').addEventListener('click', () => {
  const oscuro = document.documentElement.dataset.theme === 'dark';
  aplicarTema(oscuro ? 'light' : 'dark');
});

// 5. Pantalla completa
const btnFull = $('btn-full');
btnFull.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { avisar('No se pudo cambiar a pantalla completa'); }
});
document.addEventListener('fullscreenchange', () => {
  btnFull.setAttribute('aria-pressed', String(!!document.fullscreenElement));
});

// Mensaje breve en la barra de título
let avisoTimer;
function avisar(texto) {
  wcoStatus.textContent = texto;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    wcoStatus.textContent = '';
    if ('windowControlsOverlay' in navigator) actualizarEstadoWCO();
  }, 2500);
}

// Atajos Alt + letra
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const ids = { s: 'btn-swap', c: 'btn-copy', h: 'btn-share', r: 'btn-reset', t: 'btn-theme' };
  const id = ids[e.key.toLowerCase()];
  if (id) { e.preventDefault(); $(id).click(); }
});

// ---- Service worker ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error', err));
}
procesarParametrosURL();
