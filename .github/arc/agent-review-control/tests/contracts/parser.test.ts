import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractContractJsonBlock,
  parseContractMarkdown,
} from '../../lib/contracts/parser.ts';
import {
  CONTRACT_TYPES,
  CONTRACT_REQUIRED_FIELDS,
  REVIEW_CONTRACT_STATUS,
  RISK_LEVELS,
  validateContractData,
} from '../../lib/contracts/schema.ts';
import {
  incompleteContractMarkdown,
  invalidJsonContractMarkdown,
  validContractMarkdown,
} from '../../lib/contracts/sample-contracts.ts';

test('extracts the machine-readable JSON block from Markdown', () => {
  const extracted = extractContractJsonBlock(validContractMarkdown);

  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  assert.match(extracted.rawJson, /"task_title"/);
  assert.equal(extracted.parsed.task_title, 'Add contract parser');
});

test('validates required contract fields and allowed status/risk values', () => {
  assert.deepEqual(CONTRACT_REQUIRED_FIELDS, [
    'task_title',
    'status',
    'summary',
    'files_touched',
    'systems_touched',
    'tests_run',
    'risk_level',
    'open_questions',
    'rollback_note',
  ]);
  assert.ok(REVIEW_CONTRACT_STATUS.includes('DONE'));
  assert.ok(RISK_LEVELS.includes('medium'));
  assert.ok(CONTRACT_TYPES.includes('implementation'));

  const result = validateContractData({
    task_title: 'Add contract parser',
    status: 'DONE',
    summary: 'Adds parsing and validation.',
    contract_type: 'implementation',
    files_touched: ['lib/contracts/parser.ts'],
    systems_touched: ['contract-ingest'],
    tests_run: ['node --test'],
    risk_level: 'medium',
    open_questions: [],
    rollback_note: 'Revert the parser/schema changes.',
  });

  assert.equal(result.isComplete, true);
  assert.equal(result.validationStatus, 'Complete');
  assert.equal(result.contract.contract_type, 'implementation');
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.invalidFields, []);
});

test('rejects invalid optional contract types', () => {
  const result = validateContractData({
    task_title: 'Add contract parser',
    status: 'DONE',
    summary: 'Adds parsing and validation.',
    contract_type: 'misc',
    files_touched: ['lib/contracts/parser.ts'],
    systems_touched: ['contract-ingest'],
    tests_run: ['node --test'],
    risk_level: 'medium',
    open_questions: [],
    rollback_note: 'Revert the parser/schema changes.',
  });

  assert.equal(result.isComplete, false);
  assert.deepEqual(result.invalidFields, [{ field: 'contract_type', reason: 'Expected one of: planning, implementation, deployment, qa_review, ops_fix, sample.' }]);
});

test('parses a complete Markdown + JSON contract without inventing fields', () => {
  const result = parseContractMarkdown(validContractMarkdown);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.validationStatus, 'Complete');
  assert.equal(result.contract.task_title, 'Add contract parser');
  assert.equal(result.contract.rollback_note, 'Revert parser and schema files if ingest behavior regresses.');
  assert.equal('made_up_field' in result.contract, false);
});

test('accepts incomplete contracts and marks them needs-attention', () => {
  const result = parseContractMarkdown(incompleteContractMarkdown);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.validationStatus, 'Incomplete / Needs Attention');
  assert.equal(result.contract.task_title, 'Partial handoff');
  assert.deepEqual(result.missingFields.sort(), ['open_questions', 'risk_level', 'rollback_note', 'tests_run'].sort());
  assert.deepEqual(result.contract.tests_run, undefined);
});

test('reports invalid JSON clearly', () => {
  const result = parseContractMarkdown(invalidJsonContractMarkdown);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.code, 'INVALID_JSON');
  assert.match(result.message, /Invalid contract JSON/);
});

test('reports a missing JSON block clearly', () => {
  const result = parseContractMarkdown('# Contract\n\nNo machine-readable block here.');

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.code, 'JSON_BLOCK_NOT_FOUND');
  assert.match(result.message, /No machine-readable JSON block/);
});


test('accepts valid optional agent identity', () => {
  const result = validateContractData({
    task_title: 'Add agent identity',
    status: 'DONE',
    summary: 'Adds first-class agent identity.',
    files_touched: ['lib/contracts/schema.ts'],
    systems_touched: ['arc-contracts'],
    tests_run: ['node --test'],
    risk_level: 'low',
    open_questions: [],
    rollback_note: 'Revert schema changes.',
    agent: {
      name: 'backend-agent',
      id: 'agent-backend-001',
      role: 'backend implementation',
      runtime: 'openclaw',
      run_id: 'run-123',
      session_id: 'session-456',
    },
  });

  assert.equal(result.isComplete, true);
  assert.equal(result.contract.agent?.name, 'backend-agent');
  assert.deepEqual(result.invalidFields, []);
});

test('rejects invalid agent identity values', () => {
  const base = {
    task_title: 'Add agent identity',
    status: 'DONE',
    summary: 'Adds first-class agent identity.',
    files_touched: ['lib/contracts/schema.ts'],
    systems_touched: ['arc-contracts'],
    tests_run: ['node --test'],
    risk_level: 'low',
    open_questions: [],
    rollback_note: 'Revert schema changes.',
  };

  const stringAgent = validateContractData({ ...base, agent: 'backend-agent' });
  assert.deepEqual(stringAgent.invalidFields, [{ field: 'agent', reason: 'Expected an object with agent identity fields.' }]);

  const emptyString = validateContractData({ ...base, agent: { name: '' } });
  assert.deepEqual(emptyString.invalidFields, [{ field: 'agent.name', reason: 'Expected a non-empty string.' }]);

  const emptyObject = validateContractData({ ...base, agent: {} });
  assert.deepEqual(emptyObject.invalidFields, [{ field: 'agent', reason: 'Expected at least one agent identity field.' }]);

  const unknownNested = validateContractData({ ...base, agent: { team: 'platform' } });
  assert.deepEqual(unknownNested.invalidFields, [{ field: 'agent.team', reason: 'Unknown agent identity field.' }]);
});
