import { createHash } from 'node:crypto';

import type { MinimalAiplanV1 } from './minimal-schema.ts';

export type MinimalAiplanHashVerification =
  | { ok: true; expectedHash: string; actualHash: string }
  | { ok: false; expectedHash: string; actualHash: string; reason: string };

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object' && value !== null) {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      const canonicalValue = canonicalize(input[key]);
      if (canonicalValue !== undefined) output[key] = canonicalValue;
    }
    return output;
  }
  if (value === undefined) return undefined;
  return String(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type MinimalAiplanHashable = Omit<MinimalAiplanV1, 'freeze'> & {
  freeze: Omit<MinimalAiplanV1['freeze'], 'contract_hash'> & { contract_hash: null };
};

export function normalizeMinimalAiplanForHash(plan: MinimalAiplanV1): MinimalAiplanHashable {
  return {
    ...plan,
    allowed_scope: { files: [...plan.allowed_scope.files] },
    excluded_scope: { files: [...plan.excluded_scope.files] },
    expected_evidence: {
      required_commands: [...plan.expected_evidence.required_commands],
      ...(plan.expected_evidence.required_changed_files === undefined
        ? {}
        : { required_changed_files: [...plan.expected_evidence.required_changed_files] }),
    },
    freeze: {
      ...plan.freeze,
      contract_hash: null,
    },
  };
}

export function computeMinimalAiplanContractHash(plan: MinimalAiplanV1): string {
  const canonicalJson = JSON.stringify(canonicalize(normalizeMinimalAiplanForHash(plan)));
  return `sha256:${sha256(canonicalJson)}`;
}

export function verifyMinimalAiplanContractHash(plan: MinimalAiplanV1): MinimalAiplanHashVerification {
  const expectedHash = plan.freeze.contract_hash.trim();
  const actualHash = computeMinimalAiplanContractHash(plan);

  if (!expectedHash.startsWith('sha256:')) {
    return { ok: false, expectedHash, actualHash, reason: 'Expected freeze.contract_hash to use sha256:<hex> format.' };
  }

  if (expectedHash !== actualHash) {
    return { ok: false, expectedHash, actualHash, reason: 'Frozen contract hash does not match current .aiplan content.' };
  }

  return { ok: true, expectedHash, actualHash };
}
