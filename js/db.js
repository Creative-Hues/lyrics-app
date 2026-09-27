// IndexedDB(ブラウザの中の保存場所)を、Promiseで使えるようにする薄い層。
// lyrics: 歌詞1曲ずつ(id がキー)
// kv:     設定や端末ごとの状態など、名前をつけて置く値

const DB_NAME = 'sakushi-app';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lyrics')) {
        db.createObjectStore('lyrics', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function getAll(storeName) {
  return run(storeName, 'readonly', (s) => s.getAll());
}

export function get(storeName, key) {
  return run(storeName, 'readonly', (s) => s.get(key));
}

// kv のように「キーを外から渡す」保存場所では key を指定する
export function put(storeName, value, key) {
  return run(storeName, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
}

export function remove(storeName, key) {
  return run(storeName, 'readwrite', (s) => s.delete(key));
}
