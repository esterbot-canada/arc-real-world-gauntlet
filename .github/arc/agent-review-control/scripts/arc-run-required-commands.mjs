#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseMinimalAiplanText } from '../lib/aiplan/minimal-parser.ts';
import { verifyMinimalAiplanContractHash } from '../lib/aiplan/contract-hash.ts';
import { runTrustedReceipts, writeTrustedReceiptRun } from '../lib/review/trusted-receipt-runner.ts';

function usage() {
  return `ARC trusted receipt runner

Usage:
  npm run arc:run-required-commands -- --plan <path> --out <path> [--log-dir <dir>]

Options:
  --plan <path>     Frozen minimal .aiplan file
  --out <path>      Command receipts JSON output path
  --log-dir <dir>   Directory for command logs, default tmp/arc-command-logs
  --cwd <path>      Repository where required commands run and relative outputs are written, default current directory
  --help            Show this help
`;
}

function fail(message, details, code = 1) {
  console.error(`ARC trusted receipt runner failed: ${message}`);
  if (details) console.error(details);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { plan: null, out: null, logDir: 'tmp/arc-command-logs', cwd: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} requires a value.`, usage());
      return argv[index];
    };
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--plan') options.plan = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--log-dir') options.logDir = next();
    else if (arg === '--cwd') options.cwd = next();
    else fail(`Unknown option: ${arg}`, usage());
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.plan) fail('Missing --plan.', usage());
  if (!options.out) fail('Missing --out.', usage());

  const planPath = resolve(options.plan);
  if (options.cwd) process.chdir(resolve(options.cwd));

  const planText = await readFile(planPath, 'utf8');
  const parsed = parseMinimalAiplanText(planText);
  if (!parsed.ok) {
    fail('Invalid .aiplan.', parsed.errors.map((error) => `${error.field}: ${error.reason}`).join('\n'));
  }

  const hash = verifyMinimalAiplanContractHash(parsed.plan);
  if (!hash.ok) fail('Frozen .aiplan hash mismatch.', `expected ${hash.expected}; actual ${hash.actual}`);

  const result = await runTrustedReceipts({ plan: parsed.plan, logDir: options.logDir, cwd: process.cwd() });
  await writeTrustedReceiptRun(result, options.out);

  console.log(`ARC wrote ${result.receipts.length} trusted command receipt(s) to ${options.out}`);
  if (result.receipts.some((receipt) => receipt.exitCode !== 0)) process.exit(1);
}

main().catch((error) => {
  fail('Unexpected error.', error instanceof Error ? error.stack ?? error.message : String(error), 2);
});
