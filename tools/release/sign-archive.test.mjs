import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultSignaturePath, parseArgs } from './sign-archive.mjs';

test('defaultSignaturePath resolves the adjacent detached signature path', () => {
  assert.equal(
    defaultSignaturePath('/tmp/muesli-studio-v0.2.0-macos-arm.tar.gz'),
    '/tmp/muesli-studio-v0.2.0-macos-arm.tar.gz.asc',
  );
});

test('parseArgs accepts one or more archives and an explicit key id', () => {
  const parsed = parseArgs([
    '--key-id',
    'ABC123',
    'dist/release/muesli-studio-v0.2.0-source.tar.gz',
    'dist/release/muesli-studio-v0.2.0-source.zip',
  ]);

  assert.equal(parsed.keyId, 'ABC123');
  assert.deepEqual(parsed.archives, [
    '/Users/z3550628/Code/2026/muesli-studio/dist/release/muesli-studio-v0.2.0-source.tar.gz',
    '/Users/z3550628/Code/2026/muesli-studio/dist/release/muesli-studio-v0.2.0-source.zip',
  ]);
  assert.equal(parsed.output, null);
});

test('parseArgs rejects --output for multiple archives', () => {
  assert.throws(() =>
    parseArgs([
      '--output',
      'dist/release/muesli-studio-v0.2.0-source.tar.gz.asc',
      'dist/release/muesli-studio-v0.2.0-source.tar.gz',
      'dist/release/muesli-studio-v0.2.0-source.zip',
    ]));
});
