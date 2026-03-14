import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const studioDir = path.join(repoRoot, 'apps', 'studio');

const studioHost = '127.0.0.1';
const studioPort = 4173;
const baseUrl = `http://${studioHost}:${studioPort}`;
const demoFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'studio_demo');
const stagedDemoDir = path.join(repoRoot, 'apps', 'studio', 'public', 'demo', 'studio_demo');
const imageDir = path.join(repoRoot, 'docs', 'images');

interface ScreenshotSpec {
  fileName: string;
  selector: string;
  viewport: `${number},${number}`;
  url: string;
  fullPage?: boolean;
  waitMs?: number;
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function spawnCommand(
  command: string,
  args: string[],
  options: { stdio?: 'pipe' | 'inherit'; cwd?: string } = {},
): ChildProcess {
  return spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: process.env,
  });
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnCommand(command, args, { stdio: 'inherit' });
    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling while Vite is booting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`timed out waiting for studio server at ${url}`);
}

async function stageDemoFixture(): Promise<void> {
  await rm(stagedDemoDir, { recursive: true, force: true });
  await mkdir(path.dirname(stagedDemoDir), { recursive: true });
  await cp(demoFixtureDir, stagedDemoDir, { recursive: true });
}

async function cleanupDemoFixture(): Promise<void> {
  await rm(stagedDemoDir, { recursive: true, force: true });
}

async function stopDevServer(devServer: ChildProcess): Promise<void> {
  if (devServer.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    devServer.once('exit', done);
    devServer.kill('SIGTERM');
    setTimeout(() => {
      if (devServer.exitCode === null) {
        devServer.kill('SIGKILL');
      }
    }, 1_000);
  });
}

async function captureScreenshots(): Promise<void> {
  await mkdir(imageDir, { recursive: true });

  const specs: ScreenshotSpec[] = [
    {
      fileName: 'studio-tree-scrubber.png',
      selector: '#readme-hero',
      viewport: '1520,1080',
      fullPage: true,
      waitMs: 1500,
      url: `${baseUrl}/?demo_fixture=/demo/studio_demo/events.jsonl&demo_tick=3&demo_node=4&demo_capture=hero`,
    },
    {
      fileName: 'studio-run-summary.png',
      selector: '#run-summary-panel',
      viewport: '1180,1280',
      fullPage: true,
      waitMs: 1200,
      url: `${baseUrl}/?demo_fixture=/demo/studio_demo/events.jsonl&demo_capture=summary`,
    },
    {
      fileName: 'studio-node-inspector.png',
      selector: '#node-inspector-panel',
      viewport: '1100,420',
      waitMs: 1200,
      url: `${baseUrl}/?demo_fixture=/demo/studio_demo/events.jsonl&demo_tick=4&demo_node=5&demo_capture=node`,
    },
    {
      fileName: 'studio-blackboard-diff.png',
      selector: '#blackboard-diff',
      viewport: '1240,340',
      waitMs: 1200,
      url: `${baseUrl}/?demo_fixture=/demo/studio_demo/events.jsonl&demo_tick=4&demo_capture=diff`,
    },
    {
      fileName: 'studio-dsl-editor.png',
      selector: '#dsl-editor-panel',
      viewport: '1180,1100',
      fullPage: true,
      waitMs: 1200,
      url: `${baseUrl}/?demo_fixture=/demo/studio_demo/events.jsonl&demo_capture=dsl`,
    },
  ];

  for (const spec of specs) {
    const args = [
      'dlx',
      'playwright',
      'screenshot',
      '--browser',
      'chromium',
      '--viewport-size',
      spec.viewport,
      '--wait-for-selector',
      spec.selector,
      '--wait-for-timeout',
      String(spec.waitMs ?? 1500),
    ];

    if (spec.fullPage) {
      args.push('--full-page');
    }

    args.push(spec.url, path.join('docs', 'images', spec.fileName));
    await run(pnpmCommand(), args);
  }
}

function viteBinary(): string {
  if (process.platform === 'win32') {
    return path.join(studioDir, 'node_modules', '.bin', 'vite.cmd');
  }

  return path.join(studioDir, 'node_modules', '.bin', 'vite');
}

async function main(): Promise<void> {
  let devServer: ChildProcess | null = null;

  await stageDemoFixture();
  try {
    devServer = spawnCommand(viteBinary(), [
      '--host',
      studioHost,
      '--port',
      String(studioPort),
    ], { cwd: studioDir });

    await waitForServer(baseUrl);
    await captureScreenshots();
  } finally {
    if (devServer) {
      await stopDevServer(devServer);
    }
    await cleanupDemoFixture();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`docs screenshot refresh failed: ${message}`);
  process.exitCode = 1;
});
