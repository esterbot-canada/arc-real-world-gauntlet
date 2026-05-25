import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveDiffSource } from '../../lib/gate/diff-range.ts';

const BASE_SHA = '1111111111111111111111111111111111111111';
const HEAD_SHA = '2222222222222222222222222222222222222222';

test('treats explicit CLI base/head as caller-provided, not provider-verified', () => {
  const result = resolveDiffSource({ base: BASE_SHA, head: HEAD_SHA, range: 'HEAD...HEAD', allowManualRange: true, env: {} });

  assert.equal(result.range, `${BASE_SHA}...${HEAD_SHA}`);
  assert.equal(result.trust, 'caller_provided');
});

test('derives provider-verified base/head from GitHub pull_request event path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-event-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } } }));

  const result = resolveDiffSource({ env: { GITHUB_EVENT_PATH: eventPath } });

  assert.equal(result.range, `${BASE_SHA}...${HEAD_SHA}`);
  assert.equal(result.trust, 'provider_verified');
});

test('rejects mutable refs in GitHub provider-verified event payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-event-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: 'main' }, head: { sha: HEAD_SHA } } }));

  assert.throws(() => resolveDiffSource({ env: { GITHUB_EVENT_PATH: eventPath } }), /immutable full commit SHAs/);
});

test('rejects manual range unless explicitly allowed for local demos', () => {
  assert.throws(() => resolveDiffSource({ range: 'HEAD...HEAD', env: {} }), /allow-manual-range/i);
});

test('allows manual range only with caller-provided trust label', () => {
  const result = resolveDiffSource({ range: 'HEAD...HEAD', allowManualRange: true, env: {} });

  assert.equal(result.range, 'HEAD...HEAD');
  assert.equal(result.trust, 'caller_provided');
});

test('rejects unsafe refs and partial base/head input', () => {
  assert.throws(() => resolveDiffSource({ base: 'main', env: {} }), /Both --base and --head/);
  assert.throws(() => resolveDiffSource({ base: '--main', head: 'HEAD', env: {} }), /Invalid --base/);
  assert.throws(() => resolveDiffSource({ base: 'main..evil', head: 'HEAD', env: {} }), /Invalid --base/);
});
