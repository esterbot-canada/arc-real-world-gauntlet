import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRisk } from '../../lib/risk/rules.ts';
import type { RiskInput } from '../../lib/risk/types.ts';

const baselineContract = {
  task_title: 'Add parser validation',
  status: 'DONE' as const,
  summary: 'Adds deterministic validation for contract parsing with clear reviewer-facing output.',
  files_touched: ['apps/agent-review-control/lib/contracts/parser.ts'],
  systems_touched: ['contract-ingest'],
  tests_run: ['node --test apps/agent-review-control/tests/contracts/parser.test.ts'],
  risk_level: 'medium' as const,
  open_questions: [],
  rollback_note: 'Revert the parser change if contract ingest regresses.',
};

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    contract: baselineContract,
    validation: {
      isComplete: true,
      missingFields: [],
      invalidFields: [],
    },
    relatedContracts: [],
    ...overrides,
  };
}

test('flags same-file overlap as high risk with a concrete reason', () => {
  const result = evaluateRisk(input({
    relatedContracts: [
      {
        runId: 'agent-b',
        contract: {
          ...baselineContract,
          task_title: 'Refactor parser extraction',
          files_touched: ['apps/agent-review-control/lib/contracts/parser.ts'],
        },
      },
    ],
  }));

  assert.equal(result.label, 'High-priority review');
  const reason = result.reasons.find((candidate) => candidate.code === 'same-file-overlap');
  assert.equal(reason?.severity, 'high');
  assert.ok(result.reasonGroups.some((group) => group.category === 'product_overlap'));
  assert.match(reason?.message ?? '', /agent-b/);
  assert.doesNotMatch(reason?.message ?? '', /another run/i);
  assert.deepEqual(reason?.evidence?.relatedRuns?.[0]?.files, ['apps/agent-review-control/lib/contracts/parser.ts']);
  assert.equal(reason?.evidence?.relatedRuns?.[0]?.runId, 'agent-b');
  assert.equal(reason?.evidence?.relatedRuns?.[0]?.taskTitle, 'Refactor parser extraction');
});

test('flags specific shared file-boundary overlap as high risk even without exact same files', () => {
  const result = evaluateRisk(input({
    relatedContracts: [
      {
        runId: 'agent-b',
        contract: {
          ...baselineContract,
          task_title: 'Update contract schema',
          files_touched: ['apps/agent-review-control/lib/contracts/schema.ts'],
        },
      },
    ],
  }));

  assert.equal(result.label, 'High-priority review');
  const reason = result.reasons.find((candidate) => candidate.code === 'shared-boundary');
  assert.equal(reason?.severity, 'high');
  assert.match(reason?.message ?? '', /agent-b/);
  assert.doesNotMatch(reason?.message ?? '', /multiple runs/i);
  assert.equal(reason?.evidence?.relatedRuns?.[0]?.runId, 'agent-b');
  assert.deepEqual(reason?.evidence?.relatedRuns?.[0]?.boundaries, ['apps/agent-review-control/lib/contracts']);
});

test('keeps narrow feature-boundary overlap high risk', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      task_title: 'Tune risk rules',
      files_touched: ['apps/agent-review-control/lib/risk/rules.ts'],
      systems_touched: ['risk-rules'],
    },
    relatedContracts: [
      {
        runId: 'agent-b',
        contract: {
          ...baselineContract,
          task_title: 'Update risk types',
          files_touched: ['apps/agent-review-control/lib/risk/types.ts'],
          systems_touched: ['risk-rules'],
        },
      },
    ],
  }));

  const reason = result.reasons.find((candidate) => candidate.code === 'shared-boundary');
  assert.equal(result.label, 'High-priority review');
  assert.equal(reason?.severity, 'high');
  assert.match(reason?.message ?? '', /agent-b/);
  assert.deepEqual(reason?.evidence?.relatedRuns?.[0]?.boundaries, ['apps/agent-review-control/lib/risk']);
});

test('keeps broad app-root shared-boundary overlap medium when files do not exactly overlap', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      task_title: 'Polish ARC page',
      files_touched: ['apps/agent-review-control/app/page.tsx'],
      systems_touched: ['arc-ui'],
    },
    relatedContracts: [
      {
        runId: 'agent-b',
        contract: {
          ...baselineContract,
          task_title: 'Tune risk rules',
          files_touched: ['apps/agent-review-control/lib/risk/rules.ts'],
          systems_touched: ['risk-rules'],
        },
      },
    ],
  }));

  const reason = result.reasons.find((candidate) => candidate.code === 'shared-boundary');
  assert.equal(result.label, 'Review signals detected');
  assert.equal(reason?.severity, 'medium');
  assert.match(reason?.message ?? '', /agent-b/);
  assert.deepEqual(reason?.evidence?.relatedRuns?.[0]?.boundaries, ['apps/agent-review-control']);
  assert.ok(!result.reasons.some((candidate) => candidate.code === 'same-file-overlap'));
});

test('ignores closed related contracts for active overlap scoring', () => {
  const result = evaluateRisk(input({
    relatedContracts: [
      {
        runId: 'agent-b',
        reviewStatus: 'Archived',
        contract: {
          ...baselineContract,
          task_title: 'Archived parser change',
          files_touched: ['apps/agent-review-control/lib/contracts/parser.ts'],
          systems_touched: ['contract-ingest'],
        },
      },
    ],
  }));

  assert.equal(result.label, 'No obvious risk detected');
  assert.ok(!result.reasons.some((reason) => reason.code === 'same-file-overlap'));
  assert.ok(!result.reasons.some((reason) => reason.code === 'shared-system'));
});

test('ignores ARC evidence artifacts for product overlap scoring', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: [
        'apps/agent-review-control/tmp/arc-contract-current.md',
        'apps/agent-review-control/app/page.tsx',
      ],
    },
    relatedContracts: [
      {
        runId: 'agent-b',
        reviewStatus: 'Needs Review',
        contract: {
          ...baselineContract,
          task_title: 'Another dogfood contract',
          files_touched: ['apps/agent-review-control/tmp/arc-contract-other.md'],
          systems_touched: ['arc-dogfood-contracts'],
        },
      },
    ],
  }));

  assert.equal(result.label, 'No obvious risk detected');
  assert.ok(!result.reasons.some((reason) => reason.code === 'shared-boundary'));
});

test('flags missing tests as high risk and lowers confidence when evidence is incomplete', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      tests_run: [],
    },
  }));

  assert.equal(result.label, 'High-priority review');
  assert.ok(result.reasons.some((reason) => reason.code === 'missing-tests'));
  assert.equal(result.confidence, 'Medium confidence');
});

test('does not make planning contracts high-priority solely because tests are absent', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      contract_type: 'planning',
      tests_run: [],
    },
  }));

  assert.equal(result.label, 'No obvious risk detected');
  assert.equal(result.reasons.find((reason) => reason.code === 'missing-tests')?.severity, 'low');
});

test('keeps deployment contracts high-priority when tests are absent', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      contract_type: 'deployment',
      tests_run: [],
    },
  }));

  assert.equal(result.label, 'High-priority review');
  assert.equal(result.reasons.find((reason) => reason.code === 'missing-tests')?.severity, 'high');
});

test('flags missing or unclear rationale as medium risk', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      summary: 'stuff',
    },
  }));

  assert.equal(result.label, 'Review signals detected');
  assert.ok(result.reasons.some((reason) => reason.code === 'unclear-rationale'));
});

test('flags missing rollback notes for risky changes as high risk', () => {
  const { rollback_note: _rollbackNote, ...contractWithoutRollback } = baselineContract;
  const result = evaluateRisk(input({
    contract: {
      ...contractWithoutRollback,
      files_touched: ['apps/agent-review-control/next.config.js'],
      systems_touched: ['config'],
      config_changes: 'Changed runtime configuration defaults.',
    },
  }));

  assert.equal(result.label, 'High-priority review');
  assert.ok(result.reasons.some((reason) => reason.code === 'missing-rollback-note'));
});

test('reports low-risk support signals without certifying safety', () => {
  const result = evaluateRisk(input());

  assert.equal(result.label, 'No obvious risk detected');
  assert.equal(result.reviewPriority, 'low');
  assert.equal(result.suggestedAction, 'approve');
  assert.equal(result.confidence, 'High confidence');
  assert.ok(result.reasons.some((reason) => reason.code === 'isolated-files'));
  assert.ok(result.reasons.some((reason) => reason.code === 'tests-present'));
  assert.ok(result.reasons.some((reason) => reason.code === 'clear-rationale'));
  assert.ok(result.reasons.some((reason) => reason.code === 'rollback-note-present'));
  assert.ok(result.reasons.some((reason) => reason.code === 'no-overlap'));
});

test('flags missing files as high-priority because contract scope cannot be trusted', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: [],
    },
  }));

  assert.equal(result.label, 'High-priority review');
  assert.equal(result.reviewPriority, 'blocked');
  assert.equal(result.suggestedAction, 'request_changes');
  assert.ok(result.reasons.some((reason) => reason.code === 'missing-files'));
});

test('flags missing systems and unresolved questions as contract quality problems', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      systems_touched: [],
      open_questions: ['Confirm whether this changes onboarding behavior.'],
    },
  }));

  assert.equal(result.label, 'High-priority review');
  assert.equal(result.reviewPriority, 'blocked');
  assert.equal(result.suggestedAction, 'keep_active');
  assert.ok(result.reasons.some((reason) => reason.code === 'missing-systems'));
  assert.ok(result.reasons.some((reason) => reason.code === 'open-questions-unresolved'));
  assert.ok(result.reasonGroups.some((group) => group.category === 'blocking_uncertainty' && group.blocking));
});

test('separates runtime technical risk from blocked review priority when evidence is complete', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      contract_type: 'deployment',
      files_touched: ['apps/agent-review-control/next.config.js'],
      systems_touched: ['config', 'deployment'],
      config_changes: 'Changed runtime configuration defaults.',
      external_effects: 'Restarted the public ARC service.',
      tests_run: ['npm test', 'npm run build', 'npm run smoke'],
      rollback_note: 'Revert next.config.js and restart the service.',
      open_questions: [],
    },
  }));

  assert.equal(result.severity, 'high');
  assert.equal(result.reviewPriority, 'high');
  assert.equal(result.suggestedAction, 'keep_active');
});

test('emits env-secret-change for .env paths without duplicating the generic runtime reason', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: ['apps/web/.env.production'],
      systems_touched: ['runtime-config'],
      tests_run: ['npm test'],
      rollback_note: 'Restore the previous environment variable values.',
    },
  }));

  const reason = result.reasons.find((candidate) => candidate.code === 'env-secret-change');
  assert.equal(reason?.severity, 'high');
  assert.equal(reason?.category, 'runtime_security');
  assert.match(reason?.message ?? '', /\.env\.production/);
  assert.ok(!result.reasons.some((candidate) => candidate.code === 'runtime-sensitive-change'));
});

test('emits config-change for config_changes without duplicating the generic runtime reason', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: ['apps/agent-review-control/next.config.js'],
      systems_touched: ['config'],
      config_changes: 'Changed runtime configuration defaults.',
      tests_run: ['npm test'],
      rollback_note: 'Revert next.config.js.',
    },
  }));

  assert.equal(result.reasons.find((reason) => reason.code === 'config-change')?.severity, 'high');
  assert.equal(result.reasons.find((reason) => reason.code === 'config-change')?.category, 'runtime_security');
  assert.ok(!result.reasons.some((reason) => reason.code === 'runtime-sensitive-change'));
});

test('emits deployment-change for deployment and ops signals without duplicating the generic runtime reason', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      contract_type: 'ops_fix',
      files_touched: ['ops/deploy/service.yaml'],
      systems_touched: ['deployment'],
      tests_run: ['npm test'],
      rollback_note: 'Rollback the deployment manifest.',
    },
  }));

  assert.equal(result.reasons.find((reason) => reason.code === 'deployment-change')?.severity, 'high');
  assert.equal(result.reasons.find((reason) => reason.code === 'deployment-change')?.category, 'runtime_security');
  assert.ok(!result.reasons.some((reason) => reason.code === 'runtime-sensitive-change'));
});

test('emits migration-change for migration_changes without duplicating the generic runtime reason', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: ['supabase/migrations/202605080001_add_table.sql'],
      systems_touched: ['database'],
      migration_changes: 'Adds a production schema migration.',
      tests_run: ['npm test'],
      rollback_note: 'Apply the down migration.',
    },
  }));

  assert.equal(result.reasons.find((reason) => reason.code === 'migration-change')?.severity, 'high');
  assert.equal(result.reasons.find((reason) => reason.code === 'migration-change')?.category, 'runtime_security');
  assert.ok(!result.reasons.some((reason) => reason.code === 'runtime-sensitive-change'));
});

test('emits external-effect for external_effects without duplicating the generic runtime reason', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      files_touched: ['apps/agent-review-control/scripts/restart-service.ts'],
      systems_touched: ['service-ops'],
      external_effects: 'Restarted the public ARC service.',
      tests_run: ['npm test'],
      rollback_note: 'Restart the service with the previous release.',
    },
  }));

  assert.equal(result.reasons.find((reason) => reason.code === 'external-effect')?.severity, 'high');
  assert.equal(result.reasons.find((reason) => reason.code === 'external-effect')?.category, 'runtime_security');
  assert.ok(!result.reasons.some((reason) => reason.code === 'runtime-sensitive-change'));
});

test('emits explicit-high-risk for high risk_level without a more specific runtime cause', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      risk_level: 'critical',
      files_touched: ['apps/agent-review-control/lib/contracts/parser.ts'],
      systems_touched: ['contract-ingest'],
      tests_run: ['npm test'],
      rollback_note: 'Revert parser changes.',
    },
  }));

  assert.equal(result.reasons.find((reason) => reason.code === 'explicit-high-risk')?.severity, 'high');
  assert.equal(result.reasons.find((reason) => reason.code === 'explicit-high-risk')?.category, 'runtime_security');
  assert.ok(!result.reasons.some((reason) => reason.code === 'runtime-sensitive-change'));
});

test('sample contracts suggest archive even when they carry low support reasons', () => {
  const result = evaluateRisk(input({
    contract: {
      ...baselineContract,
      contract_type: 'sample',
      risk_level: 'low',
    },
  }));

  assert.equal(result.suggestedAction, 'archive');
});
