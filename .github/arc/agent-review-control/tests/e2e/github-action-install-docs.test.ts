import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseMinimalAiplanText } from '../../lib/aiplan/minimal-parser.ts';
import { verifyMinimalAiplanContractHash } from '../../lib/aiplan/contract-hash.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = path.join(appRoot, 'docs/github-action');

test('GitHub Action install docs name the required ARC check and branch protection behavior', async () => {
  const install = await readFile(path.join(docsRoot, 'install.md'), 'utf8');

  assert.match(install, /ARC Trust Brief/);
  assert.match(install, /Needs Review.*fail/s);
  assert.match(install, /Blocked.*fail/s);
  assert.match(install, /GitHub merge state can be blocked by things that are not ARC/);
  assert.match(install, /include test files in `allowed_scope\.files`/);
});

test('GitHub Action quickstart gives a short proof path and branch protection target', async () => {
  const quickstart = await readFile(path.join(docsRoot, 'quickstart.md'), 'utf8');

  assert.match(quickstart, /about 10 minutes/);
  assert.match(quickstart, /\.arc\/plan\.aiplan/);
  assert.match(quickstart, /\.github\/workflows\/arc-pr-check\.yml/);
  assert.match(quickstart, /Pass PR/);
  assert.match(quickstart, /Blocked PR/);
  assert.match(quickstart, /require `ARC Trust Brief`/);
  assert.match(quickstart, /--allow-manual-range/);
});

test('GitHub Action workflow example enforces the ARC verdict with the expected check name', async () => {
  const workflow = await readFile(path.join(docsRoot, 'arc-pr-check.workflow.yml'), 'utf8');

  assert.match(workflow, /name: ARC PR Check/);
  assert.match(workflow, /name: ARC Trust Brief/);
  assert.match(workflow, /arc-run-required-commands\.mjs/);
  assert.match(workflow, /arc-pr-check\.mjs/);
  assert.match(workflow, /arc-post-pr-comment\.mjs/);
  assert.match(workflow, /Enforce ARC verdict/);
  assert.doesNotMatch(workflow, /allow-needs-review-exit-0/);
});

test('GitHub Action example plan is frozen and includes tests as allowed evidence scope', async () => {
  const planText = await readFile(path.join(docsRoot, 'example-plan.aiplan'), 'utf8');
  const parsed = parseMinimalAiplanText(planText);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.plan.allowed_scope.files, ['src/signup/**', 'test/**']);
  assert.deepEqual(parsed.plan.excluded_scope.files, ['src/auth/**']);
  assert.deepEqual(parsed.plan.expected_evidence.required_commands, ['npm test']);
  assert.equal(verifyMinimalAiplanContractHash(parsed.plan).ok, true);
});
