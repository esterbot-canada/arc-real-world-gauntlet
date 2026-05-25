import assert from 'node:assert/strict';
import test from 'node:test';

import { agentDisplayFor } from '../../lib/review/agent-identity.ts';
import type { ReviewItem } from '../../lib/review/types.ts';

function item(overrides: Partial<ReviewItem> = {}): Pick<ReviewItem, 'contract' | 'ingestMetadata'> {
  return {
    contract: {},
    ingestMetadata: {},
    ...overrides,
  };
}

test('contract identity wins over ingest metadata', () => {
  const display = agentDisplayFor(item({
    contract: { agent: { name: 'backend-agent', id: 'agent-1', role: 'backend', runtime: 'contract-runtime', run_id: 'contract-run', session_id: 'session-1' } },
    ingestMetadata: { source: 'ingest-runtime', runId: 'ingest-run' },
  }));

  assert.equal(display.name, 'backend-agent');
  assert.equal(display.id, 'agent-1');
  assert.equal(display.runtime, 'contract-runtime');
  assert.equal(display.runId, 'contract-run');
  assert.equal(display.sessionId, 'session-1');
  assert.equal(display.subtitle, 'backend · contract-runtime · contract-run');
  assert.equal(display.isKnown, true);
});

test('ingest metadata fills missing runtime and run id', () => {
  const display = agentDisplayFor(item({
    contract: { agent: { id: 'agent-2', role: 'qa' } },
    ingestMetadata: { source: 'openclaw', runId: 'run-789' },
  }));

  assert.equal(display.name, 'agent-2');
  assert.equal(display.runtime, 'openclaw');
  assert.equal(display.runId, 'run-789');
  assert.equal(display.subtitle, 'qa · openclaw · run-789');
});

test('unknown fallback is explicit when no identity is present', () => {
  const display = agentDisplayFor(item());

  assert.equal(display.name, 'Unknown agent');
  assert.equal(display.subtitle, '');
  assert.equal(display.isKnown, false);
});
