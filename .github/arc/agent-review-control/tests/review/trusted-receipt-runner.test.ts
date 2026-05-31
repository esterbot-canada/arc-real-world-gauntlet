import assert from 'node:assert/strict';
import test from 'node:test';

import type { MinimalAiplanV1 } from '../../lib/aiplan/minimal-schema.ts';
import { runTrustedReceipts } from '../../lib/review/trusted-receipt-runner.ts';

const plan: MinimalAiplanV1 = {
  version: '1',
  kind: 'aiplan',
  status: 'frozen',
  allowed_scope: { files: ['src/signup/**'] },
  excluded_scope: { files: [] },
  expected_evidence: {
    required_commands: ['npm test -- SignupForm', 'npm run build'],
    required_changed_files: [],
    required_test_patterns: [],
  },
  freeze: { created_by: 'planner', frozen_at: '2026-05-24T00:00:00Z', contract_hash: 'sha256:test' },
};

test('runs required commands from the frozen plan and emits trusted_ci receipts', async () => {
  const seen: string[] = [];
  const result = await runTrustedReceipts({
    plan,
    logDir: 'tmp/arc-logs',
    runCommand: async (command) => {
      seen.push(command);
      return { exitCode: 0, output: `ok ${command}\n` };
    },
  });

  assert.deepEqual(seen, ['npm test -- SignupForm', 'npm run build']);
  assert.deepEqual(result.receipts.map((receipt) => receipt.provenance), ['trusted_ci', 'trusted_ci']);
  assert.deepEqual(result.receipts.map((receipt) => receipt.exitCode), [0, 0]);
  assert.equal(result.receipts[0].command, 'npm test -- SignupForm');
  assert.match(result.receipts[0].logPath ?? '', /^tmp\/arc-logs\/01-npm-test-signupform\.log$/);
  assert.match(result.logs[0].text, /^\$ npm test -- SignupForm\nok npm test -- SignupForm/m);
});

test('preserves failed exit codes instead of hiding command failure', async () => {
  const result = await runTrustedReceipts({
    plan: { ...plan, expected_evidence: { ...plan.expected_evidence, required_commands: ['npm test -- SignupForm'] } },
    logDir: 'tmp/arc-logs',
    runCommand: async () => ({ exitCode: 2, output: 'boom\n' }),
  });

  assert.equal(result.receipts[0].exitCode, 2);
  assert.equal(result.receipts[0].provenance, 'trusted_ci');
  assert.match(result.logs[0].text, /boom/);
});

test('empty required command list writes no receipts', async () => {
  const result = await runTrustedReceipts({
    plan: { ...plan, expected_evidence: { ...plan.expected_evidence, required_commands: [] } },
    logDir: 'tmp/arc-logs',
    runCommand: async () => { throw new Error('should not run'); },
  });

  assert.deepEqual(result.receipts, []);
  assert.deepEqual(result.logs, []);
});

test('rejects unsafe log directories so generated receipts remain parseable and portable', async () => {
  await assert.rejects(
    () => runTrustedReceipts({ plan, logDir: '/tmp/arc-logs', runCommand: async () => ({ exitCode: 0, output: '' }) }),
    /logDir must be relative/,
  );
  await assert.rejects(
    () => runTrustedReceipts({ plan, logDir: '../arc-logs', runCommand: async () => ({ exitCode: 0, output: '' }) }),
    /path traversal/,
  );
});
