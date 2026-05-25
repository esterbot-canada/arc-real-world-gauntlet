import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const scriptPath = new URL('../../scripts/validate-arc-contract.mjs', import.meta.url).pathname;

function contractMarkdown(overrides: Record<string, unknown> = {}) {
  const contract = {
    task_title: 'Dogfood validator test',
    status: 'DONE',
    summary: 'Verifies the ARC contract validator.',
    files_touched: ['scripts/validate-arc-contract.mjs'],
    systems_touched: ['contract-ingest'],
    tests_run: ['node --test tests/scripts/validate-arc-contract.test.ts'],
    risk_level: 'low',
    open_questions: [],
    rollback_note: 'Revert scripts/validate-arc-contract.mjs and related tests.',
    ...overrides,
  };

  return `# Agent Review Contract\n\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n`;
}

async function withTempContract(markdown: string, fn: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'arc-contract-validator-'));
  const file = join(dir, 'contract.md');
  try {
    await writeFile(file, markdown, 'utf8');
    await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('validator passes a complete dogfood contract', async () => {
  await withTempContract(contractMarkdown(), async (file) => {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--file', file]);
    assert.match(stdout, /ARC contract validation passed/);
    assert.match(stdout, /Dogfood validator test/);
  });
});

test('validator fails when rollback_note is missing', async () => {
  const contract = JSON.parse(contractMarkdown().match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '{}');
  delete contract.rollback_note;

  await withTempContract(`# Agent Review Contract\n\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n`, async (file) => {
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, '--file', file]),
      (error: unknown) => {
        const err = error as { stderr?: string };
        assert.match(err.stderr ?? '', /Missing required fields: rollback_note/);
        return true;
      },
    );
  });
});

test('validator fails on unknown fields during dogfood', async () => {
  await withTempContract(contractMarkdown({ made_up_confidence: 'perfect' }), async (file) => {
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, '--file', file]),
      (error: unknown) => {
        const err = error as { stderr?: string };
        assert.match(err.stderr ?? '', /Unknown fields are not allowed/);
        return true;
      },
    );
  });
});

test('validator warns on vague test evidence', async () => {
  await withTempContract(contractMarkdown({ tests_run: ['tests passed'] }), async (file) => {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--file', file]);
    assert.match(stdout, /warnings:/);
    assert.match(stdout, /tests_run entry is vague/);
  });
});
