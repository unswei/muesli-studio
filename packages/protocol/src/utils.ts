import { outcomeValues, severityValues, statusValues } from './validate';

const terminalStatuses = new Set(['success', 'failure', 'skipped']);

export function formatStableKey(parts: Array<string | number | undefined>): string {
  return parts
    .filter((part): part is string | number => part !== undefined)
    .map((part) => String(part).trim())
    .join(':');
}

export function normaliseDigest(digest: string): string {
  return digest.trim().toLowerCase();
}

export function isTerminalStatus(status: string): status is (typeof statusValues)[number] {
  return statusValues.includes(status as (typeof statusValues)[number]) && terminalStatuses.has(status);
}

export function isKnownSeverity(severity: string): severity is (typeof severityValues)[number] {
  return severityValues.includes(severity as (typeof severityValues)[number]);
}

export function isKnownOutcome(outcome: string): outcome is (typeof outcomeValues)[number] {
  return outcomeValues.includes(outcome as (typeof outcomeValues)[number]);
}
