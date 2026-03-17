#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4317;
const DEFAULT_TIMEOUT_MS = 15_000;

export function parseArchiveMetadata(archivePath) {
  const baseName = path.basename(archivePath);
  const match = /^muesli-studio-(.+)-(linux-intel|macos-arm)\.tar\.gz$/u.exec(baseName);
  if (!match) {
    throw new Error(`expected binary archive name like muesli-studio-<version>-<target>.tar.gz, got ${baseName}`);
  }

  return {
    archivePath,
    baseName,
    version: match[1],
    target: match[2],
    bundleDirName: baseName.replace(/\.tar\.gz$/u, ''),
  };
}

export function hostReleaseTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') {
    return 'macos-arm';
  }

  if (platform === 'linux' && (arch === 'x64' || arch === 'amd64')) {
    return 'linux-intel';
  }

  return null;
}

export function missingReleaseMetadata(releaseText, metadata) {
  const requiredSnippets = [
    `target: ${metadata.target}`,
    `version: ${metadata.version}`,
    'compatibility: muesli-bt',
    'launch:',
    'verify:',
  ];

  return requiredSnippets.filter((snippet) => !releaseText.includes(snippet));
}

function parseArgs(argv) {
  let archivePath = null;
  let checksumPath = null;
  let port = DEFAULT_PORT;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--archive') {
      archivePath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--checksum') {
      checksumPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--port') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('expected --port to be a positive integer');
      }
      port = value;
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('expected --timeout-ms to be a positive integer');
      }
      timeoutMs = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`unknown argument: ${arg}`);
    }

    if (archivePath !== null) {
      throw new Error('only one archive path may be provided');
    }

    archivePath = arg;
  }

  if (!archivePath) {
    throw new Error('usage: verify-bundle.mjs --archive <path/to/muesli-studio-<version>-<target>.tar.gz>');
  }

  return {
    archivePath: path.resolve(archivePath),
    checksumPath: checksumPath ? path.resolve(checksumPath) : null,
    port,
    timeoutMs,
  };
}

async function assertExists(pathToCheck, label) {
  try {
    await stat(pathToCheck);
  } catch {
    throw new Error(`${label} not found: ${pathToCheck}`);
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function verifyChecksum(archivePath, checksumPath) {
  const expectedLine = (await readFile(checksumPath, 'utf8')).trim();
  const [expectedDigest, expectedFileName] = expectedLine.split(/\s+/u);
  if (!expectedDigest || !expectedFileName) {
    throw new Error(`invalid checksum file format: ${checksumPath}`);
  }

  if (expectedFileName !== path.basename(archivePath)) {
    throw new Error(`checksum file points to ${expectedFileName}, expected ${path.basename(archivePath)}`);
  }

  const actualDigest = await sha256(archivePath);
  if (actualDigest !== expectedDigest) {
    throw new Error(`checksum mismatch for ${path.basename(archivePath)}`);
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: options.stdio ?? 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function extractArchive(archivePath, bundleDirName) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'muesli-studio-release-'));
  await run('tar', ['-xzf', archivePath, '-C', tempRoot], { stdio: 'pipe' });

  const extractedRoot = path.join(tempRoot, bundleDirName);
  await assertExists(extractedRoot, 'extracted bundle root');
  return { tempRoot, extractedRoot };
}

async function verifyBundleStructure(bundleRoot, metadata) {
  const requiredPaths = [
    ['release notes', path.join(bundleRoot, 'RELEASE.md')],
    ['launcher', path.join(bundleRoot, 'start-studio.sh')],
    ['inspector binary', path.join(bundleRoot, 'bin', 'mbt_inspector')],
    ['studio index', path.join(bundleRoot, 'studio', 'dist', 'index.html')],
    ['schema copy', path.join(bundleRoot, 'schema', 'mbt.evt.v1.schema.json')],
    ['contract copy', path.join(bundleRoot, 'contracts', 'muesli-studio-integration.md')],
  ];

  for (const [label, filePath] of requiredPaths) {
    await assertExists(filePath, label);
  }

  const releaseText = await readFile(path.join(bundleRoot, 'RELEASE.md'), 'utf8');
  const missing = missingReleaseMetadata(releaseText, metadata);
  if (missing.length > 0) {
    throw new Error(`RELEASE.md is missing required metadata: ${missing.join(', ')}`);
  }
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // keep polling while the local server starts
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`timed out waiting for bundled studio at ${url}`);
}

async function terminateChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const done = () => resolve();
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 1_000);
  });
}

async function smokeLaunch(bundleRoot, metadata, port, timeoutMs) {
  const hostTarget = hostReleaseTarget();
  if (hostTarget !== metadata.target) {
    return {
      status: 'skipped',
      reason: `host target ${hostTarget ?? 'unsupported'} cannot execute ${metadata.target} bundle`,
    };
  }

  const launchArgs = ['app', '--host', DEFAULT_HOST, '--port', String(port), '--no-open'];
  const child = spawn(path.join(bundleRoot, 'start-studio.sh'), launchArgs, {
    cwd: bundleRoot,
    stdio: 'pipe',
    env: process.env,
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    const response = await waitForUrl(`http://${DEFAULT_HOST}:${port}/`, timeoutMs);
    const html = await response.text();
    if (!html.includes('<div id="root"></div>')) {
      throw new Error('bundled studio index did not contain the expected root element');
    }
  } catch (error) {
    await terminateChild(child);
    const reason = error instanceof Error ? error.message : String(error);
    const stderrSuffix = stderr.trim().length > 0 ? ` (${stderr.trim()})` : '';
    throw new Error(`${reason}${stderrSuffix}`);
  }

  await terminateChild(child);
  return { status: 'verified' };
}

export async function verifyBundleArchive(options) {
  const metadata = parseArchiveMetadata(options.archivePath);
  const checksumPath = options.checksumPath ?? `${options.archivePath}.sha256`;

  await assertExists(options.archivePath, 'archive');
  await assertExists(checksumPath, 'checksum file');
  await verifyChecksum(options.archivePath, checksumPath);

  const { tempRoot, extractedRoot } = await extractArchive(options.archivePath, metadata.bundleDirName);
  try {
    await verifyBundleStructure(extractedRoot, metadata);
    const smoke = await smokeLaunch(extractedRoot, metadata, options.port, options.timeoutMs);
    return { metadata, checksumPath, smoke };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await verifyBundleArchive(options);
  console.log(`verified checksum: ${path.basename(options.archivePath)}`);
  console.log(`verified bundle metadata: ${result.metadata.target} / ${result.metadata.version}`);
  if (result.smoke.status === 'verified') {
    console.log(`verified launch smoke: http://${DEFAULT_HOST}:${options.port}/`);
  } else {
    console.log(`launch smoke skipped: ${result.smoke.reason}`);
  }
}

const isMainModule = import.meta.url === new URL(process.argv[1], 'file:').href;

if (isMainModule) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`release verification failed: ${message}`);
    process.exitCode = 1;
  });
}
