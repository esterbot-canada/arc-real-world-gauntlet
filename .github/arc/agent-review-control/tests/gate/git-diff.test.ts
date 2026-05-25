import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChangedFilesToContract, parseNameOnlyDiff } from '../../lib/gate/git-diff.ts';

test('parseNameOnlyDiff normalizes git name-only output', () => {
  assert.deepEqual(parseNameOnlyDiff(' ./apps/a.ts\napps/b.ts\n\n'), ['apps/a.ts', 'apps/b.ts']);
});

test('compareChangedFilesToContract reports unrelated and missing files', () => {
  const result = compareChangedFilesToContract({
    changedFiles: ['apps/a.ts', 'apps/extra.ts'],
    contractFiles: ['apps/a.ts', 'apps/missing.ts'],
  });

  assert.deepEqual(result.matchingFiles, ['apps/a.ts']);
  assert.deepEqual(result.unrelatedFiles, ['apps/extra.ts']);
  assert.deepEqual(result.missingContractFiles, ['apps/missing.ts']);
});
