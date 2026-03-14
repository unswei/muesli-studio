import { chmod, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

type ReleaseTarget = 'linux-intel' | 'macos-arm';

interface CliArgs {
  target: ReleaseTarget;
  version: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const releaseRoot = path.join(repoRoot, 'dist', 'release');

function parseArgs(argv: string[]): CliArgs {
  let target: ReleaseTarget | null = null;
  let version = process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME ?? 'dev';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--target') {
      const value = argv[index + 1];
      if (value === 'linux-intel' || value === 'macos-arm') {
        target = value;
      } else {
        throw new Error('expected --target to be one of: linux-intel, macos-arm');
      }
      index += 1;
      continue;
    }

    if (arg === '--version') {
      const value = argv[index + 1];
      if (!value || value.trim().length === 0) {
        throw new Error('expected non-empty value for --version');
      }
      version = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!target) {
    throw new Error('missing required argument: --target <linux-intel|macos-arm>');
  }

  return { target, version };
}

async function assertExists(pathToCheck: string, label: string): Promise<void> {
  try {
    await stat(pathToCheck);
  } catch {
    throw new Error(`${label} not found: ${pathToCheck}`);
  }
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
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

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bundleName = `muesli-studio-${args.version}-${args.target}`;
  const stagingDir = path.join(releaseRoot, bundleName);
  const archivePath = path.join(releaseRoot, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;

  const inspectorBinaryPath = path.join(repoRoot, 'apps', 'inspector', 'build', 'mbt_inspector');
  const studioDistPath = path.join(repoRoot, 'apps', 'studio', 'dist');
  const schemaPath = path.join(repoRoot, 'schema', 'mbt.evt.v1.schema.json');
  const contractPath = path.join(repoRoot, 'contracts', 'muesli-studio-integration.md');
  const readmePath = path.join(repoRoot, 'README.md');
  const licensePath = path.join(repoRoot, 'LICENSE');
  const launcherPath = path.join(repoRoot, 'start-studio.sh');

  await assertExists(inspectorBinaryPath, 'inspector binary');
  await assertExists(studioDistPath, 'studio dist');
  await assertExists(schemaPath, 'schema');
  await assertExists(contractPath, 'contract');
  await assertExists(readmePath, 'README');
  await assertExists(licensePath, 'LICENSE');
  await assertExists(launcherPath, 'launcher script');

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(path.join(stagingDir, 'bin'), { recursive: true });
  await mkdir(path.join(stagingDir, 'studio'), { recursive: true });
  await mkdir(path.join(stagingDir, 'schema'), { recursive: true });
  await mkdir(path.join(stagingDir, 'contracts'), { recursive: true });

  await cp(inspectorBinaryPath, path.join(stagingDir, 'bin', 'mbt_inspector'));
  await cp(studioDistPath, path.join(stagingDir, 'studio', 'dist'), { recursive: true });
  await cp(schemaPath, path.join(stagingDir, 'schema', 'mbt.evt.v1.schema.json'));
  await cp(contractPath, path.join(stagingDir, 'contracts', 'muesli-studio-integration.md'));
  await cp(readmePath, path.join(stagingDir, 'README.md'));
  await cp(licensePath, path.join(stagingDir, 'LICENSE'));
  await cp(launcherPath, path.join(stagingDir, 'start-studio.sh'));
  await chmod(path.join(stagingDir, 'start-studio.sh'), 0o755);

  const releaseNotes = [
    '# release bundle',
    '',
    `target: ${args.target}`,
    `version: ${args.version}`,
    '',
    'contains:',
    '- start-studio.sh',
    '- bin/mbt_inspector',
    '- studio/dist/ (static web app)',
    '- schema and contract copies',
  ].join('\n');
  await writeFile(path.join(stagingDir, 'RELEASE.md'), `${releaseNotes}\n`, 'utf8');

  await mkdir(releaseRoot, { recursive: true });
  await rm(archivePath, { force: true });
  await rm(checksumPath, { force: true });

  await run('tar', ['-czf', archivePath, '-C', releaseRoot, bundleName]);

  const digest = await sha256(archivePath);
  await writeFile(checksumPath, `${digest}  ${path.basename(archivePath)}\n`, 'utf8');

  await rm(stagingDir, { recursive: true, force: true });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`release packaging failed: ${message}`);
  process.exitCode = 1;
});
