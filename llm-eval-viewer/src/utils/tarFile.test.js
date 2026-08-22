/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { gzipSync } from 'fflate';
import { isTarFile, readJsonlFromTar } from './tarFile';

const enc = new TextEncoder();

function tarHeader(name, size) {
  const h = new Uint8Array(512);
  h.set(enc.encode(name), 0);
  h.set(enc.encode(size.toString(8).padStart(11, '0') + '\0'), 124);
  h[156] = 0x30; // typeflag '0' = regular file (ustar offset)
  h.set(enc.encode('ustar\0' + '00'), 257); // magic + version
  return h;
}

function buildTar(members) {
  const parts = [];
  for (const { name, data } of members) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(tarHeader(name, bytes.length), bytes, new Uint8Array((512 - (bytes.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024)); // end-of-archive blocks
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe('isTarFile', () => {
  it('detects supported archive extensions', () => {
    expect(isTarFile('task_132054.tar.gz')).toBe(true);
    expect(isTarFile('task_1.TGZ')).toBe(true);
    expect(isTarFile('export.tar.zst')).toBe(true);
    expect(isTarFile('raw.tar')).toBe(true);
    expect(isTarFile('data.jsonl.gz')).toBe(false);
    expect(isTarFile('trace.jsonl.zst')).toBe(false);
  });
});

describe('readJsonlFromTar', () => {
  it('extracts inner .jsonl.gz members and decompresses them', () => {
    const jsonl = JSON.stringify({ taskId: 't1', questionId: '42', payload: {} }) + '\n';
    const tar = buildTar([
      { name: 'README.md', data: 'archive readme' },
      { name: 'x5_mrcr_V0__2268__task_132054.jsonl.gz', data: gzipSync(enc.encode(jsonl)) },
    ]);
    const members = readJsonlFromTar(gzipSync(tar), 'task_132054.tar.gz');
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe('x5_mrcr_V0__2268__task_132054.jsonl.gz');
    expect(members[0].text).toBe(jsonl);
  });

  it('extracts plain .jsonl members', () => {
    const jsonl = '{"a":1}\n{"a":2}\n';
    const tar = buildTar([{ name: 'ds__10__task_9.jsonl', data: jsonl }]);
    const members = readJsonlFromTar(gzipSync(tar), 'task_9.tgz');
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe('ds__10__task_9.jsonl');
    expect(members[0].text).toBe(jsonl);
  });

  it('reads uncompressed .tar buffers', () => {
    const jsonl = '{"a":1}\n';
    const tar = buildTar([{ name: 'ds.jsonl', data: jsonl }]);
    const members = readJsonlFromTar(tar, 'export.tar');
    expect(members).toHaveLength(1);
    expect(members[0].text).toBe(jsonl);
  });

  it('skips non-jsonl members and returns [] when none match', () => {
    const tar = buildTar([{ name: 'README.md', data: 'readme' }]);
    expect(readJsonlFromTar(gzipSync(tar), 'x.tar.gz')).toEqual([]);
  });

  it('handles empty members and multi-line jsonl content', () => {
    const jsonl = Array.from({ length: 5 }, (_, i) => JSON.stringify({ i })).join('\n') + '\n';
    const tar = buildTar([{ name: 'ds__5__task_1.jsonl.gz', data: gzipSync(enc.encode(jsonl)) }]);
    const members = readJsonlFromTar(gzipSync(tar), 'task_1.tar.gz');
    expect(members[0].text.split('\n').filter(Boolean)).toHaveLength(5);
  });

  it('parses archives produced by the system tar command', () => {
    // Built with `tar czf` (bsdtar): ustar headers, path-prefixed member
    // names, directory entries, NUL-terminated numeric fields
    const fixture = new URL('./__fixtures__/sample_task.tar.gz', import.meta.url);
    const members = readJsonlFromTar(readFileSync(fixture), 'sample_task.tar.gz');
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe('task_99/real_ds__2__task_99.jsonl.gz');
    const lines = members[0].text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ taskId: 't1', questionId: '1', payload: { score: 1 } });
  });
});
