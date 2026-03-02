#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createConnection } from 'node:net';

import Ajv2020 from 'ajv/dist/2020.js';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const inspectorPath = path.join(rootDir, 'apps', 'inspector', 'build', 'mbt_inspector');

function parseArgs(argv) {
  const options = {
    attach: 'mock',
    ticks: 4,
    tickHz: 125,
    seed: 7,
    startupDelayMs: 200,
    timeoutMs: 5000,
    inspector: inspectorPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    if (next === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--attach':
        options.attach = next;
        break;
      case '--ticks':
        options.ticks = Number.parseInt(next, 10);
        break;
      case '--tick-hz':
        options.tickHz = Number.parseInt(next, 10);
        break;
      case '--seed':
        options.seed = Number.parseInt(next, 10);
        break;
      case '--startup-delay-ms':
        options.startupDelayMs = Number.parseInt(next, 10);
        break;
      case '--timeout-ms':
        options.timeoutMs = Number.parseInt(next, 10);
        break;
      case '--inspector':
        options.inspector = next;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }

    index += 1;
  }

  return options;
}

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
  const options = parseArgs(process.argv.slice(2));
  await access(options.inspector);

  const port = await getFreePort();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mbt-inspector-test-'));
  const logPath = path.join(tempDir, 'run.jsonl');
  const schemaPath = path.join(rootDir, 'schema', 'mbt.evt.v1.schema.json');

  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateSchema = ajv.compile(schema);

  const args = [
    '--attach',
    options.attach,
    '--ws',
    `:${port}`,
    '--run-loop',
    JSON.stringify({ max_ticks: options.ticks }),
    '--tick-hz',
    String(options.tickHz),
    '--seed',
    String(options.seed),
    '--startup-delay-ms',
    String(options.startupDelayMs),
    '--log',
    logPath,
    '--quiet',
  ];

  const child = spawn(options.inspector, args, {
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
    const result = await waitForExit(child, options.timeoutMs);
    assert(result.code === 0, `Inspector exited with code ${result.code ?? 'null'} signal ${result.signal ?? 'null'}\n${stderr}`);

    socket.close();

    const rawLog = await readFile(logPath, 'utf8');
    const logLines = rawLog
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    assert(logLines.length > 0, 'Expected inspector log to contain events');
    assert(wsMessages.length === logLines.length, `WS/log event count mismatch: ws=${wsMessages.length}, log=${logLines.length}`);

    let previousSeq = 0;
    for (let index = 0; index < logLines.length; index += 1) {
      const logLine = logLines[index];
      const wsLine = wsMessages[index];
      assert(logLine === wsLine, `Event mismatch at index ${index}`);

      const parsed = JSON.parse(logLine);
      assert(validateSchema(parsed), `Schema validation failed at index ${index}: ${ajv.errorsText(validateSchema.errors)}`);
      assert(parsed.schema === 'mbt.evt.v1', `Invalid schema at index ${index}`);
      assert(parsed.seq === previousSeq + 1, `Expected seq=${previousSeq + 1}, got seq=${parsed.seq}`);
      previousSeq = parsed.seq;
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
