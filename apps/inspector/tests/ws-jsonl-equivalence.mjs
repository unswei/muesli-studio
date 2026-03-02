#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createConnection } from 'node:net';

import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const inspectorPath = path.join(rootDir, 'apps', 'inspector', 'build', 'mbt_inspector');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to get free port')));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Inspector process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function waitForOpen(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket did not open within ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForPortReady(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const tryConnect = () => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Inspector did not open TCP port ${port} within ${timeoutMs}ms`));
          return;
        }

        setTimeout(tryConnect, 50);
      });
    };

    tryConnect();
  });
}

async function run() {
  await access(inspectorPath);

  const port = await getFreePort();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mbt-inspector-test-'));
  const logPath = path.join(tempDir, 'run.jsonl');

  const args = [
    '--ws',
    `:${port}`,
    '--demo-ticks',
    '4',
    '--tick-ms',
    '8',
    '--startup-delay-ms',
    '200',
    '--log',
    logPath,
    '--quiet',
  ];

  const child = spawn(inspectorPath, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const wsMessages = [];
  await waitForPortReady(port, 3000);

  const socket = new WebSocket(`ws://127.0.0.1:${port}/events`);
  socket.on('message', (data) => {
    wsMessages.push(String(data));
  });

  try {
    await waitForOpen(socket, 3000);
    const result = await waitForExit(child, 5000);
    assert(result.code === 0, `Inspector exited with code ${result.code ?? 'null'} signal ${result.signal ?? 'null'}\n${stderr}`);

    socket.close();

    const rawLog = await readFile(logPath, 'utf8');
    const logLines = rawLog
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    assert(logLines.length > 0, 'Expected inspector log to contain events');
    assert(wsMessages.length === logLines.length, `WS/log event count mismatch: ws=${wsMessages.length}, log=${logLines.length}`);

    for (let index = 0; index < logLines.length; index += 1) {
      const logLine = logLines[index];
      const wsLine = wsMessages[index];
      assert(logLine === wsLine, `Event mismatch at index ${index}`);

      const parsed = JSON.parse(logLine);
      assert(parsed.schema === 'mbt.evt.v1', `Invalid schema at index ${index}`);
      assert(parsed.seq === index, `Expected seq=${index}, got seq=${parsed.seq}`);
    }

    const hasRunStart = logLines.some((line) => line.includes('"type":"run_start"'));
    const hasBtDef = logLines.some((line) => line.includes('"type":"bt_def"'));
    assert(hasRunStart, 'Expected run_start event in output');
    assert(hasBtDef, 'Expected bt_def event in output');

    console.log(`Inspector WS/JSONL equivalence passed on port ${port} with ${logLines.length} events.`);
  } finally {
    socket.close();
    if (!child.killed) {
      child.kill('SIGTERM');
    }

    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
