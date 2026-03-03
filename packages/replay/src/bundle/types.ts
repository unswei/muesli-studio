import type { RunEventRecord, RunSummary } from '../summarise-run';
import type { VersionGateResult } from '../version-gate';

export interface FixtureBundleManifest {
  contract_id: string;
  contract_version: string;
  fixture_name: string;
  schema: string;
  [key: string]: unknown;
}

export interface LoadedBundle {
  bundle_dir: string;
  manifest: FixtureBundleManifest;
  config: Record<string, unknown> | null;
  seed: Record<string, unknown> | null;
  expected_metrics: Record<string, unknown> | null;
  events: RunEventRecord[];
  validation: {
    ok: boolean;
    diagnostics: string[];
    validator_path: string;
  };
  version_gate: VersionGateResult;
  summary: RunSummary;
}

export class BundleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleLoadError';
  }
}
