#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function defaultSignaturePath(archivePath) {
  return `${archivePath}.asc`;
}

export function parseArgs(argv) {
  const archives = [];
  let keyId = process.env.RELEASE_SIGNING_KEY_ID ?? null;
  let output = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--key-id') {
      keyId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--output') {
      output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`unknown argument: ${arg}`);
    }

    archives.push(path.resolve(arg));
  }

  if (archives.length === 0) {
    throw new Error('usage: sign-archive.mjs [--key-id <gpg-key-id>] [--output <file.asc>] <archive> [archive...]');
  }

  if (output && archives.length !== 1) {
    throw new Error('--output may only be used when signing a single archive');
  }

  return { archives, keyId, output: output ? path.resolve(output) : null };
}

async function assertExists(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

async function runGpg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('gpg', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`gpg ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function signArchive(archivePath, keyId, outputPath) {
  await assertExists(archivePath, 'archive');

  const args = ['--batch', '--yes', '--armor', '--detach-sign', '--output', outputPath];
  const passphrase = process.env.RELEASE_GPG_PASSPHRASE;
  if (passphrase && passphrase.length > 0) {
    args.push('--pinentry-mode', 'loopback', '--passphrase', passphrase);
  }
  if (keyId && keyId.trim().length > 0) {
    args.push('--local-user', keyId.trim());
  }
  args.push(archivePath);
  await runGpg(args);
}

async function main() {
  const { archives, keyId, output } = parseArgs(process.argv.slice(2));

  for (const archivePath of archives) {
    const signaturePath = output ?? defaultSignaturePath(archivePath);
    await signArchive(archivePath, keyId, signaturePath);
  }
}

const invokedAsScript =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`archive signing failed: ${message}`);
    process.exitCode = 1;
  });
}
