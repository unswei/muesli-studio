import test from 'node:test';
import assert from 'node:assert/strict';

import { hostReleaseTarget, missingReleaseMetadata, parseArchiveMetadata, signaturePathForArchive } from './verify-bundle.mjs';

test('parseArchiveMetadata extracts version and target from a binary archive name', () => {
  const metadata = parseArchiveMetadata('/tmp/muesli-studio-v0.3.0-macos-arm.tar.gz');

  assert.equal(metadata.version, 'v0.3.0');
  assert.equal(metadata.target, 'macos-arm');
  assert.equal(metadata.bundleDirName, 'muesli-studio-v0.3.0-macos-arm');
});

test('parseArchiveMetadata rejects unsupported archive names', () => {
  assert.throws(() => parseArchiveMetadata('/tmp/muesli-studio-v0.3.0-source.tar.gz'));
});

test('signaturePathForArchive resolves the adjacent detached signature path', () => {
  assert.equal(
    signaturePathForArchive('/tmp/muesli-studio-v0.3.0-macos-arm.tar.gz'),
    '/tmp/muesli-studio-v0.3.0-macos-arm.tar.gz.asc',
  );
});

test('hostReleaseTarget maps supported local platform and architecture pairs', () => {
  assert.equal(hostReleaseTarget('darwin', 'arm64'), 'macos-arm');
  assert.equal(hostReleaseTarget('linux', 'x64'), 'linux-intel');
  assert.equal(hostReleaseTarget('darwin', 'x64'), null);
});

test('missingReleaseMetadata reports absent required release note fields', () => {
  const missing = missingReleaseMetadata(
    '# release bundle\n\ntarget: macos-arm\nversion: v0.3.0\n',
    { target: 'macos-arm', version: 'v0.3.0' },
  );

  assert.deepEqual(missing, ['compatibility: muesli-bt', 'launch:', 'verify:']);
});
