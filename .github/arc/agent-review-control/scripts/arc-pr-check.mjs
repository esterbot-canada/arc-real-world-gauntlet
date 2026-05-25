#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { resolveDiffSource } from '../lib/gate/diff-range.ts';
import { loadChangedFilesForRange } from '../lib/gate/git-diff.ts';
import { parseCommandReceiptsText } from '../lib/review/command-receipts.ts';
import { createArcPrCheck } from '../lib/review/pr-check.ts';

function usage() {
  return `ARC PR check

Usage:
  npm run arc:pr-check -- --plan <path> --base <sha> --head <sha> --receipts <path> --out <path>

Options:
  --plan <path>       Frozen minimal .aiplan file
  --base <sha/ref>    Provider-derived PR base SHA/ref
  --head <sha/ref>    Provider-derived PR head SHA/ref
  --range <range>     Manual local git diff range, requires --allow-manual-range
  --allow-manual-range Allow caller-provided --range for local demos; result cannot Pass
  --allow-needs-review-exit-0 Allow Needs Review to exit 0 for local demos/report-only jobs
  --receipts <path>   JSON command receipts file
  --out <path>        Markdown output path, default arc-trust-brief.md
  --help              Show this help
`;
}

function fail(message, details, code = 1) {
  console.error(`ARC PR check failed: ${message}`);
  if (details) console.error(details);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { plan: null, base: null, head: null, range: null, allowManualRange: false, allowNeedsReviewExit0: false, receipts: null, out: 'arc-trust-brief.md', help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} requires a value.`, usage());
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--plan') options.plan = next();
    else if (arg === '--base') options.base = next();
    else if (arg === '--head') options.head = next();
    else if (arg === '--range') options.range = next();
    else if (arg === '--allow-manual-range') options.allowManualRange = true;
    else if (arg === '--allow-needs-review-exit-0') options.allowNeedsReviewExit0 = true;
    else if (arg === '--receipts') options.receipts = next();
    else if (arg === '--out') options.out = next();
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
  if (!options.receipts) fail('Missing --receipts.', usage());

  let diffSource;
  try {
    diffSource = resolveDiffSource(options);
  } catch (error) {
    fail('Invalid diff source.', error instanceof Error ? error.message : String(error));
  }

  const [planText, receiptsText, changedFiles] = await Promise.all([
    readFile(options.plan, 'utf8'),
    readFile(options.receipts, 'utf8'),
    loadChangedFilesForRange(process.cwd(), diffSource.range),
  ]);

  const parsedReceipts = parseCommandReceiptsText(receiptsText);
  if (!parsedReceipts.ok) fail('Invalid command receipts file.', parsedReceipts.errors.join('\n'));

  const result = createArcPrCheck({ planText, changedFiles, receipts: parsedReceipts.receipts, diffSource });
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, result.markdown, 'utf8');

  console.log(`ARC Trust Brief: ${result.status}`);
  console.log(`Wrote ${options.out}`);

  if (result.status === 'Blocked') process.exit(1);
  if (result.status === 'Needs Review' && !options.allowNeedsReviewExit0) process.exit(1);
}

main().catch((error) => {
  fail('Unexpected error.', error instanceof Error ? error.stack ?? error.message : String(error), 2);
});
