import { spawn } from 'node:child_process';

export interface ValidateLogSubprocessOptions {
  validatorPath: string;
  logPath: string;
  schemaPath?: string;
  pythonExecutable?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ValidateLogSubprocessResult {
  ok: boolean;
  diagnostics: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function validateLogSubprocess(options: ValidateLogSubprocessOptions): Promise<ValidateLogSubprocessResult> {
  const pythonExecutable = options.pythonExecutable ?? 'python3';
  const timeoutMs = options.timeoutMs ?? 30_000;
  const args = [options.validatorPath];
  if (options.schemaPath) {
    args.push('--schema', options.schemaPath);
  }
  args.push(options.logPath);

  return new Promise<ValidateLogSubprocessResult>((resolve) => {
    const child = spawn(pythonExecutable, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: ValidateLogSubprocessResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        ok: false,
        diagnostics: ['validator timed out'],
        stdout,
        stderr,
        exitCode: null,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        diagnostics: [`failed to launch validator: ${error.message}`],
        stdout,
        stderr,
        exitCode: null,
      });
    });

    child.once('exit', (exitCode) => {
      clearTimeout(timer);

      const diagnosticLines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      finish({
        ok: exitCode === 0,
        diagnostics: diagnosticLines,
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

