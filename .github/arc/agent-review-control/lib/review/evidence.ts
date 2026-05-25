import { createHash } from 'node:crypto';

export type ArcEvidenceTrustLevel =
  | 'machine_verified'
  | 'provider_verified'
  | 'agent_reported'
  | 'human_reported';

export type ArcEvidenceFreshness = 'current' | 'stale' | 'unknown';
export type ArcEvidenceSource = 'github' | 'git' | 'agent' | 'arc' | 'ci' | 'human';

export type ArcEvidenceKind =
  | 'aiplan'
  | 'diff'
  | 'file'
  | 'commit'
  | 'ci_check'
  | 'command_output'
  | 'agent_claim'
  | 'runtime_event'
  | 'dependency_change'
  | 'migration'
  | 'manual_note'
  | 'changed_files_summary'
  | 'deviations';

export type ArcChangedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unchanged';

export type ArcChangedFile = {
  path: string;
  status: ArcChangedFileStatus;
  additions?: number;
  deletions?: number;
  previousPath?: string;
  isBinary?: boolean;
};

export type ArcChangedFileSignals = {
  dependencyChanged: boolean;
  migrationChanged: boolean;
  generatedFilesTouched: boolean;
  vendorFilesTouched: boolean;
  binaryFilesTouched: boolean;
  sensitiveAreasTouched: string[];
  dependencyFiles: string[];
  migrationFiles: string[];
  generatedFiles: string[];
  vendorFiles: string[];
  binaryFiles: string[];
  sensitiveFiles: Record<string, string[]>;
};

export type ArcEvidenceRequirement = {
  id: string;
  type: string;
  description: string;
  required: boolean;
};

export type ArcEvidenceRef = {
  id: string;
  kind: ArcEvidenceKind;
  source: ArcEvidenceSource;
  trustLevel: ArcEvidenceTrustLevel;
  freshness: ArcEvidenceFreshness;
  label: string;
  satisfies?: string[];
  uri?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  contentHash?: string;
  collectedAt: string;
  excerpt?: string;
  redacted: boolean;
  redactionReason?: string;
};

export type ArcPlanEvidenceStatus = 'draft' | 'frozen' | 'superseded' | 'missing';

export type ArcEvidenceSubject = {
  provider: 'github' | 'git' | 'manual' | 'linear' | 'jira' | string;
  repo: string;
  prNumber?: number;
  prUrl?: string;
  headSha: string;
  baseSha: string;
  branch: string;
};

export type ArcEvidenceSnapshot = {
  evidenceSnapshotId: string;
  planId: string;
  planPath: string;
  planStatus: ArcPlanEvidenceStatus;
  planHash: string | null;
  subject: ArcEvidenceSubject;
  headSha: string;
  baseSha: string;
  diffHash: string;
  collectedAt: string;
  freshness: ArcEvidenceFreshness;
  staleReason?: string;
  changedFiles: ArcChangedFile[];
  signals: ArcChangedFileSignals;
  refs: ArcEvidenceRef[];
  requiredEvidence: ArcEvidenceRequirement[];
  missingRequiredEvidence: string[];
};

type EvidenceSnapshotInput = {
  plan: {
    id: string;
    path: string;
    status: ArcPlanEvidenceStatus;
    contentHash?: string | null;
  };
  subject: ArcEvidenceSubject;
  changedFiles: ArcChangedFile[];
  refs?: ArcEvidenceRef[];
  requiredEvidence?: ArcEvidenceRequirement[];
  collectedAt?: string;
  freshness?: ArcEvidenceFreshness;
  staleReason?: string;
};

function canonicalize(value: unknown, inArray = false): unknown {
  if (value === undefined) {
    return inArray ? null : undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, true));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const canonicalValue = canonicalize(record[key], false);
      if (canonicalValue !== undefined) {
        result[key] = canonicalValue;
      }
    }
    return result;
  }

  return String(value);
}

export function stableHash(value: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return createHash('sha256').update(canonicalJson).digest('hex');
}

function normalizeChangedFiles(changedFiles: ArcChangedFile[]): ArcChangedFile[] {
  return [...changedFiles]
    .map((file) => ({ ...file, path: normalizePath(file.path), previousPath: file.previousPath ? normalizePath(file.previousPath) : undefined }))
    .sort((a, b) => `${a.path}:${a.status}`.localeCompare(`${b.path}:${b.status}`));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function recordSignal(record: Record<string, string[]>, key: string, filePath: string) {
  record[key] ??= [];
  record[key].push(filePath);
}

export function deriveChangedFileSignals(changedFiles: ArcChangedFile[]): ArcChangedFileSignals {
  const normalizedFiles = normalizeChangedFiles(changedFiles);
  const dependencyFiles: string[] = [];
  const migrationFiles: string[] = [];
  const generatedFiles: string[] = [];
  const vendorFiles: string[] = [];
  const binaryFiles: string[] = [];
  const sensitiveFiles: Record<string, string[]> = {};

  for (const file of normalizedFiles) {
    const path = file.path.toLowerCase();

    if (isDependencyPath(path)) {
      dependencyFiles.push(file.path);
    }

    if (isMigrationPath(path)) {
      migrationFiles.push(file.path);
    }

    if (isGeneratedPath(path)) {
      generatedFiles.push(file.path);
    }

    if (isVendorPath(path)) {
      vendorFiles.push(file.path);
    }

    if (file.isBinary || isLikelyBinaryPath(path)) {
      binaryFiles.push(file.path);
    }

    for (const area of sensitiveAreasForPath(path)) {
      recordSignal(sensitiveFiles, area, file.path);
    }
  }

  for (const [area, files] of Object.entries(sensitiveFiles)) {
    sensitiveFiles[area] = uniqueSorted(files);
  }

  return {
    dependencyChanged: dependencyFiles.length > 0,
    migrationChanged: migrationFiles.length > 0,
    generatedFilesTouched: generatedFiles.length > 0,
    vendorFilesTouched: vendorFiles.length > 0,
    binaryFilesTouched: binaryFiles.length > 0,
    sensitiveAreasTouched: uniqueSorted(Object.keys(sensitiveFiles)),
    dependencyFiles: uniqueSorted(dependencyFiles),
    migrationFiles: uniqueSorted(migrationFiles),
    generatedFiles: uniqueSorted(generatedFiles),
    vendorFiles: uniqueSorted(vendorFiles),
    binaryFiles: uniqueSorted(binaryFiles),
    sensitiveFiles,
  };
}

function isDependencyPath(path: string): boolean {
  return /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements\.txt|poetry\.lock|pyproject\.toml|gemfile|gemfile\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock)$/i.test(path);
}

function isMigrationPath(path: string): boolean {
  return /(^|\/)(migrations?|db\/migrate|database\/migrations?)(\/|$)/i.test(path) || /(^|\/)(\d{3,}|\d{4}_\d{2}_\d{2}).*\.(sql|ts|js|py)$/i.test(path);
}

function isGeneratedPath(path: string): boolean {
  return /(^|\/)(__generated__|generated|gen)(\/|$)/i.test(path) || /\.generated\./i.test(path);
}

function isVendorPath(path: string): boolean {
  return /(^|\/)(vendor|third_party|node_modules|dist|build)(\/|$)/i.test(path);
}

function isLikelyBinaryPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|mp4|mov|mp3|wav|woff2?|ttf|otf|wasm)$/i.test(path);
}

function sensitiveAreasForPath(path: string): string[] {
  const areas: string[] = [];
  if (/(^|\/)(auth|session|sessions|login|oauth|sso)(\/|\.|-|_)/i.test(path) || /(^|\/)middleware\.(ts|js)$/i.test(path)) {
    areas.push('auth');
  }
  if (/(^|\/)(security|crypto|permission|permissions|policy|policies|rbac|acl)(\/|\.|-|_)/i.test(path)) {
    areas.push('security');
  }
  if (/(^|\/)(payment|payments|billing|stripe|checkout|invoice|invoices)(\/|\.|-|_)/i.test(path)) {
    areas.push('payments');
  }
  if (/(^|\/)(db|database|schema|models?|migrations?)(\/|\.|-|_)/i.test(path) || /\.(sql|prisma)$/i.test(path)) {
    areas.push('database');
  }
  if (/(^|\/)(infra|terraform|k8s|kubernetes|helm|deploy|deployment|docker)(\/|\.|-|_)/i.test(path) || /(^|\/)(dockerfile|docker-compose\.ya?ml)$/i.test(path)) {
    areas.push('infra');
  }
  return areas;
}

function automaticRefs(input: EvidenceSnapshotInput, collectedAt: string, diffHash: string): ArcEvidenceRef[] {
  return [
    {
      id: `aiplan:${input.plan.id}`,
      kind: 'aiplan',
      source: 'arc',
      trustLevel: 'machine_verified',
      freshness: input.freshness ?? 'current',
      label: `AI plan ${input.plan.id}`,
      filePath: input.plan.path,
      contentHash: input.plan.contentHash ?? undefined,
      collectedAt,
      redacted: false,
    },
    {
      id: `diff:${diffHash}`,
      kind: 'diff',
      source: input.subject.provider === 'github' ? 'github' : 'git',
      trustLevel: input.subject.provider === 'github' ? 'provider_verified' : 'machine_verified',
      freshness: input.freshness ?? 'current',
      label: `Diff for ${input.subject.headSha}`,
      uri: input.subject.prUrl,
      contentHash: diffHash,
      collectedAt,
      redacted: false,
    },
  ];
}

function missingRequiredEvidence(requirements: ArcEvidenceRequirement[], refs: ArcEvidenceRef[]): string[] {
  const currentSatisfiedIds = new Set(
    refs
      .filter((ref) => ref.freshness === 'current')
      .flatMap((ref) => ref.satisfies ?? []),
  );

  return requirements
    .filter((requirement) => requirement.required && !currentSatisfiedIds.has(requirement.id))
    .map((requirement) => requirement.id);
}

export function createEvidenceSnapshot(input: EvidenceSnapshotInput): ArcEvidenceSnapshot {
  const collectedAt = input.collectedAt ?? new Date().toISOString();
  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const diffHash = stableHash(changedFiles);
  const refs = [...automaticRefs(input, collectedAt, diffHash), ...(input.refs ?? [])];
  const requiredEvidence = input.requiredEvidence ?? [];
  const missing = missingRequiredEvidence(requiredEvidence, refs);
  const freshness = input.freshness ?? (input.staleReason ? 'stale' : 'current');
  const signals = deriveChangedFileSignals(changedFiles);
  const snapshotIdentity = {
    planId: input.plan.id,
    planPath: input.plan.path,
    planStatus: input.plan.status,
    planHash: input.plan.contentHash ?? null,
    headSha: input.subject.headSha,
    baseSha: input.subject.baseSha,
    diffHash,
    freshness,
    staleReason: input.staleReason,
    refs: refs.map((ref) => ({
      id: ref.id,
      kind: ref.kind,
      source: ref.source,
      trustLevel: ref.trustLevel,
      freshness: ref.freshness,
      contentHash: ref.contentHash,
      satisfies: ref.satisfies,
      redacted: ref.redacted,
    })),
    missingRequiredEvidence: missing,
  };

  return {
    evidenceSnapshotId: stableHash(snapshotIdentity),
    planId: input.plan.id,
    planPath: input.plan.path,
    planStatus: input.plan.status,
    planHash: input.plan.contentHash ?? null,
    subject: input.subject,
    headSha: input.subject.headSha,
    baseSha: input.subject.baseSha,
    diffHash,
    collectedAt,
    freshness,
    staleReason: input.staleReason,
    changedFiles,
    signals,
    refs,
    requiredEvidence,
    missingRequiredEvidence: missing,
  };
}
