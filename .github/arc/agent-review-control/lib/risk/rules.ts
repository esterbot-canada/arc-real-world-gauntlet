import type { AgentReviewContract, ContractType } from '../contracts/schema.ts';
import { isActiveReviewStatus } from '../review/status.ts';
import type {
  RelatedRiskContract,
  RelatedRunEvidence,
  RiskConfidence,
  RiskEvaluation,
  RiskInput,
  RiskLabel,
  RiskReason,
  RiskReasonCategory,
  RiskReasonCode,
  RiskReasonEvidence,
  RiskReasonGroup,
  RiskSeverity,
  ReviewPriority,
  SuggestedReviewAction,
} from './types.ts';

const DEFAULT_LARGE_CHANGE_SET_THRESHOLD = 5;
const DEFAULT_SENSITIVE_SYSTEMS = new Set([
  'auth',
  'billing',
  'config',
  'database',
  'db',
  'deploy',
  'deployment',
  'external-api',
  'migration',
  'payments',
  'production',
  'security',
]);

const REASON_CATEGORY_LABELS: Record<RiskReasonCategory, string> = {
  blocking_uncertainty: 'Blocking uncertainty',
  missing_evidence: 'Missing evidence',
  product_overlap: 'Product overlap',
  runtime_security: 'Runtime/security sensitivity',
  contract_quality: 'Contract quality',
  positive_evidence: 'Positive evidence',
};

const RISK_REASON_CATEGORIES: Record<RiskReasonCode, RiskReasonCategory> = {
  'same-file-overlap': 'product_overlap',
  'shared-boundary': 'product_overlap',
  'missing-tests': 'missing_evidence',
  'runtime-sensitive-change': 'runtime_security',
  'env-secret-change': 'runtime_security',
  'config-change': 'runtime_security',
  'deployment-change': 'runtime_security',
  'migration-change': 'runtime_security',
  'external-effect': 'runtime_security',
  'explicit-high-risk': 'runtime_security',
  'missing-rollback-note': 'contract_quality',
  'incomplete-sensitive-contract': 'contract_quality',
  'missing-files': 'contract_quality',
  'missing-systems': 'contract_quality',
  'open-questions-unresolved': 'blocking_uncertainty',
  'shared-system': 'product_overlap',
  'assumptions-present': 'blocking_uncertainty',
  'large-change-set': 'product_overlap',
  'unclear-rationale': 'contract_quality',
  'isolated-files': 'positive_evidence',
  'tests-present': 'positive_evidence',
  'clear-rationale': 'positive_evidence',
  'rollback-note-present': 'positive_evidence',
  'no-overlap': 'positive_evidence',
};

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

type BoundarySpecificity = 'broad' | 'specific';

type BoundaryOverlap = {
  boundary: string;
  specificity: BoundarySpecificity;
};

function list(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => item.trim().length > 0) : [];
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isEvidenceArtifactPath(filePath: string): boolean {
  const normalized = normalize(filePath).replaceAll('\\', '/');

  return (
    /(^|\/)tmp\/arc-contract-[^/]+\.md$/.test(normalized) ||
    normalized === 'docs/journal/arc-dogfood-log.md' ||
    normalized === 'progress.md' ||
    normalized === 'findings.md' ||
    normalized === 'task_plan.md' ||
    /^memory\/[^/]+\.md$/.test(normalized)
  );
}

function productFiles(files: string[]): string[] {
  return files.filter((file) => !isEvidenceArtifactPath(file));
}

function activeRelatedContracts(relatedContracts: RelatedRiskContract[]): RelatedRiskContract[] {
  return relatedContracts.filter((related) => related.reviewStatus === undefined || isActiveReviewStatus(related.reviewStatus));
}

function relatedRunLabel(related: RelatedRiskContract): string {
  return related.runId?.trim() || related.contract.agent?.run_id?.trim() || 'unknown-run';
}

function agentNameFor(contract: AgentReviewContract): string | undefined {
  return contract.agent?.name?.trim() || contract.agent?.id?.trim() || undefined;
}

function boundaryFor(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').trim();
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 1) return normalized;

  const fileName = parts.at(-1) ?? '';
  if (fileName.includes('.')) return parts.slice(0, -1).join('/');

  return parts.join('/');
}

function boundarySegmentsFor(filePath: string): string[] {
  const parts = normalize(filePath).replaceAll('\\', '/').split('/').filter(Boolean);
  const fileName = parts.at(-1) ?? '';

  if (fileName.includes('.')) return parts.slice(0, -1);

  return parts;
}

function sharedBoundaryFor(leftFilePath: string, rightFilePath: string): string {
  const left = boundarySegmentsFor(leftFilePath);
  const right = boundarySegmentsFor(rightFilePath);
  const shared: string[] = [];

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) break;
    shared.push(left[index]);
  }

  if (shared.length < 2) return '';

  return shared.join('/');
}

function boundarySpecificity(boundary: string): BoundarySpecificity {
  const parts = normalize(boundary).replaceAll('\\', '/').split('/').filter(Boolean);

  if ((parts[0] === 'apps' || parts[0] === 'packages') && parts.length <= 2) return 'broad';

  return 'specific';
}

function sharedBoundaryOverlaps(currentFiles: string[], otherFiles: string[]): BoundaryOverlap[] {
  const overlaps = new Map<string, BoundaryOverlap>();

  for (const currentFile of currentFiles) {
    for (const otherFile of otherFiles) {
      if (normalize(currentFile).replaceAll('\\', '/') === normalize(otherFile).replaceAll('\\', '/')) continue;

      const boundary = sharedBoundaryFor(currentFile, otherFile);
      if (!boundary) continue;

      overlaps.set(boundary, {
        boundary,
        specificity: boundarySpecificity(boundary),
      });
    }
  }

  return [...overlaps.values()];
}

function reasonCategory(code: RiskReasonCode): RiskReasonCategory {
  return RISK_REASON_CATEGORIES[code];
}

function reasonIsBlocking(code: RiskReasonCode, severity: RiskSeverity): boolean {
  return code === 'open-questions-unresolved' || code === 'missing-files' || code === 'incomplete-sensitive-contract' || (code === 'missing-rollback-note' && severity === 'high');
}

function riskReason(code: RiskReasonCode, severity: RiskSeverity, message: string, evidence?: RiskReasonEvidence): RiskReason {
  return {
    code,
    severity,
    category: reasonCategory(code),
    message,
    blocking: reasonIsBlocking(code, severity),
    weight: SEVERITY_WEIGHT[severity],
    ...(evidence ? { evidence } : {}),
  };
}

function addReason(reasons: RiskReason[], code: RiskReasonCode, severity: RiskSeverity, message: string, evidence?: RiskReasonEvidence): void {
  if (!reasons.some((reason) => reason.code === code && reason.message === message)) {
    reasons.push(riskReason(code, severity, message, evidence));
  }
}

function relatedFiles(relatedContracts: RelatedRiskContract[]): string[] {
  return relatedContracts.flatMap((related) => productFiles(list(related.contract.files_touched)));
}

function relatedSystems(relatedContracts: RelatedRiskContract[]): string[] {
  return relatedContracts.flatMap((related) => list(related.contract.systems_touched));
}

function sharedSystemEvidence(currentSystems: string[], relatedContracts: RelatedRiskContract[]): RelatedRunEvidence[] {
  return relatedContracts
    .map((related) => ({
      runId: relatedRunLabel(related),
      taskTitle: related.contract.task_title,
      agentName: agentNameFor(related.contract),
      systems: hasOverlap(currentSystems, list(related.contract.systems_touched)),
    }))
    .filter((entry) => (entry.systems ?? []).length > 0);
}

function hasOverlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize));
  return unique(left.filter((item) => rightSet.has(normalize(item))));
}

function sameFileOverlapEvidence(currentFiles: string[], relatedContracts: RelatedRiskContract[]): RelatedRunEvidence[] {
  return relatedContracts
    .map((related) => ({
      runId: relatedRunLabel(related),
      taskTitle: related.contract.task_title,
      agentName: agentNameFor(related.contract),
      files: hasOverlap(currentFiles, productFiles(list(related.contract.files_touched))),
    }))
    .filter((entry) => (entry.files ?? []).length > 0);
}

function sharedBoundaryOverlapEvidence(
  currentFiles: string[],
  relatedContracts: RelatedRiskContract[],
  specificity: BoundarySpecificity
): RelatedRunEvidence[] {
  return relatedContracts
    .map((related) => {
      const relatedProductFiles = productFiles(list(related.contract.files_touched));
      const boundaries = sharedBoundaryOverlaps(currentFiles, relatedProductFiles)
        .filter((overlap) => overlap.specificity === specificity)
        .map((overlap) => overlap.boundary);

      return {
        runId: relatedRunLabel(related),
        taskTitle: related.contract.task_title,
        agentName: agentNameFor(related.contract),
        files: relatedProductFiles,
        boundaries,
      };
    })
    .filter((entry) => (entry.boundaries ?? []).length > 0);
}

function isEnvSecretPath(filePath: string): boolean {
  return /(^|\/)\.env(\.|$)/.test(normalize(filePath).replaceAll('\\', '/'));
}

function isDeploymentSignal(contract: AgentReviewContract, systems: string[], files: string[]): boolean {
  return (
    contract.contract_type === 'deployment' ||
    contract.contract_type === 'ops_fix' ||
    systems.some((system) => ['deploy', 'deployment', 'production', 'ops', 'operations'].includes(system)) ||
    files.some((file) => /(^|\/)(deploy|deployment|ops)(\/|\.|-|$)/.test(file))
  );
}

function hasRuntimeSensitiveFile(files: string[]): boolean {
  return files.some((file) =>
    file.includes('config') ||
    file.includes('migration') ||
    file.includes('/auth/') ||
    file.includes('/security/') ||
    isEnvSecretPath(file)
  );
}

function contractHasRiskyChange(contract: AgentReviewContract, sensitiveSystems: Set<string>): boolean {
  const systems = list(contract.systems_touched).map(normalize);
  const files = productFiles(list(contract.files_touched)).map(normalize);

  return (
    hasText(contract.breaking_change_risk) ||
    hasText(contract.migration_changes) ||
    hasText(contract.config_changes) ||
    hasText(contract.external_effects) ||
    contract.risk_level === 'high' ||
    contract.risk_level === 'critical' ||
    isDeploymentSignal(contract, systems, files) ||
    systems.some((system) => sensitiveSystems.has(system)) ||
    hasRuntimeSensitiveFile(files)
  );
}

function rationaleIsClear(contract: AgentReviewContract): boolean {
  const summary = contract.summary?.trim() ?? '';
  if (summary.length < 20) return false;

  const vagueOnly = /^(stuff|misc|changes|updates?|fixes?|work|done|wip)$/i;
  return !vagueOnly.test(summary);
}

function confidenceFor(input: RiskInput, highReasons: RiskReason[], mediumReasons: RiskReason[]): RiskConfidence {
  const validation = input.validation;
  const missingFields = validation?.missingFields ?? [];
  const invalidFields = validation?.invalidFields ?? [];
  const tests = list(input.contract.tests_run);

  if (validation?.isComplete === false || invalidFields.length > 0 || missingFields.length >= 3) {
    return 'Low confidence';
  }

  if (missingFields.length > 0 || tests.length === 0 || highReasons.some((reason) => reason.code === 'missing-tests')) {
    return 'Medium confidence';
  }

  if (highReasons.length === 0 && mediumReasons.length === 0) {
    return 'High confidence';
  }

  return 'Medium confidence';
}

function labelForSeverity(severity: RiskSeverity): RiskLabel {
  if (severity === 'high') return 'High-priority review';
  if (severity === 'medium') return 'Review signals detected';
  return 'No obvious risk detected';
}

function missingTestsSeverity(contractType: ContractType | undefined, riskyChange: boolean): RiskSeverity {
  if (contractType === 'sample') return 'low';
  if (contractType === 'planning') return riskyChange ? 'medium' : 'low';
  if (contractType === 'qa_review') return 'medium';
  return 'high';
}

function maxSeverity(highReasons: RiskReason[], mediumReasons: RiskReason[]): RiskSeverity {
  if (highReasons.length > 0) return 'high';
  if (mediumReasons.length > 0) return 'medium';
  return 'low';
}

function highestSeverity(reasons: RiskReason[]): RiskSeverity {
  if (reasons.some((reason) => reason.severity === 'high')) return 'high';
  if (reasons.some((reason) => reason.severity === 'medium')) return 'medium';
  return 'low';
}

function groupReasons(reasons: RiskReason[]): RiskReasonGroup[] {
  const groups: RiskReasonGroup[] = [];
  for (const category of Object.keys(REASON_CATEGORY_LABELS) as RiskReasonCategory[]) {
    const categoryReasons = reasons.filter((reason) => reason.category === category);
    if (categoryReasons.length === 0) continue;

    groups.push({
      category,
      label: REASON_CATEGORY_LABELS[category],
      reasons: categoryReasons,
      blocking: categoryReasons.some((reason) => reason.blocking === true),
      highestSeverity: highestSeverity(categoryReasons),
    });
  }

  return groups;
}

function hasReason(reasons: RiskReason[], code: RiskReasonCode): boolean {
  return reasons.some((reason) => reason.code === code);
}

function reviewPriorityFor(severity: RiskSeverity, reasons: RiskReason[], riskyChange: boolean): ReviewPriority {
  if (reasons.some((reason) => reason.blocking === true)) return 'blocked';
  if (severity === 'high') return 'high';
  if (riskyChange || reasons.some((reason) => reason.severity === 'medium')) return 'medium';
  return 'low';
}

function suggestedActionFor(contract: AgentReviewContract, severity: RiskSeverity, reviewPriority: ReviewPriority, reasons: RiskReason[], riskyChange: boolean): SuggestedReviewAction {
  if (contract.contract_type === 'sample') return 'archive';

  if (hasReason(reasons, 'missing-files') || hasReason(reasons, 'incomplete-sensitive-contract') || hasReason(reasons, 'missing-rollback-note')) {
    return 'request_changes';
  }

  const missingTests = reasons.find((reason) => reason.code === 'missing-tests');
  if (missingTests && missingTests.severity !== 'low') return 'request_changes';

  if (reviewPriority === 'blocked') return 'keep_active';
  if (riskyChange || severity === 'high') return 'keep_active';
  if (severity === 'low' && reviewPriority === 'low') return 'approve';

  return 'keep_active';
}

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  const contract = input.contract;
  const relatedContracts = activeRelatedContracts(input.relatedContracts ?? []);
  const largeChangeSetThreshold = input.largeChangeSetThreshold ?? DEFAULT_LARGE_CHANGE_SET_THRESHOLD;
  const sensitiveSystems = new Set([
    ...DEFAULT_SENSITIVE_SYSTEMS,
    ...(input.sensitiveSystems ?? []).map(normalize),
  ]);

  const currentFiles = list(contract.files_touched);
  const currentProductFiles = productFiles(currentFiles);
  const currentSystems = list(contract.systems_touched);
  const otherFiles = relatedFiles(relatedContracts);
  const otherSystems = relatedSystems(relatedContracts);
  const reasons: RiskReason[] = [];

  if (currentFiles.length === 0) {
    addReason(reasons, 'missing-files', 'high', 'Contract lists no touched files, so overlap and review scope cannot be trusted.');
  }

  if (currentSystems.length === 0) {
    addReason(reasons, 'missing-systems', 'medium', 'Contract lists no touched systems, so product-flow impact may be hidden.');
  }

  const sameFileRuns = sameFileOverlapEvidence(currentProductFiles, relatedContracts);
  const sameFiles = unique(sameFileRuns.flatMap((run) => run.files ?? []));
  if (sameFileRuns.length > 0) {
    addReason(
      reasons,
      'same-file-overlap',
      'high',
      `Same-file overlap with ${sameFileRuns.length} active run${sameFileRuns.length === 1 ? '' : 's'}: ${sameFileRuns.map((run) => run.runId).join(', ')}.`,
      { relatedRuns: sameFileRuns }
    );
  }

  const currentBoundaries = unique(currentProductFiles.map(boundaryFor).filter(Boolean));
  const boundaryOverlaps = sharedBoundaryOverlaps(currentProductFiles, otherFiles);
  const specificBoundaryOverlaps = boundaryOverlaps.filter((overlap) => overlap.specificity === 'specific');
  const broadBoundaryOverlaps = boundaryOverlaps.filter((overlap) => overlap.specificity === 'broad');

  if (specificBoundaryOverlaps.length > 0) {
    const boundaryRuns = sharedBoundaryOverlapEvidence(currentProductFiles, relatedContracts, 'specific');
    addReason(
      reasons,
      'shared-boundary',
      'high',
      `Shared file-boundary overlap with ${boundaryRuns.length} active run${boundaryRuns.length === 1 ? '' : 's'}: ${boundaryRuns.map((run) => run.runId).join(', ')}.`,
      { relatedRuns: boundaryRuns }
    );
  } else if (broadBoundaryOverlaps.length > 0) {
    const boundaryRuns = sharedBoundaryOverlapEvidence(currentProductFiles, relatedContracts, 'broad');
    addReason(
      reasons,
      'shared-boundary',
      'medium',
      `Shared file-boundary overlap with ${boundaryRuns.length} active run${boundaryRuns.length === 1 ? '' : 's'}: ${boundaryRuns.map((run) => run.runId).join(', ')}.`,
      { relatedRuns: boundaryRuns }
    );
  }

  const tests = list(contract.tests_run);
  const riskyChange = contractHasRiskyChange(contract, sensitiveSystems);
  const normalizedSystems = currentSystems.map(normalize);
  const normalizedProductFiles = currentProductFiles.map((file) => normalize(file).replaceAll('\\', '/'));
  const runtimeReasonCountBefore = reasons.length;

  const envFiles = currentProductFiles.filter(isEnvSecretPath);
  if (envFiles.length > 0) {
    addReason(reasons, 'env-secret-change', 'high', `.env or secret-bearing environment file changed: ${envFiles.join(', ')}.`);
  }

  if (hasText(contract.config_changes)) {
    addReason(reasons, 'config-change', 'high', `Runtime configuration changed: ${contract.config_changes.trim()}`);
  }

  if (isDeploymentSignal(contract, normalizedSystems, normalizedProductFiles)) {
    addReason(reasons, 'deployment-change', 'high', 'Deployment or operations path changed; verify rollout order, service impact, and rollback readiness.');
  }

  if (hasText(contract.migration_changes)) {
    addReason(
      reasons,
      'migration-change',
      'high',
      'Persistent data shape changed. Review old database compatibility, new record writes, and rollback safety.',
      {
        plainEnglish: 'Persistent data shape changed. Review old database compatibility, new record writes, and rollback safety.',
        technicalDetail: contract.migration_changes.trim(),
      }
    );
  }

  if (hasText(contract.external_effects)) {
    addReason(reasons, 'external-effect', 'high', `External side effect declared: ${contract.external_effects.trim()}`);
  }

  const emittedSpecificRuntimeReason = reasons.length > runtimeReasonCountBefore;
  const explicitlyHighRisk = contract.risk_level === 'high' || contract.risk_level === 'critical';
  if (explicitlyHighRisk && !emittedSpecificRuntimeReason) {
    addReason(reasons, 'explicit-high-risk', 'high', `Contract declares ${contract.risk_level} risk without a more specific runtime/security cause.`);
  } else if (riskyChange && !emittedSpecificRuntimeReason) {
    addReason(reasons, 'runtime-sensitive-change', 'high', 'Runtime, security, config, deployment, migration, external-effect, or other sensitive change detected.');
  }

  if (tests.length === 0) {
    addReason(reasons, 'missing-tests', missingTestsSeverity(contract.contract_type, riskyChange), 'No test evidence was provided for this run.');
  }
  if (riskyChange && !hasText(contract.rollback_note)) {
    addReason(reasons, 'missing-rollback-note', 'high', 'Risky changes need a rollback note before approval.');
  }

  if (riskyChange && input.validation?.isComplete === false) {
    const missing = input.validation.missingFields?.join(', ') || 'unknown fields';
    addReason(
      reasons,
      'incomplete-sensitive-contract',
      'high',
      `Sensitive run has an incomplete contract; missing: ${missing}.`
    );
  }

  const sharedSystems = hasOverlap(currentSystems, otherSystems);
  if (sharedSystems.length > 0) {
    const systemRuns = sharedSystemEvidence(currentSystems, relatedContracts);
    const runIds = systemRuns.map((run) => run.runId).join(', ');
    addReason(
      reasons,
      'shared-system',
      'medium',
      `Shared system overlap with ${systemRuns.length} active run${systemRuns.length === 1 ? '' : 's'}: ${runIds}. Systems: ${sharedSystems.join(', ')}.`,
      { relatedRuns: systemRuns }
    );
  }

  const openQuestions = list(contract.open_questions);
  if (openQuestions.length > 0) {
    addReason(reasons, 'open-questions-unresolved', 'high', `Contract has unresolved open questions: ${openQuestions.join('; ')}.`);
  }

  const assumptions = list(contract.assumptions);
  const assumptionNeedsReview = riskyChange || contract.contract_type === 'deployment' || contract.contract_type === 'ops_fix';
  if (assumptions.length > 0 && assumptionNeedsReview) {
    addReason(reasons, 'assumptions-present', 'medium', `Run includes assumptions that should be reviewed: ${assumptions.join('; ')}.`);
  }

  if (currentProductFiles.length > largeChangeSetThreshold) {
    addReason(
      reasons,
      'large-change-set',
      'medium',
      `Change set touches ${currentProductFiles.length} product files, above the ${largeChangeSetThreshold}-file review threshold.`
    );
  }

  if (!rationaleIsClear(contract)) {
    addReason(reasons, 'unclear-rationale', 'medium', 'Summary/rationale is missing, too short, or too vague for confident review.');
  }

  if (input.validation?.isComplete === false && !riskyChange) {
    const missing = input.validation.missingFields?.join(', ') || 'unknown fields';
    addReason(reasons, 'incomplete-sensitive-contract', 'medium', `Contract is incomplete; missing: ${missing}.`);
  }

  const highReasons = reasons.filter((reason) => reason.severity === 'high');
  const mediumReasons = reasons.filter((reason) => reason.severity === 'medium');

  if (highReasons.length === 0 && mediumReasons.length === 0) {
    if (currentProductFiles.length > 0 && currentBoundaries.length === currentProductFiles.length && sameFiles.length === 0) {
      addReason(reasons, 'isolated-files', 'low', 'Files appear isolated from other active runs.');
    }

    if (tests.length > 0) {
      addReason(reasons, 'tests-present', 'low', `Test evidence provided: ${tests.join('; ')}.`);
    }

    if (rationaleIsClear(contract)) {
      addReason(reasons, 'clear-rationale', 'low', 'Summary gives a clear rationale for the change.');
    }

    if (hasText(contract.rollback_note)) {
      addReason(reasons, 'rollback-note-present', 'low', 'Rollback note is present.');
    }

    if (sameFiles.length === 0 && boundaryOverlaps.length === 0 && sharedSystems.length === 0) {
      addReason(reasons, 'no-overlap', 'low', 'No same-file, shared-boundary, or shared-system overlap detected.');
    }
  }

  const finalHighReasons = reasons.filter((reason) => reason.severity === 'high');
  const finalMediumReasons = reasons.filter((reason) => reason.severity === 'medium');
  const lowReasons = reasons.filter((reason) => reason.severity === 'low');
  const severity = maxSeverity(finalHighReasons, finalMediumReasons);
  const reviewPriority = reviewPriorityFor(severity, reasons, riskyChange);

  return {
    label: labelForSeverity(severity),
    severity,
    reviewPriority,
    suggestedAction: suggestedActionFor(contract, severity, reviewPriority, reasons, riskyChange),
    confidence: confidenceFor(input, finalHighReasons, finalMediumReasons),
    reasons,
    highReasons: finalHighReasons,
    mediumReasons: finalMediumReasons,
    lowReasons,
    reasonGroups: groupReasons(reasons),
    source: 'deterministic-rules',
  };
}
