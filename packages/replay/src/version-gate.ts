export interface VersionGateInput {
  contractVersion: string;
  schemaVersion: string;
  capabilities?: Record<string, unknown>;
}

export interface VersionGateResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  contract: {
    raw: string;
    major: number;
    minor: number;
  };
  schema: {
    raw: string;
    major: number;
    minor: number;
  };
  capabilities: Record<string, unknown>;
}

const SUPPORTED_CONTRACT_BASE = 'runtime-contract-v';
const SUPPORTED_SCHEMA_BASE = 'mbt.evt.v';
const SUPPORTED_CONTRACT_MAJOR = 1;
const SUPPORTED_CONTRACT_MINOR = 0;
const SUPPORTED_SCHEMA_MAJOR = 1;
const SUPPORTED_SCHEMA_MINOR = 0;

interface ParsedVersion {
  raw: string;
  major: number;
  minor: number;
}

function parseVersion(raw: string, prefix: string): ParsedVersion | null {
  const expression = new RegExp(`^${prefix}(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?$`);
  const match = raw.match(expression);
  if (!match) {
    return null;
  }

  return {
    raw,
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
  };
}

function gateVersion(
  parsed: ParsedVersion,
  expectedMajor: number,
  expectedMinor: number,
  label: string,
  warnings: string[],
  errors: string[],
): void {
  if (parsed.major !== expectedMajor) {
    errors.push(`${label} major version ${parsed.major} is not supported; expected ${expectedMajor}`);
    return;
  }

  if (parsed.minor > expectedMinor) {
    warnings.push(`${label} minor version ${parsed.minor} is newer than tested ${expectedMinor}`);
  }
}

export function evaluateVersionGate(input: VersionGateInput): VersionGateResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const parsedContract = parseVersion(input.contractVersion, SUPPORTED_CONTRACT_BASE);
  const parsedSchema = parseVersion(input.schemaVersion, SUPPORTED_SCHEMA_BASE);

  if (!parsedContract) {
    errors.push(`contract version "${input.contractVersion}" does not match ${SUPPORTED_CONTRACT_BASE}<major>[.<minor>]`);
  }

  if (!parsedSchema) {
    errors.push(`schema version "${input.schemaVersion}" does not match ${SUPPORTED_SCHEMA_BASE}<major>[.<minor>]`);
  }

  const safeContract = parsedContract ?? {
    raw: input.contractVersion,
    major: -1,
    minor: -1,
  };

  const safeSchema = parsedSchema ?? {
    raw: input.schemaVersion,
    major: -1,
    minor: -1,
  };

  if (parsedContract) {
    gateVersion(parsedContract, SUPPORTED_CONTRACT_MAJOR, SUPPORTED_CONTRACT_MINOR, 'contract', warnings, errors);
  }

  if (parsedSchema) {
    gateVersion(parsedSchema, SUPPORTED_SCHEMA_MAJOR, SUPPORTED_SCHEMA_MINOR, 'schema', warnings, errors);
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    contract: safeContract,
    schema: safeSchema,
    capabilities: input.capabilities ?? {},
  };
}
