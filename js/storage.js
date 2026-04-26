// storage.js — IndexedDB wrapper for saved scenes + thumbnails
const DB_NAME = 'wsf_scenes';
const DB_VERSION = 1;
const STORE = 'scenes';

class Storage {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('updated', 'updated');
          os.createIndex('name', 'name');
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  }

  async save(record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      const req = os.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const os = tx.objectStore(STORE);
      const req = os.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        records.sort((a, b) => (b.updated || 0) - (a.updated || 0));
        resolve(records);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async clear() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async count() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export const storage = new Storage();

// Build a record: { id, name, created, updated, thumbnail (data URL), data (full scene JSON) }
export function buildRecord(name, sceneData, thumbnail, existingId = null) {
  const now = Date.now();
  return {
    id: existingId || `wsf_${now}_${Math.random().toString(36).slice(2, 9)}`,
    name: name || `untitled · ${new Date(now).toLocaleString()}`,
    created: existingId ? undefined : now,
    updated: now,
    thumbnail: thumbnail || null,
    data: sceneData,
  };
}

// Capture a thumbnail from a canvas. Returns a data URL.
export function captureThumbnail(canvas, maxSize = 320) {
  const w = canvas.width, h = canvas.height;
  const ratio = Math.min(maxSize / w, maxSize / h);
  const tw = Math.round(w * ratio);
  const th = Math.round(h * ratio);
  const off = document.createElement('canvas');
  off.width = tw; off.height = th;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0, tw, th);
  return off.toDataURL('image/jpeg', 0.7);
}

// LocalStorage helpers for "last opened" / pending scene to load
export const session = {
  setPendingLoad(id) { localStorage.setItem('wsf_pending_load', id); },
  getPendingLoad() { return localStorage.getItem('wsf_pending_load'); },
  clearPendingLoad() { localStorage.removeItem('wsf_pending_load'); },
  setLastSaved(id) { localStorage.setItem('wsf_last_saved', id); },
  getLastSaved() { return localStorage.getItem('wsf_last_saved'); },
};
