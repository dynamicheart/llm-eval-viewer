/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { decompressSync } from 'fflate';
import { decompress } from 'fzstd';

const COMPRESSED_EXTENSIONS = new Set(['.gz', '.zst']);

/**
 * Check if a filename has a supported compressed extension.
 */
export function isCompressedFile(name) {
  const lower = name.toLowerCase();
  for (const ext of COMPRESSED_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

/**
 * Decompress an ArrayBuffer to a UTF-8 string.
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @param {'.gz'|'.zst'} ext - Compressed extension
 * @returns {string} Decompressed text
 */
export function decompressBuffer(buffer, ext) {
  const bytes = new Uint8Array(buffer);
  if (ext === '.gz') {
    return new TextDecoder().decode(decompressSync(bytes));
  }
  if (ext === '.zst') {
    return new TextDecoder().decode(decompress(bytes));
  }
  throw new Error(`Unsupported compression format: ${ext}`);
}

/**
 * Read a File object as text, transparently decompressing if compressed.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readTextWithDecompression(file) {
  const ext = isCompressedFile(file.name);
  if (!ext) return file.text();
  const buffer = await file.arrayBuffer();
  return decompressBuffer(buffer, ext);
}
