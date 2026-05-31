#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';

import { resolveDiffSource } from '../lib/gate/diff-range.ts';
import { loadChangedFilesForRange } from '../lib/gate/git-diff.ts';
import { parseCommandReceiptsText } from '../lib/review/command-receipts.ts';
import { createArcPrCheck } from '../lib/review/pr-check.ts';

const execFileAsync = promisify(execFile);

function usage() {
  return `ARC PR check

Usage:
  npm run arc:pr-check -- --plan <path> --base <sha> --head <sha> --receipts <path> --out <path>

Options:
  --plan <path>       Frozen minimal .aiplan file. In GitHub PRs ARC loads this from the provider-verified base SHA, not PR head.
  --base <sha/ref>    Provider-derived PR base SHA/ref
  --head <sha/ref>    Provider-derived PR head SHA/ref
  --range <range>     Manual local git diff range, requires --allow-manual-range
  --allow-manual-range Allow caller-provided --range for local demos; result cannot Pass
  --allow-needs-review-exit-0 Allow Needs Review to exit 0 for local demos/report-only jobs
  --repo-root <path>  Repository under review, default current directory. Use when ARC verifier code is loaded from a trusted checkout.
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
  const options = { plan: null, base: null, head: null, range: null, allowManualRange: false, allowNeedsReviewExit0: false, repoRoot: null, receipts: null, out: 'arc-trust-brief.md', help: false };

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
    else if (arg === '--repo-root') options.repoRoot = next();
    else if (arg === '--receipts') options.receipts = next();
    else if (arg === '--out') options.out = next();
    else fail(`Unknown option: ${arg}`, usage());
  }

  return options;
}

function normalizePath(path) {
  let normalized = path.replaceAll('\\', '/').trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function isSafeRepoPath(path) {
  const normalized = path.replaceAll('\\', '/').trim();
  if (normalized.length === 0) return false;
  if (normalized.startsWith('/')) return false;
  if (normalized.includes('//')) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
}

function extractLocalImportSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier?.startsWith('./') || specifier?.startsWith('../')) specifiers.push(specifier);
    }
  }

  return [...new Set(specifiers)];
}

function candidateImportPaths(importer, specifier) {
  const base = normalizePath(join(dirname(normalizePath(importer)), specifier));
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
  return extensions.flatMap((extension) => {
    const candidate = `${base}${extension}`;
    return [candidate, `${candidate}/index.ts`, `${candidate}/index.tsx`, `${candidate}/index.js`, `${candidate}/index.jsx`, `${candidate}/index.mjs`, `${candidate}/index.cjs`];
  }).map(normalizePath);
}

async function readTextIfPresent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function loadChangedFileTexts(changedFiles) {
  const texts = {};
  const queue = changedFiles.map(normalizePath);
  const seen = new Set();

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || seen.has(file) || !isSafeRepoPath(file)) continue;
    seen.add(file);

    const text = await readTextIfPresent(file);
    if (text === null) continue;
    texts[file] = text;

    if (!changedFiles.map(normalizePath).includes(file)) continue;
    for (const specifier of extractLocalImportSpecifiers(text)) {
      for (const candidate of candidateImportPaths(file, specifier)) {
        if (!seen.has(candidate) && isSafeRepoPath(candidate)) queue.push(candidate);
      }
    }
  }

  return texts;
}

async function readTrustedPlanText(path, diffSource) {
  const normalized = normalizePath(path);
  if (diffSource.trust !== 'provider_verified') return readFile(path, 'utf8');
  if (!diffSource.baseRef) throw new Error('Provider-verified diff source did not include a base ref for trusted plan loading.');
  if (!isSafeRepoPath(normalized)) throw new Error(`Unsafe --plan path: ${path}`);

  try {
    const { stdout } = await execFileAsync('git', ['show', `${diffSource.baseRef}:${normalized}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load trusted base-branch .aiplan from ${diffSource.baseRef}:${normalized}. ${detail}`);
  }
}

async function readReceiptsTextOrEmpty(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn(`ARC PR check warning: command receipts file not found at ${path}; continuing with empty receipts so a Trust Brief can still be rendered.`);
      return '[]';
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (!options.plan) fail('Missing --plan.', usage());
  if (!options.receipts) fail('Missing --receipts.', usage());
  if (options.repoRoot) process.chdir(resolve(options.repoRoot));

  let diffSource;
  try {
    diffSource = resolveDiffSource(options);
  } catch (error) {
    fail('Invalid diff source.', error instanceof Error ? error.message : String(error));
  }

  const [planText, receiptsText, changedFiles] = await Promise.all([
    readTrustedPlanText(options.plan, diffSource),
    readReceiptsTextOrEmpty(options.receipts),
    loadChangedFilesForRange(process.cwd(), diffSource.range),
  ]);
  const changedFileTexts = await loadChangedFileTexts(changedFiles);

  const parsedReceipts = parseCommandReceiptsText(receiptsText);
  if (!parsedReceipts.ok) fail('Invalid command receipts file.', parsedReceipts.errors.join('\n'));

  const normalizedPlanPath = normalizePath(options.plan);
  const result = createArcPrCheck({
    planText,
    changedFiles,
    changedFileTexts,
    receipts: parsedReceipts.receipts,
    diffSource,
    trustedPlanSource:
      diffSource.trust === 'provider_verified' && diffSource.baseRef
        ? {
            path: normalizedPlanPath,
            ref: diffSource.baseRef,
            changedInPr: changedFiles.map(normalizePath).includes(normalizedPlanPath),
          }
        : undefined,
  });
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
