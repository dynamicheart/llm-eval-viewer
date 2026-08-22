/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Gunzip worker: inflates gzip payloads off the main thread.
 * Request {id, bytes} with the ArrayBuffer transferred in; responds
 * {id, ok, out} with the decompressed buffer transferred back.
 */

import { gunzipSync } from 'fflate';

self.onmessage = (e) => {
  const { id, bytes } = e.data;
  try {
    const out = gunzipSync(new Uint8Array(bytes));
    self.postMessage({ id, ok: true, out: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
