import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMinimalAiplanContractHash } from '../../lib/aiplan/contract-hash.ts';
import { parseMinimalAiplanText } from '../../lib/aiplan/minimal-parser.ts';
import type { ArcDiffSource } from '../../lib/gate/diff-range.ts';
import { createArcPrCheck, type ArcPrCheckResult } from '../../lib/review/pr-check.ts';
import type { CommandReceipt } from '../../lib/review/command-receipts.ts';

type PlanOptions = {
  allowed?: string[];
  excluded?: string[];
  commands?: string[];
  status?: 'draft' | 'frozen';
  tamperAfterHash?: (planText: string) => string;
};

const providerVerifiedDiff: ArcDiffSource = {
  range: '1111111111111111111111111111111111111111...2222222222222222222222222222222222222222',
  trust: 'provider_verified',
  description: 'GitHub pull_request base/head SHAs',
};

const callerProvidedDiff: ArcDiffSource = {
  range: 'main...HEAD',
  trust: 'caller_provided',
  description: 'manual local range',
};

function frozenPlan(options: PlanOptions = {}): string {
  const allowed = options.allowed ?? ['src/signup/**', 'test/**'];
  const excluded = options.excluded ?? ['src/auth/**'];
  const commands = options.commands ?? ['npm test'];
  const status = options.status ?? 'frozen';

  const list = (items: string[]) => (items.length === 0 ? '    []' : items.map((item) => `    - ${JSON.stringify(item)}`).join('\n'));
  const raw = `version: "1"
kind: "aiplan"
status: ${JSON.stringify(status)}
allowed_scope:
  files:
${list(allowed)}
excluded_scope:
  files:
${list(excluded)}
expected_evidence:
  required_commands:
${list(commands)}
freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:placeholder"
`;

  const parsed = parseMinimalAiplanText(raw);
  if (!parsed.ok && status !== 'frozen') {
    const invalidPlan = raw.replace('sha256:placeholder', `sha256:${'0'.repeat(64)}`);
    return options.tamperAfterHash ? options.tamperAfterHash(invalidPlan) : invalidPlan;
  }

  assert.equal(parsed.ok, true, parsed.ok ? '' : JSON.stringify(parsed.errors));
  if (!parsed.ok) throw new Error('unreachable');
  const withHash = raw.replace('sha256:placeholder', computeMinimalAiplanContractHash(parsed.plan));
  return options.tamperAfterHash ? options.tamperAfterHash(withHash) : withHash;
}

function trustedReceipt(command = 'npm test'): CommandReceipt {
  return { command, exitCode: 0, provenance: 'trusted_ci', logPath: '.arc/tmp/test.log' };
}

function runCheck(input: {
  planText?: string;
  changedFiles?: string[];
  receipts?: CommandReceipt[];
  diffSource?: ArcDiffSource;
} = {}): ArcPrCheckResult {
  return createArcPrCheck({
    planText: input.planText ?? frozenPlan(),
    changedFiles: input.changedFiles ?? ['src/signup/signup.mjs', 'test/signup.test.mjs'],
    receipts: input.receipts ?? [trustedReceipt()],
    diffSource: input.diffSource ?? providerVerifiedDiff,
  });
}

test('ARC PR check gauntlet allows only fully in-contract provider-verified PRs to Pass', () => {
  const scenarios: Array<{
    name: string;
    result: ArcPrCheckResult;
    expectedStatus: ArcPrCheckResult['status'];
    expectedText: RegExp;
  }> = [
    {
      name: 'clean allowed source and test change with trusted CI receipt',
      result: runCheck(),
      expectedStatus: 'Pass',
      expectedText: /Changed files stayed inside approved scope/,
    },
    {
      name: 'explicit excluded scope touch blocks even when tests pass',
      result: runCheck({ changedFiles: ['src/auth/session.mjs'] }),
      expectedStatus: 'Blocked',
      expectedText: /excluded scope/,
    },
    {
      name: 'outside allowed source change needs review',
      result: runCheck({ changedFiles: ['src/profile/avatar.mjs'] }),
      expectedStatus: 'Needs Review',
      expectedText: /outside allowed scope/,
    },
    {
      name: 'test change needs review when tests were not in allowed scope',
      result: runCheck({ planText: frozenPlan({ allowed: ['src/signup/**'] }), changedFiles: ['src/signup/signup.mjs', 'test/signup.test.mjs'] }),
      expectedStatus: 'Needs Review',
      expectedText: /test\/signup\.test\.mjs.*outside allowed scope/s,
    },
    {
      name: 'missing required command receipt needs review',
      result: runCheck({ receipts: [] }),
      expectedStatus: 'Needs Review',
      expectedText: /Missing required command receipt: npm test/,
    },
    {
      name: 'failed required command receipt needs review',
      result: runCheck({ receipts: [{ command: 'npm test', exitCode: 1, provenance: 'trusted_ci', logPath: '.arc/tmp/test.log' }] }),
      expectedStatus: 'Needs Review',
      expectedText: /Failed required command receipt: npm test/,
    },
    {
      name: 'agent-reported receipt cannot produce pass',
      result: runCheck({ receipts: [{ command: 'npm test', exitCode: 0, provenance: 'agent_reported', logPath: '.arc/tmp/test.log' }] }),
      expectedStatus: 'Needs Review',
      expectedText: /agent-reported command receipts can be forged/,
    },
    {
      name: 'caller-provided diff range cannot produce pass',
      result: runCheck({ diffSource: callerProvidedDiff }),
      expectedStatus: 'Needs Review',
      expectedText: /caller-provided ranges can hide commits/,
    },
    {
      name: 'no changed files cannot produce pass',
      result: runCheck({ changedFiles: [] }),
      expectedStatus: 'Needs Review',
      expectedText: /No changed files were detected/,
    },
    {
      name: 'no required commands cannot produce pass',
      result: runCheck({ planText: frozenPlan({ commands: [] }), receipts: [] }),
      expectedStatus: 'Needs Review',
      expectedText: /No required command evidence was defined/,
    },
    {
      name: 'path traversal in changed file blocks',
      result: runCheck({ changedFiles: ['src/signup/signup.mjs', '../src/auth/session.mjs'] }),
      expectedStatus: 'Blocked',
      expectedText: /invalid changed path/,
    },
    {
      name: 'absolute changed path blocks',
      result: runCheck({ changedFiles: ['/src/signup/signup.mjs'] }),
      expectedStatus: 'Blocked',
      expectedText: /invalid changed path/,
    },
    {
      name: 'tampered plan hash blocks',
      result: runCheck({ planText: frozenPlan({ tamperAfterHash: (text) => text.replace('src/signup/**', 'src/**') }) }),
      expectedStatus: 'Blocked',
      expectedText: /hash mismatch/,
    },
    {
      name: 'draft plan blocks',
      result: runCheck({ planText: frozenPlan({ status: 'draft' }) }),
      expectedStatus: 'Blocked',
      expectedText: /Invalid or non-frozen/,
    },
    {
      name: 'lockfile change without allowed scope needs review',
      result: runCheck({ changedFiles: ['src/signup/signup.mjs', 'package-lock.json'] }),
      expectedStatus: 'Needs Review',
      expectedText: /package-lock\.json.*outside allowed scope/s,
    },
    {
      name: 'monorepo package scope can pass when all files are explicitly allowed',
      result: runCheck({ planText: frozenPlan({ allowed: ['packages/web/src/**', 'packages/web/test/**'], excluded: ['packages/web/src/auth/**'] }), changedFiles: ['packages/web/src/signup/signup.ts', 'packages/web/test/signup.test.ts'] }),
      expectedStatus: 'Pass',
      expectedText: /Changed files stayed inside approved scope/,
    },
    {
      name: 'substring-looking paths do not pass just because names are similar',
      result: runCheck({ planText: frozenPlan({ allowed: ['src/auth/**'], excluded: [] }), changedFiles: ['src/author/profile.mjs'] }),
      expectedStatus: 'Needs Review',
      expectedText: /outside allowed scope/,
    },
  ];

  for (const scenario of scenarios) {
    assert.equal(scenario.result.status, scenario.expectedStatus, `${scenario.name}\n${scenario.result.markdown}`);
    assert.match(scenario.result.markdown, scenario.expectedText, scenario.name);
  }
});

test('ARC PR check gauntlet has no false Pass for high-risk or incomplete scenarios', () => {
  const dangerousResults = [
    runCheck({ changedFiles: ['src/auth/session.mjs'] }),
    runCheck({ changedFiles: ['src/profile/avatar.mjs'] }),
    runCheck({ receipts: [] }),
    runCheck({ receipts: [{ command: 'npm test', exitCode: 0, provenance: 'agent_reported' }] }),
    runCheck({ diffSource: callerProvidedDiff }),
    runCheck({ changedFiles: [] }),
    runCheck({ planText: frozenPlan({ commands: [] }), receipts: [] }),
    runCheck({ changedFiles: ['../src/auth/session.mjs'] }),
    runCheck({ planText: frozenPlan({ tamperAfterHash: (text) => text.replace('src/signup/**', 'src/**') }) }),
  ];

  for (const result of dangerousResults) {
    assert.notEqual(result.status, 'Pass', result.markdown);
  }
});
