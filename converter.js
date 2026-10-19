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
// ---- Exportar: texto, CSV, Excel (.xlsx) y PDF, sin librerías externas ----
const NOMBRES_LARGOS = { c: 'Celsius', f: 'Fahrenheit', k: 'Kelvin' };

function datosExportacion() {
  return {
    valor: parseFloat(inputTemp.value),
    de: NOMBRES_LARGOS[inputUnit.value],
    resultado: Math.round(ultimoResultado * 100) / 100,
    a: NOMBRES_LARGOS[outputUnit.value],
    fecha: new Date().toISOString().slice(0, 10)
  };
}
const ENCABEZADOS = ['Valor', 'Desde', 'Resultado', 'Hacia', 'Fecha'];
const filaDatos = (d) => [d.valor, d.de, d.resultado, d.a, d.fecha];

function generarCSV(d) {
  const esc = (v) => /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const texto = [ENCABEZADOS, filaDatos(d)].map(f => f.map(esc).join(',')).join('\r\n') + '\r\n';
  return new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
}

// ZIP sin compresión (método "store"), suficiente para un .xlsx
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function crearZip(archivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let offset = 0;
  for (const [nombre, contenido] of archivos) {
    const n = enc.encode(nombre), datos = enc.encode(contenido), crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true);
    local.setUint16(26, n.length, true);
    partes.push(local.buffer, n, datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
    cen.setUint16(28, n.length, true); cen.setUint32(42, offset, true);
    central.push(cen.buffer, n);
    offset += 30 + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return [...partes, ...central, fin.buffer];
}

function generarXLSX(d) {
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const celda = (v, ref) => typeof v === 'number'
    ? `<c r="${ref}"><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  const fila = (valores, n) => `<row r="${n}">${valores.map((v, i) => celda(v, 'ABCDE'[i] + n)).join('')}</row>`;
  const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'http://schemas.openxmlformats.org/';
  const partes = crearZip([
    ['[Content_Types].xml', `${cabecera}<Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${cabecera}<Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${cabecera}<workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets><sheet name="Conversión" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${cabecera}<Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `${cabecera}<worksheet xmlns="${ns}spreadsheetml/2006/main"><cols><col min="1" max="5" width="14" customWidth="1"/></cols><sheetData>${fila(ENCABEZADOS, 1)}${fila(filaDatos(d), 2)}</sheetData></worksheet>`]
  ]);
  return new Blob(partes, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function generarPDF(d) {
  const esc = (s) => String(s).replace(/[\\()]/g, '\\$&');
  const lineas = [
    [20, 'Convertidor de temperatura', 760],
    [14, `${d.valor} ${d.de}  =  ${d.resultado} ${d.a}`, 720],
    [11, `Valor: ${d.valor}   Desde: ${d.de}`, 690],
    [11, `Resultado: ${d.resultado}   Hacia: ${d.a}`, 672],
    [11, `Fecha: ${d.fecha}`, 654]
  ];
  const contenido = lineas.map(([t, s, y]) => `BT /F1 ${t} Tf 56 ${y} Td (${esc(s)}) Tj ET`).join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objetos.map((o, i) => { const pos = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // Todo el contenido cabe en Latin-1 (WinAnsi), así que 1 carácter = 1 byte
  return new Blob([Uint8Array.from(pdf, c => c.charCodeAt(0) & 0xFF)], { type: 'application/pdf' });
}

const FORMATOS = {
  csv: { nombre: 'conversion.csv', generar: generarCSV },
  xlsx: { nombre: 'conversion.xlsx', generar: generarXLSX },
  pdf: { nombre: 'conversion.pdf', generar: generarPDF }
};

async function compartirTexto() {
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
}

async function compartirArchivo(formato) {
  const { nombre, generar } = FORMATOS[formato];
  const blob = generar(datosExportacion());
  const archivo = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ title: 'Convertidor de temperatura', files: [archivo] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  // Sin soporte para compartir archivos: se descarga
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisar('Descargado: ' + nombre);
}

const menuCompartir = $('share-menu');
const cerrarMenu = () => { menuCompartir.hidden = true; $('btn-share').setAttribute('aria-expanded', 'false'); };
$('btn-share').addEventListener('click', (e) => {
  e.stopPropagation();
  if (Number.isNaN(ultimoResultado)) { avisar('Escribe una temperatura para compartir'); return; }
  const abrir = menuCompartir.hidden;
  menuCompartir.hidden = !abrir;
  $('btn-share').setAttribute('aria-expanded', String(abrir));
  if (abrir) menuCompartir.querySelector('button').focus();
});
menuCompartir.addEventListener('click', (e) => {
  const formato = e.target.closest('button')?.dataset.formato;
  if (!formato) return;
  cerrarMenu();
  if (formato === 'texto') compartirTexto(); else compartirArchivo(formato);
});
document.addEventListener('click', (e) => { if (!menuCompartir.contains(e.target)) cerrarMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });

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
