import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');

function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
  return result;
}

function mustRun(command: string, args: string[], cwd: string) {
  const result = run(command, args, { cwd });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout.trim();
}

async function writePlan(repo: string, command = "node -e 'console.log(42)'") {
  const planPath = path.join(repo, '.arc/plan.aiplan');
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, `version: "1"
kind: "aiplan"
status: "frozen"
allowed_scope:
  files:
    - "src/signup/**"
excluded_scope:
  files:
    - "src/auth/**"
expected_evidence:
  required_commands:
    - "${command}"
freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:placeholder"
`);

  const hashScript = `
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMinimalAiplanText } from ${JSON.stringify(path.join(appRoot, 'lib/aiplan/minimal-parser.ts'))};
import { computeMinimalAiplanContractHash } from ${JSON.stringify(path.join(appRoot, 'lib/aiplan/contract-hash.ts'))};
const planPath = process.argv[1];
const raw = readFileSync(planPath, 'utf8');
const parsed = parseMinimalAiplanText(raw);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
writeFileSync(planPath, raw.replace('sha256:placeholder', computeMinimalAiplanContractHash(parsed.plan)));
`;
  const result = run(process.execPath, ['--input-type=module', '--eval', hashScript, planPath], { cwd: repo });
  assert.equal(result.status, 0, result.stderr);
  return planPath;
}

async function initWorkflowRepo() {
  const repo = await mkdtemp(path.join(tmpdir(), 'arc-workflow-test-'));
  await mkdir(path.join(repo, 'src/signup'), { recursive: true });
  await mkdir(path.join(repo, 'src/auth'), { recursive: true });

  mustRun('git', ['init', '-q'], repo);
  mustRun('git', ['config', 'user.email', 'arc-test@example.com'], repo);
  mustRun('git', ['config', 'user.name', 'ARC Workflow Test'], repo);

  await writeFile(path.join(repo, 'src/signup/Form.tsx'), 'export const signup = 1;\n');
  await writeFile(path.join(repo, 'src/auth/session.ts'), 'export const auth = 1;\n');
  const planPath = await writePlan(repo);

  mustRun('git', ['add', '.'], repo);
  mustRun('git', ['commit', '-q', '-m', 'baseline with frozen plan'], repo);
  const base = mustRun('git', ['rev-parse', 'HEAD'], repo);

  return { repo, planPath, base };
}

async function runArcWorkflow(repo: string, planPath: string, base: string, name: string) {
  const head = mustRun('git', ['rev-parse', 'HEAD'], repo);
  const eventPath = path.join(repo, `.arc/${name}.event.json`);
  const receiptsPath = path.join(repo, `.arc/${name}.receipts.json`);
  const briefPath = path.join(repo, `.arc/${name}.trust-brief.md`);
  await writeFile(eventPath, JSON.stringify({ pull_request: { number: 17, base: { sha: base }, head: { sha: head } } }));

  const receiptRun = run(process.execPath, [path.join(appRoot, 'scripts/arc-run-required-commands.mjs'), '--plan', planPath, '--out', receiptsPath, '--log-dir', `tmp/arc-workflow/${name}/logs`], { cwd: repo });
  assert.equal(receiptRun.status, 0, receiptRun.stderr);

  const checkRun = run(process.execPath, [path.join(appRoot, 'scripts/arc-pr-check.mjs'), '--plan', planPath, '--receipts', receiptsPath, '--out', briefPath], {
    cwd: repo,
    env: { GITHUB_EVENT_PATH: eventPath },
  });
  const brief = await readFile(briefPath, 'utf8');
  return { checkRun, brief };
}

test('ARC workflow passes only when frozen contract, provider diff, scope, and trusted receipts line up', async () => {
  const { repo, planPath, base } = await initWorkflowRepo();
  await writeFile(path.join(repo, 'src/signup/Form.tsx'), 'export const signup = 2;\n');
  mustRun('git', ['add', '.'], repo);
  mustRun('git', ['commit', '-q', '-m', 'implement signup change'], repo);

  const { checkRun, brief } = await runArcWorkflow(repo, planPath, base, 'pass');

  assert.equal(checkRun.status, 0, checkRun.stderr);
  assert.match(brief, /## ARC Trust Brief: Pass/);
  assert.match(brief, /Changed files stayed inside approved scope/);
  assert.match(brief, /Required command passed: node -e/);
});

test('ARC workflow blocks excluded-scope drift even when required command receipts pass', async () => {
  const { repo, planPath, base } = await initWorkflowRepo();
  await writeFile(path.join(repo, 'src/auth/session.ts'), 'export const auth = 2;\n');
  mustRun('git', ['add', '.'], repo);
  mustRun('git', ['commit', '-q', '-m', 'touch auth outside assignment'], repo);

  const { checkRun, brief } = await runArcWorkflow(repo, planPath, base, 'blocked');

  assert.equal(checkRun.status, 1);
  assert.match(brief, /## ARC Trust Brief: Blocked/);
  assert.match(brief, /excluded scope/);
  assert.match(brief, /src\/auth\/session\.ts/);
});

test('ARC composite action defaults to blocking Needs Review for required GitHub checks', async () => {
  const actionText = await readFile(path.join(appRoot, '.github/actions/arc-pr-check/action.yml'), 'utf8');

  assert.match(actionText, /blocking:/);
  assert.match(actionText, /default: 'true'/);
  assert.doesNotMatch(actionText, /npm run arc:pr-check -- .*--allow-needs-review-exit-0/);
  assert.match(actionText, /if \[ "\$\{\{ inputs\.blocking \}\}" != "true" \]; then/);
  assert.match(actionText, /args\+=\(--allow-needs-review-exit-0\)/);
});
