import assert from 'node:assert/strict';
import test from 'node:test';

import { checkRequiredCommandReceipts, parseCommandReceiptsText } from '../../lib/review/command-receipts.ts';

test('flags missing required command', () => {
  const result = checkRequiredCommandReceipts({
    requiredCommands: ['npm test -- SignupForm'],
    receipts: [],
  });

  assert.deepEqual(result.satisfiedCommands, []);
  assert.deepEqual(result.failedCommands, []);
  assert.deepEqual(result.missingCommands, ['npm test -- SignupForm']);
});

test('accepts required command with zero exit code', () => {
  const result = checkRequiredCommandReceipts({
    requiredCommands: ['npm test -- SignupForm'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 0, logPath: 'logs/test.log' }],
  });

  assert.deepEqual(result.satisfiedCommands, ['npm test -- SignupForm']);
  assert.deepEqual(result.failedCommands, []);
  assert.deepEqual(result.missingCommands, []);
});

test('flags required command with non-zero exit code', () => {
  const result = checkRequiredCommandReceipts({
    requiredCommands: ['npm test -- SignupForm'],
    receipts: [{ command: 'npm test -- SignupForm', exitCode: 1, logPath: 'logs/test.log' }],
  });

  assert.deepEqual(result.failedCommands, ['npm test -- SignupForm']);
});

test('parses command receipt json', () => {
  const result = parseCommandReceiptsText('[{"command":"npm test -- SignupForm","exitCode":0,"provenance":"trusted_ci"}]');

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.receipts, [{ command: 'npm test -- SignupForm', exitCode: 0, provenance: 'trusted_ci' }]);
});

test('treats duplicate conflicting command receipts as failed evidence instead of pass', () => {
  const result = checkRequiredCommandReceipts({
    requiredCommands: ['npm test -- SignupForm'],
    receipts: [
      { command: 'npm test -- SignupForm', exitCode: 0 },
      { command: 'npm test -- SignupForm', exitCode: 1 },
    ],
  });

  assert.deepEqual(result.satisfiedCommands, []);
  assert.deepEqual(result.failedCommands, ['npm test -- SignupForm']);
  assert.deepEqual(result.missingCommands, []);
});

test('parsing receipts rejects unknown fields and empty log paths', () => {
  assert.equal(parseCommandReceiptsText('[{"command":"npm test","exitCode":0,"pretend":true}]').ok, false);
  assert.equal(parseCommandReceiptsText('[{"command":"npm test","exitCode":0,"logPath":"   "}]').ok, false);
});

test('parsing receipts rejects path traversal log paths', () => {
  assert.equal(parseCommandReceiptsText('[{"command":"npm test","exitCode":0,"logPath":"../../fake.log"}]').ok, false);
});

test('parsing receipts rejects invalid provenance', () => {
  assert.equal(parseCommandReceiptsText('[{"command":"npm test","exitCode":0,"provenance":"agent_says_trust_me"}]').ok, false);
});
