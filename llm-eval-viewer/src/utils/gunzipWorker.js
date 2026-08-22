/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Promise-based client for the gunzip worker.
 *
 * fflate's own async API builds worker code from stringified internals and
 * breaks under minified ESM builds, so we run fflate's sync gunzipSync in a
 * dedicated worker instead. A single persistent worker serves all requests;
 * buffers are transferred (not cloned) in both directions.
 *
 * Input note: the passed buffer is transferred and detached. Callers must
 * own the buffer (not a view into memory that is still needed).
 */

import { gunzipSync } from 'fflate';
import GunzipWorker from '@/workers/gunzip.worker.js?worker';

let worker = null;
const pending = new Map();
let nextId = 1;

function getWorker() {
  if (worker) return worker;
  worker = new GunzipWorker();
  worker.onmessage = (e) => {
    const { id, ok, out, error } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(new Uint8Array(out));
    else entry.reject(new Error(error));
  };
  worker.onerror = (err) => {
    // Worker died: reject everything queued and recreate on next use
    for (const entry of pending.values()) {
      entry.reject(new Error('gunzip worker error: ' + (err.message || 'unknown')));
    }
    pending.clear();
    worker = null;
  };
  return worker;
}

/**
 * Gunzip bytes in the worker. Detaches the input buffer.
 * @param {Uint8Array} bytes - owned buffer (will be transferred)
 * @returns {Promise<Uint8Array>} decompressed bytes
 */
export function gunzipInWorker(bytes) {
  if (typeof Worker === 'undefined') {
    // No worker support (tests, non-browser): decompress inline
    return Promise.resolve(gunzipSync(bytes));
  }
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, bytes: bytes.buffer }, [bytes.buffer]);
  });
}
