import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validContractMarkdown } from '../../lib/contracts/sample-contracts.ts';
import { closeDbForTests } from '../../lib/db.ts';
import { authorizeIngestRequest } from '../../lib/ingest/auth.ts';
import { createReviewItemFromRawInput, listReviewItems } from '../../lib/review/server-store.ts';

function request(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Request('http://localhost:3060/api/ingest/contracts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function withTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'arc-ingest-test-'));
  process.env.AGENT_REVIEW_CONTROL_DB_PATH = join(dir, 'arc.sqlite');
  closeDbForTests();

  return () => {
    closeDbForTests();
    delete process.env.AGENT_REVIEW_CONTROL_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  };
}

test('agent ingest refuses writes when ARC_INGEST_TOKEN is not configured', () => {
  const previousToken = process.env.ARC_INGEST_TOKEN;
  delete process.env.ARC_INGEST_TOKEN;

  const auth = authorizeIngestRequest(request({ rawInput: validContractMarkdown }));

  assert.equal(auth.ok, false);
  if (!auth.ok) {
    assert.equal(auth.status, 503);
    assert.match(auth.error, /ARC_INGEST_TOKEN/);
  }

  if (previousToken === undefined) delete process.env.ARC_INGEST_TOKEN;
  else process.env.ARC_INGEST_TOKEN = previousToken;
});

test('agent ingest rejects missing or invalid bearer tokens', () => {
  const previousToken = process.env.ARC_INGEST_TOKEN;
  process.env.ARC_INGEST_TOKEN = 'secret-token';

  const missing = authorizeIngestRequest(request({ rawInput: validContractMarkdown }));
  const invalid = authorizeIngestRequest(request({ rawInput: validContractMarkdown }, 'wrong-token'));

  assert.equal(missing.ok, false);
  assert.equal(invalid.ok, false);
  if (!missing.ok) assert.equal(missing.status, 401);
  if (!invalid.ok) assert.equal(invalid.status, 401);

  if (previousToken === undefined) delete process.env.ARC_INGEST_TOKEN;
  else process.env.ARC_INGEST_TOKEN = previousToken;
});

test('valid-token ingest path can create a review item and compute compare readiness', () => {
  const cleanup = withTempDb();
  const previousToken = process.env.ARC_INGEST_TOKEN;
  process.env.ARC_INGEST_TOKEN = 'secret-token';

  try {
    const auth = authorizeIngestRequest(request({ rawInput: validContractMarkdown }, 'secret-token'));
    assert.equal(auth.ok, true);

    const item = createReviewItemFromRawInput(validContractMarkdown, {
      source: 'openclaw-subagent',
      runId: 'run-ingest-test',
      receivedAt: '2026-05-08T17:00:00.000Z',
    });
    const allItems = listReviewItems();

    assert.equal(typeof item.id, 'string');
    assert.equal(item.contract.task_title, 'Add contract parser');
    assert.equal(item.ingestMetadata.source, 'openclaw-subagent');
    assert.equal(item.ingestMetadata.runId, 'run-ingest-test');
    assert.equal(item.ingestMetadata.receivedAt, '2026-05-08T17:00:00.000Z');
    assert.equal(allItems.length > 1, false);
  } finally {
    if (previousToken === undefined) delete process.env.ARC_INGEST_TOKEN;
    else process.env.ARC_INGEST_TOKEN = previousToken;
    cleanup();
  }
});
