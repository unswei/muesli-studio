import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BundleLoadError, loadBundle } from '@muesli/replay';

interface CliArgs {
  command: string | null;
  bundleDir: string | null;
  outPath: string | null;
  schemaPath: string | null;
  validatorPath: string | null;
}

function usage(): string {
  return [
    'usage:',
    '  studio inspect <bundle_dir> [--out <path>] [--schema <path>] [--validator <path>]',
    '',
    'examples:',
    '  studio inspect tests/fixtures/determinism_replay',
    '  studio inspect tests/fixtures/determinism_replay --out /tmp/run_summary.json',
  ].join('\n');
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0) {
    return {
      command: null,
      bundleDir: null,
      outPath: null,
      schemaPath: null,
      validatorPath: null,
    };
  }

  const [command, bundleDirCandidate, ...rest] = argv;
  const bundleDir = bundleDirCandidate ?? null;
  let outPath: string | null = null;
  let schemaPath: string | null = null;
  let validatorPath: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${arg}`);
    }

    if (!value) {
      throw new Error(`missing value for ${arg}`);
    }

    if (arg === '--out') {
      outPath = value;
    } else if (arg === '--schema') {
      schemaPath = value;
    } else if (arg === '--validator') {
      validatorPath = value;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
    index += 1;
  }

  return {
    command,
    bundleDir,
    outPath,
    schemaPath,
    validatorPath,
  };
}

async function runInspect(args: CliArgs): Promise<void> {
  if (!args.bundleDir) {
    throw new Error('missing <bundle_dir>');
  }

  const bundleDir = path.resolve(args.bundleDir);
  const loaded = await loadBundle(bundleDir, {
    schemaPath: args.schemaPath ?? undefined,
    validatorPath: args.validatorPath ?? undefined,
  });

  const summary = loaded.summary;
  const totalEvents = Object.values(summary.event_counts).reduce((sum, value) => sum + value, 0);

  console.log(`bundle: ${loaded.manifest.fixture_name}`);
  console.log(`contract: ${summary.contract_version}`);
  console.log(`schema: ${summary.schema_version}`);
  console.log(`events: ${totalEvents}`);
  console.log(`ticks: ${summary.ticks.count}`);
  console.log(`digest: ${summary.digest}`);

  if (args.outPath) {
    const target = path.resolve(args.outPath);
    await writeFile(target, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`summary written: ${target}`);
  }
}

async function main(): Promise<void> {
  let parsed: CliArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error('');
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (parsed.command !== 'inspect') {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    await runInspect(parsed);
  } catch (error) {
    if (error instanceof BundleLoadError) {
      console.error(`bundle error: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`inspect failed: ${message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`inspect failed: ${message}`);
  process.exitCode = 1;
});
