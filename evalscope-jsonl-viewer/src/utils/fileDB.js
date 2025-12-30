/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

// src/utils/fileDB.js

const DB_NAME = 'evalscope_files';
const DB_VERSION = 8;
const STORE_NAME = 'files';

let db = null;

export function openDB() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      let store;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else {
        store = req.transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('name')) {
        store.createIndex('name', 'name', { unique: false });
      }

      if (!store.indexNames.contains('lastOpen')) {
        store.createIndex('lastOpen', 'lastOpen', { unique: false });
      }

      if (!store.indexNames.contains('namespace_lastOpen')) {
        store.createIndex('namespace_lastOpen', ['namespace', 'lastOpen'], {
          unique: false,
        });
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveFile(namespace, entry) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      ...entry,
      namespace,
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listFiles(namespace, limit = 5) {
  const db = await openDB();

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('namespace_lastOpen');
    const range = IDBKeyRange.bound([namespace, 0], [namespace, Infinity]);

    const result = [];
    index.openCursor(range, 'prev').onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && result.length < limit) {
        const { content, ...meta } = cursor.value;
        result.push(meta);
        cursor.continue();
      } else {
        resolve(result);
      }
    };
  });
}

export async function clearFiles(namespace) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('namespace_lastOpen');

    const range = IDBKeyRange.bound([namespace, 0], [namespace, Infinity]);

    index.openCursor(range).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFile(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
