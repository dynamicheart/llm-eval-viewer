/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

// src/utils/fileDB.js

const DB_NAME = 'evalscope_files';
const DB_VERSION = 10;
const META_STORE = 'files';        // metadata (without content)
const CONTENT_STORE = 'contents';  // large file content stored separately
const PARSED_STORE = 'parsed';     // cached parsed row data

let db = null;

export function openDB() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      let store;

      if (!db.objectStoreNames.contains(META_STORE)) {
        store = db.createObjectStore(META_STORE, { keyPath: 'id' });
      } else {
        store = req.transaction.objectStore(META_STORE);
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

      // Content store
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        db.createObjectStore(CONTENT_STORE, { keyPath: 'id' });
      }

      // Parsed row cache store
      if (!db.objectStoreNames.contains(PARSED_STORE)) {
        db.createObjectStore(PARSED_STORE, { keyPath: 'id' });
      }

      // Migration: if old records in META_STORE contain a content field, migrate it to CONTENT_STORE
      // This is done via cursor within the upgrade transaction
      const metaStore = req.transaction.objectStore(META_STORE);
      const contentStore = req.transaction.objectStore(CONTENT_STORE);
      metaStore.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const record = cursor.value;
          if (record.content !== undefined) {
            // Move content to CONTENT_STORE
            contentStore.put({ id: record.id, content: record.content });
            // Remove content from meta record
            const { content, ...meta } = record;
            cursor.update(meta);
          }
          cursor.continue();
        }
      };
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
  const { content, ...meta } = entry;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, CONTENT_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const contentStore = tx.objectStore(CONTENT_STORE);

    metaStore.put({ ...meta, namespace });
    if (content !== undefined) {
      contentStore.put({ id: meta.id, content });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, CONTENT_STORE], 'readonly');
    const metaStore = tx.objectStore(META_STORE);
    const contentStore = tx.objectStore(CONTENT_STORE);

    const metaReq = metaStore.get(id);
    const contentReq = contentStore.get(id);

    tx.oncomplete = () => {
      if (!metaReq.result) {
        resolve(undefined);
        return;
      }
      const meta = metaReq.result;
      const contentRecord = contentReq.result;
      resolve({
        ...meta,
        content: contentRecord ? contentRecord.content : undefined,
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function listFiles(namespace, limit = 5) {
  const db = await openDB();

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const index = store.index('namespace_lastOpen');
    const range = IDBKeyRange.bound([namespace, 0], [namespace, Infinity]);

    const result = [];
    index.openCursor(range, 'prev').onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && result.length < limit) {
        result.push(cursor.value); // metadata has no content field, return directly
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
    const tx = db.transaction([META_STORE, CONTENT_STORE, PARSED_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const contentStore = tx.objectStore(CONTENT_STORE);
    const parsedStore = tx.objectStore(PARSED_STORE);
    const index = metaStore.index('namespace_lastOpen');

    const range = IDBKeyRange.bound([namespace, 0], [namespace, Infinity]);

    index.openCursor(range).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        contentStore.delete(cursor.primaryKey);
        parsedStore.delete(cursor.primaryKey);
        metaStore.delete(cursor.primaryKey);
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
    const tx = db.transaction([META_STORE, CONTENT_STORE, PARSED_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(CONTENT_STORE).delete(id);
    tx.objectStore(PARSED_STORE).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save pre-parsed row data to cache.
 * @param {string} id - File ID (same as META_STORE key)
 * @param {string} version - Parser version string for cache invalidation
 * @param {*} data - Parsed result (rows + extra fields from parser)
 */
export async function saveParsedData(id, version, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARSED_STORE, 'readwrite');
    tx.objectStore(PARSED_STORE).put({ id, version, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get cached parsed data for a file.
 * @param {string} id - File ID
 * @param {string} version - Expected parser version. Returns null if version mismatch.
 * @returns {Promise<*|null>} Parsed data or null if not cached / version mismatch
 */
export async function getParsedData(id, version) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARSED_STORE, 'readonly');
    const req = tx.objectStore(PARSED_STORE).get(id);
    tx.oncomplete = () => {
      const record = req.result;
      if (record && record.version === version) {
        resolve(record.data);
      } else {
        resolve(null);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}
