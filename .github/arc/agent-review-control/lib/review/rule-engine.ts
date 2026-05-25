import type { AiplanV1 } from '../aiplan/types.ts';
import { stableHash, type ArcEvidenceRef, type ArcEvidenceSnapshot } from './evidence.ts';

export type ArcVerdictStatus = 'trusted' | 'trusted_with_notes' | 'needs_review' | 'blocked';
export type ArcFindingSeverity = 'info' | 'warning' | 'blocker';
export type ArcFindingStatus = 'open' | 'resolved' | 'accepted_risk' | 'false_positive' | 'superseded';
export type ArcFindingConfidence = 'low' | 'medium' | 'high';
export type ArcFalsePositiveRisk = 'low' | 'medium' | 'high';
export type ArcSuggestedOutcome = 'note' | 'review' | 'block';

export type ArcFindingCategory =
  | 'contract'
  | 'scope'
  | 'evidence'
  | 'validation'
  | 'risk'
  | 'claim'
  | 'continuity'
  | 'security'
  | 'dependency'
  | 'migration';

export type ArcFinding = {
  id: string;
  fingerprint: string;
  ruleId: string;
  ruleVersion: string;
  severity: ArcFindingSeverity;
  category: ArcFindingCategory;
  status: ArcFindingStatus;
  confidence: ArcFindingConfidence;
  falsePositiveRisk: ArcFalsePositiveRisk;
  blockingEligible: boolean;
  suggestedOutcome: ArcSuggestedOutcome;
  humanTitle: string;
  humanSummary: string;
  ownerAction: string;
  agentExplanation: string;
  agentActionHint?: string;
  expected?: {
    source: 'aiplan' | 'policy' | 'rule';
    description: string;
    fields?: string[];
  };
  actual?: {
    description: string;
    evidenceRefs: string[];
  };
  evidenceRefs: string[];
  relatedAiplanFields: string[];
  relatedFiles: string[];
  remediation?: {
    type:
      | 'revert_change'
      | 'add_evidence'
      | 'run_validation'
      | 'request_human_approval'
      | 'create_superseding_aiplan'
      | 'update_pr';
    description: string;
  };
  waiver?: {
    allowed: boolean;
    reasonRequired: boolean;
    approvedBy?: string;
    approvedAt?: string;
    reason?: string;
  };
  createdAt: string;
};

export type ArcRule = {
  id: string;
  version: string;
  run(input: ArcRuleInput): ArcFinding[];
};

export type ArcRuleInput = {
  plan?: Partial<AiplanV1> | null;
  snapshot: ArcEvidenceSnapshot;
  createdAt: string;
};

export type ArcVerdict = {
  status: ArcVerdictStatus;
  reason: string;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
};

export type ArcReviewRun = {
  schemaVersion: '1.0';
  reviewId: string;
  status: 'running' | 'completed' | 'failed' | 'stale';
  trigger: {
    type: 'pr_opened' | 'pr_updated' | 'manual' | 'agent_completed';
    triggeredBy: 'github' | 'arc' | 'human' | 'agent';
    triggeredAt: string;
  };
  subject: {
    provider: string;
    repo: string;
    prNumber?: number;
    prUrl?: string;
    headSha: string;
    baseSha: string;
    branch: string;
  };
  contract: {
    planId: string;
    planPath: string;
    planStatus: ArcEvidenceSnapshot['planStatus'];
    contentHash: string | null;
    frozenAt?: string;
    frozenBy?: string;
  };
  inputSnapshot: {
    diffHash: string;
    changedFilesHash: string;
    evidenceSnapshotId: string;
    collectedAt: string;
    freshness: ArcEvidenceSnapshot['freshness'];
    staleReason?: string;
  };
  evidence: {
    refs: ArcEvidenceRef[];
    missingRequiredEvidence: string[];
  };
  ruleExecution: {
    engineVersion: string;
    rulesRun: string[];
    rulesSkipped: { ruleId: string; reason: string }[];
    ruleErrors: { ruleId: string; error: string }[];
  };
  findings: ArcFinding[];
  verdict: ArcVerdict;
  trustBrief: {
    reviewerAction: 'safe_to_skim' | 'needs_deep_review' | 'block_before_merge';
    summary: string;
    inspectFirst: string[];
    requiredActions: string[];
  };
  publication: {
    githubCheckId?: string;
    githubCommentUrl?: string;
    arcReviewUrl?: string;
    publishedAt?: string;
  };
  humanReview?: {
    decision: 'approved' | 'changes_requested' | 'rejected' | 'accepted_risk';
    reviewedBy: string;
    reviewedAt: string;
    notes?: string;
  };
  audit: {
    createdAt: string;
    completedAt?: string;
    runHash: string;
    previousReviewId?: string;
    supersedesReviewId?: string;
  };
};

export type RunArcReviewRulesInput = {
  plan?: Partial<AiplanV1> | null;
  snapshot: ArcEvidenceSnapshot;
  reviewId?: string;
  createdAt?: string;
  engineVersion?: string;
  trigger?: ArcReviewRun['trigger'];
};

type FindingDraft = Omit<ArcFinding, 'id' | 'fingerprint' | 'createdAt' | 'status' | 'ruleVersion'> & {
  status?: ArcFindingStatus;
  ruleVersion?: string;
};

const ENGINE_VERSION = 'dogfood-v1';
const RULE_VERSION = '1.0';

function makeFinding(draft: FindingDraft, createdAt: string): ArcFinding {
  const fingerprint = stableHash({
    ruleId: draft.ruleId,
    expected: draft.expected,
    actual: draft.actual,
    evidenceRefs: draft.evidenceRefs,
    relatedAiplanFields: draft.relatedAiplanFields,
    relatedFiles: draft.relatedFiles,
  });

  return {
    id: `${draft.ruleId}:${fingerprint.slice(0, 12)}`,
    fingerprint,
    status: draft.status ?? 'open',
    ruleVersion: draft.ruleVersion ?? RULE_VERSION,
    createdAt,
    ...draft,
  };
}

function planHash(plan?: Partial<AiplanV1> | null): string | null {
  return plan?.freeze?.content_hash ?? null;
}

function planFrozenAt(plan?: Partial<AiplanV1> | null): string | undefined {
  return plan?.freeze?.frozen_at ?? undefined;
}

function planFrozenBy(plan?: Partial<AiplanV1> | null): string | undefined {
  return plan?.freeze?.frozen_by ?? undefined;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function listFilesForDisallowedArea(snapshot: ArcEvidenceSnapshot, area: string): string[] {
  const normalizedArea = normalizePath(area).toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!normalizedArea) return [];

  const signalFiles = snapshot.signals.sensitiveFiles[normalizedArea] ?? [];
  const pathMatches = snapshot.changedFiles
    .filter((file) => pathMatchesArea(normalizePath(file.path).toLowerCase(), normalizedArea))
    .map((file) => file.path);
  return [...new Set([...signalFiles, ...pathMatches])].sort();
}

function pathMatchesArea(filePath: string, normalizedArea: string): boolean {
  if (normalizedArea.includes('/')) {
    return filePath === normalizedArea || filePath.startsWith(`${normalizedArea}/`);
  }

  return filePath.split('/').some((segment) => {
    if (segment === normalizedArea) return true;
    return segment.split(/[._-]/).includes(normalizedArea);
  });
}

function evidenceRefIdsForFiles(snapshot: ArcEvidenceSnapshot, files: string[]): string[] {
  const fileSet = new Set(files.map(normalizePath));
  const matched = snapshot.refs.filter((ref) => ref.filePath && fileSet.has(normalizePath(ref.filePath)));
  return matched.length > 0 ? matched.map((ref) => ref.id) : [`diff:${snapshot.diffHash}`];
}

const rules: ArcRule[] = [
  {
    id: 'contract.plan_missing_or_not_frozen',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      const planIsFrozen = Boolean(plan) && plan?.status === 'frozen' && snapshot.planStatus === 'frozen';
      if (planIsFrozen) return [];

      return [
        makeFinding(
          {
            ruleId: 'contract.plan_missing_or_not_frozen',
            severity: 'blocker',
            category: 'contract',
            confidence: 'high',
            falsePositiveRisk: 'low',
            blockingEligible: true,
            suggestedOutcome: 'block',
            humanTitle: 'Frozen .aiplan is missing or not frozen',
            humanSummary: `ARC cannot prove this work was approved before implementation because plan status is ${snapshot.planStatus}.`,
            ownerAction: 'Freeze a valid .aiplan or attach the correct frozen plan before trusting this PR.',
            agentExplanation: 'Implementation must be bound to a frozen AI plan. Draft, missing, or superseded plans cannot establish trust.',
            agentActionHint: 'Stop implementation and ask the owner to freeze or attach the correct .aiplan.',
            expected: {
              source: 'aiplan',
              description: 'A loaded .aiplan with status=frozen matching the review snapshot.',
              fields: ['status', 'freeze.frozen_at', 'freeze.frozen_by'],
            },
            actual: {
              description: `Loaded plan status: ${plan?.status ?? 'missing'}; snapshot plan status: ${snapshot.planStatus}.`,
              evidenceRefs: [`aiplan:${snapshot.planId}`],
            },
            evidenceRefs: [`aiplan:${snapshot.planId}`],
            relatedAiplanFields: ['status', 'freeze'],
            relatedFiles: [snapshot.planPath],
            remediation: {
              type: 'request_human_approval',
              description: 'Get a human-approved frozen .aiplan and rerun ARC review.',
            },
            waiver: { allowed: false, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'contract.plan_hash_mismatch',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      const expectedHash = planHash(plan);
      if (!expectedHash || !snapshot.planHash || expectedHash === snapshot.planHash) return [];

      return [
        makeFinding(
          {
            ruleId: 'contract.plan_hash_mismatch',
            severity: 'blocker',
            category: 'contract',
            confidence: 'high',
            falsePositiveRisk: 'low',
            blockingEligible: true,
            suggestedOutcome: 'block',
            humanTitle: 'Frozen .aiplan hash does not match review snapshot',
            humanSummary: 'The plan content ARC reviewed is not the same frozen contract recorded on the plan.',
            ownerAction: 'Do not merge until the correct frozen plan is restored or a superseding plan is approved.',
            agentExplanation: 'Plan hash mismatch means the contract may have drifted after approval.',
            agentActionHint: 'Reload the frozen plan from disk, verify its hash, and stop if it does not match.',
            expected: {
              source: 'aiplan',
              description: `Frozen plan hash ${expectedHash}.`,
              fields: ['freeze.content_hash'],
            },
            actual: {
              description: `Review snapshot plan hash ${snapshot.planHash}.`,
              evidenceRefs: [`aiplan:${snapshot.planId}`],
            },
            evidenceRefs: [`aiplan:${snapshot.planId}`],
            relatedAiplanFields: ['freeze.content_hash'],
            relatedFiles: [snapshot.planPath],
            remediation: {
              type: 'create_superseding_aiplan',
              description: 'Restore the original frozen plan or create a human-approved superseding plan.',
            },
            waiver: { allowed: false, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'evidence.snapshot_stale',
    version: RULE_VERSION,
    run({ snapshot, createdAt }) {
      if (snapshot.freshness === 'current') return [];

      return [
        makeFinding(
          {
            ruleId: 'evidence.snapshot_stale',
            severity: 'warning',
            category: 'evidence',
            confidence: 'high',
            falsePositiveRisk: 'medium',
            blockingEligible: false,
            suggestedOutcome: 'review',
            humanTitle: 'Evidence snapshot may be stale',
            humanSummary: snapshot.staleReason ?? 'ARC evidence is not known to match the latest PR state.',
            ownerAction: 'Rerun ARC review against the current PR head before relying on this verdict.',
            agentExplanation: 'Evidence must bind to the current head/base SHAs and plan hash before ARC can trust it.',
            agentActionHint: 'Collect fresh evidence for the current PR head and rerun the rule engine.',
            expected: {
              source: 'rule',
              description: 'Evidence snapshot freshness should be current.',
              fields: ['inputSnapshot.freshness'],
            },
            actual: {
              description: `Evidence snapshot freshness is ${snapshot.freshness}.`,
              evidenceRefs: [`diff:${snapshot.diffHash}`],
            },
            evidenceRefs: [`diff:${snapshot.diffHash}`],
            relatedAiplanFields: ['continuity_policy'],
            relatedFiles: [],
            remediation: {
              type: 'add_evidence',
              description: 'Collect a fresh evidence snapshot for the current PR state.',
            },
            waiver: { allowed: true, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'evidence.required_missing',
    version: RULE_VERSION,
    run({ snapshot, createdAt }) {
      if (snapshot.missingRequiredEvidence.length === 0) return [];

      return [
        makeFinding(
          {
            ruleId: 'evidence.required_missing',
            severity: 'warning',
            category: 'evidence',
            confidence: 'high',
            falsePositiveRisk: 'medium',
            blockingEligible: false,
            suggestedOutcome: 'review',
            humanTitle: 'Required evidence is missing',
            humanSummary: `ARC could not find current evidence for: ${snapshot.missingRequiredEvidence.join(', ')}.`,
            ownerAction: 'Ask the agent to provide the missing evidence or explain why it is not applicable.',
            agentExplanation: 'Required evidence items must be satisfied by current evidence refs before ARC can mark the work trusted.',
            agentActionHint: 'Attach evidence refs with satisfies entries for each missing required evidence id, or report a blocker/not-applicable reason.',
            expected: {
              source: 'aiplan',
              description: 'Every required evidence item has a current satisfying evidence ref.',
              fields: ['required_evidence'],
            },
            actual: {
              description: `Missing evidence ids: ${snapshot.missingRequiredEvidence.join(', ')}.`,
              evidenceRefs: snapshot.refs.map((ref) => ref.id),
            },
            evidenceRefs: snapshot.refs.map((ref) => ref.id),
            relatedAiplanFields: ['required_evidence'],
            relatedFiles: [],
            remediation: {
              type: 'add_evidence',
              description: 'Provide current evidence refs for missing required evidence ids.',
            },
            waiver: { allowed: true, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'dependency.change_without_permission',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      if (!snapshot.signals.dependencyChanged || plan?.permissions?.dependency_changes_allowed === true) return [];

      return [
        makeFinding(
          {
            ruleId: 'dependency.change_without_permission',
            severity: 'warning',
            category: 'dependency',
            confidence: 'high',
            falsePositiveRisk: 'medium',
            blockingEligible: false,
            suggestedOutcome: 'review',
            humanTitle: 'Dependency files changed without plan permission',
            humanSummary: `Dependency-related files changed: ${snapshot.signals.dependencyFiles.join(', ')}.`,
            ownerAction: 'Review whether this dependency change is necessary, then approve a superseding plan or ask the agent to revert it.',
            agentExplanation: 'The frozen plan did not allow dependency changes, but dependency metadata changed in the PR.',
            agentActionHint: 'Explain why the dependency change is required, provide validation evidence, or revert it.',
            expected: {
              source: 'aiplan',
              description: 'No dependency files should change unless dependency_changes_allowed is true.',
              fields: ['permissions.dependency_changes_allowed'],
            },
            actual: {
              description: `Dependency files changed: ${snapshot.signals.dependencyFiles.join(', ')}.`,
              evidenceRefs: evidenceRefIdsForFiles(snapshot, snapshot.signals.dependencyFiles),
            },
            evidenceRefs: evidenceRefIdsForFiles(snapshot, snapshot.signals.dependencyFiles),
            relatedAiplanFields: ['permissions.dependency_changes_allowed'],
            relatedFiles: snapshot.signals.dependencyFiles,
            remediation: {
              type: 'request_human_approval',
              description: 'Human must approve the dependency change or agent should revert it.',
            },
            waiver: { allowed: true, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'migration.change_without_permission',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      if (!snapshot.signals.migrationChanged || plan?.permissions?.migration_allowed === true) return [];

      return [
        makeFinding(
          {
            ruleId: 'migration.change_without_permission',
            severity: 'warning',
            category: 'migration',
            confidence: 'high',
            falsePositiveRisk: 'medium',
            blockingEligible: false,
            suggestedOutcome: 'review',
            humanTitle: 'Migration changed without plan permission',
            humanSummary: `Migration-related files changed: ${snapshot.signals.migrationFiles.join(', ')}.`,
            ownerAction: 'Review migration safety and rollback expectations before approving this PR.',
            agentExplanation: 'The frozen plan did not allow migrations, but migration files changed in the PR.',
            agentActionHint: 'Explain why the migration is required, provide rollback/validation evidence, or revert it.',
            expected: {
              source: 'aiplan',
              description: 'No migration files should change unless migration_allowed is true.',
              fields: ['permissions.migration_allowed'],
            },
            actual: {
              description: `Migration files changed: ${snapshot.signals.migrationFiles.join(', ')}.`,
              evidenceRefs: evidenceRefIdsForFiles(snapshot, snapshot.signals.migrationFiles),
            },
            evidenceRefs: evidenceRefIdsForFiles(snapshot, snapshot.signals.migrationFiles),
            relatedAiplanFields: ['permissions.migration_allowed', 'risk.rollback_expectation'],
            relatedFiles: snapshot.signals.migrationFiles,
            remediation: {
              type: 'request_human_approval',
              description: 'Human must approve the migration change or agent should revert it.',
            },
            waiver: { allowed: true, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
  {
    id: 'scope.disallowed_area_touched',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      const disallowedAreas = (plan?.scope?.disallowed?.areas ?? []).filter(Boolean);
      const findings: ArcFinding[] = [];

      for (const area of disallowedAreas) {
        const relatedFiles = listFilesForDisallowedArea(snapshot, area);
        if (relatedFiles.length === 0) continue;

        findings.push(
          makeFinding(
            {
              ruleId: 'scope.disallowed_area_touched',
              severity: 'blocker',
              category: area === 'auth' || area === 'security' ? 'security' : 'scope',
              confidence: 'high',
              falsePositiveRisk: 'low',
              blockingEligible: true,
              suggestedOutcome: 'block',
              humanTitle: 'PR touched a disallowed area',
              humanSummary: `The frozen .aiplan disallowed ${area}, but these files changed: ${relatedFiles.join(', ')}.`,
              ownerAction: 'Block merge until the change is reverted or a human approves a superseding .aiplan.',
              agentExplanation: 'The implementation crossed an explicit scope boundary in the frozen plan.',
              agentActionHint: 'Revert the disallowed area change or stop and request a superseding .aiplan.',
              expected: {
                source: 'aiplan',
                description: `No files in disallowed area ${area} should change.`,
                fields: ['scope.disallowed.areas'],
              },
              actual: {
                description: `Changed files matched disallowed area ${area}: ${relatedFiles.join(', ')}.`,
                evidenceRefs: evidenceRefIdsForFiles(snapshot, relatedFiles),
              },
              evidenceRefs: evidenceRefIdsForFiles(snapshot, relatedFiles),
              relatedAiplanFields: ['scope.disallowed.areas'],
              relatedFiles,
              remediation: {
                type: 'revert_change',
                description: 'Revert files in the disallowed area or create a superseding plan.',
              },
              waiver: { allowed: false, reasonRequired: true },
            },
            createdAt,
          ),
        );
      }

      return findings;
    },
  },
  {
    id: 'scope.disallowed_file_touched',
    version: RULE_VERSION,
    run({ plan, snapshot, createdAt }) {
      const disallowedFiles = (plan?.scope?.disallowed?.files ?? []).filter(Boolean).map(normalizePath);
      if (disallowedFiles.length === 0) return [];

      const changedPaths = snapshot.changedFiles.map((file) => normalizePath(file.path));
      const relatedFiles = changedPaths.filter((filePath) => disallowedFiles.includes(filePath));
      if (relatedFiles.length === 0) return [];

      return [
        makeFinding(
          {
            ruleId: 'scope.disallowed_file_touched',
            severity: 'blocker',
            category: 'scope',
            confidence: 'high',
            falsePositiveRisk: 'low',
            blockingEligible: true,
            suggestedOutcome: 'block',
            humanTitle: 'PR touched a disallowed file',
            humanSummary: `The frozen .aiplan disallowed these files, but they changed: ${relatedFiles.join(', ')}.`,
            ownerAction: 'Block merge until the change is reverted or a human approves a superseding .aiplan.',
            agentExplanation: 'The implementation modified explicit disallowed files in the frozen plan.',
            agentActionHint: 'Revert the disallowed file change or stop and request a superseding .aiplan.',
            expected: {
              source: 'aiplan',
              description: 'Explicit disallowed files should not change.',
              fields: ['scope.disallowed.files'],
            },
            actual: {
              description: `Disallowed files changed: ${relatedFiles.join(', ')}.`,
              evidenceRefs: evidenceRefIdsForFiles(snapshot, relatedFiles),
            },
            evidenceRefs: evidenceRefIdsForFiles(snapshot, relatedFiles),
            relatedAiplanFields: ['scope.disallowed.files'],
            relatedFiles,
            remediation: {
              type: 'revert_change',
              description: 'Revert disallowed file changes or create a superseding plan.',
            },
            waiver: { allowed: false, reasonRequired: true },
          },
          createdAt,
        ),
      ];
    },
  },
];

export function aggregateVerdict(findings: ArcFinding[]): ArcVerdict {
  const openFindings = findings.filter((finding) => finding.status === 'open');
  const blockerCount = openFindings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = openFindings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = openFindings.filter((finding) => finding.severity === 'info').length;

  const hasBlockingFinding = openFindings.some(
    (finding) =>
      finding.blockingEligible &&
      finding.suggestedOutcome === 'block' &&
      finding.confidence === 'high' &&
      finding.falsePositiveRisk === 'low',
  );

  if (hasBlockingFinding) {
    return {
      status: 'blocked',
      reason: 'At least one high-confidence objective blocker is open.',
      blockerCount,
      warningCount,
      infoCount,
    };
  }

  if (openFindings.some((finding) => finding.suggestedOutcome === 'review')) {
    return {
      status: 'needs_review',
      reason: 'At least one finding needs human review, but no objective blocker was found.',
      blockerCount,
      warningCount,
      infoCount,
    };
  }

  if (openFindings.some((finding) => finding.suggestedOutcome === 'note')) {
    return {
      status: 'trusted_with_notes',
      reason: 'Only note-level findings are open.',
      blockerCount,
      warningCount,
      infoCount,
    };
  }

  return {
    status: 'trusted',
    reason: 'No open findings were produced by the dogfood v1 rules.',
    blockerCount,
    warningCount,
    infoCount,
  };
}

function buildTrustBrief(verdict: ArcVerdict, findings: ArcFinding[]): ArcReviewRun['trustBrief'] {
  const openFindings = findings.filter((finding) => finding.status === 'open');
  const highestPriority = [...openFindings].sort((a, b) => outcomeRank(b.suggestedOutcome) - outcomeRank(a.suggestedOutcome));

  return {
    reviewerAction:
      verdict.status === 'blocked'
        ? 'block_before_merge'
        : verdict.status === 'needs_review'
          ? 'needs_deep_review'
          : 'safe_to_skim',
    summary: verdict.reason,
    inspectFirst: highestPriority.flatMap((finding) => finding.relatedFiles).slice(0, 3),
    requiredActions: highestPriority
      .filter((finding) => finding.suggestedOutcome !== 'note')
      .map((finding) => finding.ownerAction)
      .slice(0, 3),
  };
}

function outcomeRank(outcome: ArcSuggestedOutcome): number {
  if (outcome === 'block') return 3;
  if (outcome === 'review') return 2;
  return 1;
}

export function runArcReviewRules(input: RunArcReviewRulesInput): ArcReviewRun {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const engineVersion = input.engineVersion ?? ENGINE_VERSION;
  const ruleErrors: ArcReviewRun['ruleExecution']['ruleErrors'] = [];
  const findings: ArcFinding[] = [];
  const rulesRun: string[] = [];

  for (const rule of rules) {
    try {
      rulesRun.push(rule.id);
      findings.push(...rule.run({ plan: input.plan, snapshot: input.snapshot, createdAt }));
    } catch (error) {
      ruleErrors.push({
        ruleId: rule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const verdict = aggregateVerdict(findings);
  const trustBrief = buildTrustBrief(verdict, findings);
  const reviewId = input.reviewId ?? stableHash({
    planId: input.snapshot.planId,
    headSha: input.snapshot.headSha,
    baseSha: input.snapshot.baseSha,
    evidenceSnapshotId: input.snapshot.evidenceSnapshotId,
  }).slice(0, 16);

  const runWithoutAuditHash = {
    reviewId,
    snapshotId: input.snapshot.evidenceSnapshotId,
    findings: findings.map((finding) => finding.fingerprint),
    verdict: verdict.status,
    rulesRun,
    ruleErrors,
  };

  return {
    schemaVersion: '1.0',
    reviewId,
    status: ruleErrors.length > 0 ? 'failed' : input.snapshot.freshness === 'stale' ? 'stale' : 'completed',
    trigger: input.trigger ?? {
      type: 'manual',
      triggeredBy: 'arc',
      triggeredAt: createdAt,
    },
    subject: input.snapshot.subject,
    contract: {
      planId: input.snapshot.planId,
      planPath: input.snapshot.planPath,
      planStatus: input.snapshot.planStatus,
      contentHash: input.snapshot.planHash,
      frozenAt: planFrozenAt(input.plan),
      frozenBy: planFrozenBy(input.plan),
    },
    inputSnapshot: {
      diffHash: input.snapshot.diffHash,
      changedFilesHash: stableHash(input.snapshot.changedFiles),
      evidenceSnapshotId: input.snapshot.evidenceSnapshotId,
      collectedAt: input.snapshot.collectedAt,
      freshness: input.snapshot.freshness,
      staleReason: input.snapshot.staleReason,
    },
    evidence: {
      refs: input.snapshot.refs,
      missingRequiredEvidence: input.snapshot.missingRequiredEvidence,
    },
    ruleExecution: {
      engineVersion,
      rulesRun,
      rulesSkipped: [],
      ruleErrors,
    },
    findings,
    verdict,
    trustBrief,
    publication: {},
    audit: {
      createdAt,
      completedAt: createdAt,
      runHash: stableHash(runWithoutAuditHash),
    },
  };
}
