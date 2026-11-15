const DATABASE_NAME = 'galenosv-offline';
const DATABASE_VERSION = 1;
const STORE_NAME = 'outbox';

const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola offline.'));
});

export async function enqueueOfflineRequest({ url, method, headers, body }) {
  const database = await openDatabase();
  const item = {
    id: crypto.randomUUID(),
    url: String(url),
    method,
    headers,
    body,
    createdAt: new Date().toISOString(),
  };

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(item);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar la operación pendiente.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló el almacenamiento offline.'));
  });
  database.close();
  return item;
}

export async function readOfflineQueue() {
  const database = await openDatabase();
  const items = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la cola offline.'));
  });
  database.close();
  return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removeQueuedRequest(id) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo actualizar la cola offline.'));
  });
  database.close();
}

export async function countQueuedRequests() {
  const database = await openDatabase();
  const count = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo consultar la cola offline.'));
  });
  database.close();
  return count;
}

export async function flushOfflineQueue(fetcher = fetch) {
  const queue = await readOfflineQueue();
  let sent = 0;
  const failures = [];

  for (const item of queue) {
    try {
      const response = await fetcher(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (!response.ok) {
        failures.push({ id: item.id, status: response.status });
        continue;
      }
      await removeQueuedRequest(item.id);
      sent += 1;
    } catch (error) {
      failures.push({ id: item.id, error: error.message });
      break;
    }
  }

  return { sent, pending: await countQueuedRequests(), failures };
}
