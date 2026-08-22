/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * tarFile — minimal tar reader for eval export archives.
 *
 * Some eval platforms archive each task export as task_<id>.tar.gz, with the
 * dataset file (e.g. x5_mrcr_V0__2268__task_132054.jsonl.gz) plus a README
 * inside. These helpers unpack such archives in the browser: decompress the
 * outer layer, walk the 512-byte tar headers, then decompress the inner
 * .jsonl/.jsonl.gz members.
 */

import { gunzipSync } from 'fflate';
import { decompress } from 'fzstd';
import { gunzipInWorker } from './gunzipWorker';

const TAR_BLOCK = 512;

function isJsonlMember(name) {
  if (!/\.(jsonl|ndjson)(\.gz|\.zst)?$/i.test(name)) return false;
  return !isNoiseMember(name);
}

/**
 * Check if a filename is a supported tar archive.
 */
export function isTarFile(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz') ||
    lower.endsWith('.tar.zst') ||
    lower.endsWith('.tar')
  );
}

function decodeString(bytes) {
  return new TextDecoder().decode(bytes).replace(/\0.*$/, '');
}

function parseTarSize(header) {
  // Size field: 12 bytes at offset 124, octal ASCII digits, NUL/space padded
  const s = decodeString(header.subarray(124, 136)).trim();
  return parseInt(s, 8) || 0;
}

/**
 * Walk tar member headers, invoking cb(name, data) for each regular file.
 * Skips directories, pax/global headers and links; supports GNU 'L' long names.
 */
function walkTar(tar, cb) {
  let off = 0;
  let pendingLongName = null;
  while (off + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(off, off + TAR_BLOCK);
    if (header.every((b) => b === 0)) break;
    const name = pendingLongName || decodeString(header.subarray(0, 100));
    pendingLongName = null;
    const size = parseTarSize(header);
    const dataStart = off + TAR_BLOCK;
    const data = tar.subarray(dataStart, dataStart + size);
    // Typeflag at offset 156; a NUL means old-style tar = regular file
    const typeChar = String.fromCharCode(header[156] || 0x30);
    if (typeChar === 'L') {
      pendingLongName = decodeString(data);
    } else if (typeChar === '0' || typeChar === '7') {
      // Regular file ('7' contiguous, treated as file)
      cb(name, data);
    }
    off = dataStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
}

function decompressMember(data, name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.gz')) return gunzipSync(data);
  if (lower.endsWith('.zst')) return decompress(data);
  return data;
}

function isNoiseMember(name) {
  // macOS AppleDouble metadata (._foo) and Finder files; also skip dotfiles
  const base = name.split('/').pop();
  return base.startsWith('._') || base === '.DS_Store' || base.startsWith('.');
}

/**
 * Extract eval data text from a tar archive buffer (.tar.gz/.tgz/.tar.zst/.tar).
 * Returns [{ name, text }] for each .jsonl/.ndjson member (compressed or not).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} fileName Archive filename, used to pick the outer decompressor
 * @returns {{ name: string, text: string }[]}
 */
export function readJsonlFromTar(buffer, fileName) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const lower = (fileName || '').toLowerCase();
  let tar;
  if (lower.endsWith('.tar.zst')) tar = decompress(bytes);
  else if (lower.endsWith('.tar')) tar = bytes;
  else tar = gunzipSync(bytes);

  const out = [];
  walkTar(tar, (name, data) => {
    if (!isJsonlMember(name)) return;
    try {
      out.push({
        name,
        text: new TextDecoder().decode(decompressMember(data, name)),
      });
    } catch (e) {
      // Skip corrupt members instead of failing the whole archive
      console.warn('Skipping unreadable tar member:', name, e.message || e);
    }
  });
  return out;
}

/**
 * Async variant of readJsonlFromTar: gzip layers are inflated in a Web Worker
 * and the UI thread only pays for tar walking and text decoding.
 */
export async function readJsonlFromTarAsync(buffer, fileName) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const lower = (fileName || '').toLowerCase();
  let tar;
  if (lower.endsWith('.tar.zst')) tar = decompress(bytes);
  else if (lower.endsWith('.tar')) tar = bytes;
  else tar = await gunzipInWorker(bytes);

  const matched = [];
  walkTar(tar, (name, data) => {
    if (!isJsonlMember(name)) return;
    // Copy member data so transferring it to the worker doesn't detach the tar
    matched.push({ name, data: data.slice() });
  });

  const out = [];
  for (const { name, data } of matched) {
    try {
      const lowerName = name.toLowerCase();
      let textBytes = data;
      if (lowerName.endsWith('.gz')) textBytes = await gunzipInWorker(data);
      out.push({ name, text: new TextDecoder().decode(textBytes) });
    } catch (e) {
      console.warn('Skipping unreadable tar member:', name, e.message || e);
    }
  }
  return out;
}
