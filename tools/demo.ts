import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sourceFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'studio_demo');
const targetFixtureDir = path.join(repoRoot, 'apps', 'studio', 'public', 'demo', 'studio_demo');
const demoPath = '/?demo_fixture=/demo/studio_demo/events.jsonl';

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function stageFixture(): Promise<void> {
  await rm(targetFixtureDir, { recursive: true, force: true });
  await mkdir(path.dirname(targetFixtureDir), { recursive: true });
  await cp(sourceFixtureDir, targetFixtureDir, { recursive: true });
}

async function main(): Promise<void> {
  await stageFixture();

  console.log('Validating demo fixture bundle...');
  await run(pnpmCommand(), ['studio', 'inspect', 'tests/fixtures/studio_demo']);

  console.log('Starting studio demo...');
  await run(pnpmCommand(), ['--filter', '@muesli/studio', 'dev', '--open', demoPath]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`demo failed: ${message}`);
  process.exitCode = 1;
});
