let db: Promise<IDBDatabase> | undefined;
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("myworkout", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("documents");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("documents", mode);
    const request = operation(tx.objectStore("documents"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Écriture annulée"));
  });
}
export async function read(key: string): Promise<string | null> {
  return (await transaction("readonly", (s) => s.get(key))) ?? null;
}
export async function write(key: string, value: string) {
  await transaction("readwrite", (s) => s.put(value, key));
}
export async function remove(key: string) {
  await transaction("readwrite", (s) => s.delete(key));
}
export const authStorage = {
  getItem: read,
  setItem: write,
  removeItem: remove,
};
