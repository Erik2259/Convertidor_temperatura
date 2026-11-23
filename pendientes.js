// Cola de conversiones hechas sin conexión (IndexedDB). La usan la página y el service worker.
const PEND_DB = 'tc-db';
const PEND_STORE = 'pendientes';

function pendAbrir() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(PEND_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(PEND_STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function pendOperar(modo, operacion) {
  const db = await pendAbrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PEND_STORE, modo);
    const peticion = operacion(tx.objectStore(PEND_STORE));
    tx.oncomplete = () => { db.close(); resolve(peticion?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const pendAgregar = (item) => pendOperar('readwrite', s => s.add(item));
const pendContar = () => pendOperar('readonly', s => s.count());
const pendVaciar = () => pendOperar('readwrite', s => s.clear());
