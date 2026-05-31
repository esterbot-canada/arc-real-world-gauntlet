#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultArcRoots = [
  process.env.ARC_APP_ROOT,
  '/home/simranjit/.openclaw/workspace/apps/agent-review-control',
  resolve(repoRoot, '.github/arc/agent-review-control'),
].filter(Boolean);

function usage() {
  return `Run ARC gauntlet fixtures

Usage:
  node scripts/run-arc-gauntlet.mjs [scenario-id ...]

Environment:
  ARC_APP_ROOT=/path/to/apps/agent-review-control  Override ARC implementation root
`;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true, scenarioIds: [] };
  return { help: false, scenarioIds: argv.filter((arg) => !arg.startsWith('-')) };
}

function resolveArcRoot() {
  for (const candidate of defaultArcRoots) {
    const root = resolve(String(candidate));
    if (existsSync(resolve(root, 'lib/review/pr-check.ts'))) return root;
  }
  throw new Error('Could not find ARC app root. Set ARC_APP_ROOT=/path/to/apps/agent-review-control.');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listFixtureScenarioIds(selectedIds) {
  if (selectedIds.length > 0) return selectedIds;
  const scenariosRoot = resolve(repoRoot, '.arc/scenarios');
  const entries = await readdir(scenariosRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(resolve(scenariosRoot, id, 'fixture.json')))
    .sort();
}

function assertFixture(value, scenarioId) {
  if (!Array.isArray(value.changedFiles) || value.changedFiles.some((file) => typeof file !== 'string')) {
    throw new Error(`${scenarioId}: fixture.changedFiles must be an array of strings.`);
  }
  if (!Array.isArray(value.receipts)) throw new Error(`${scenarioId}: fixture.receipts must be an array.`);
  if (value.changedFileTexts !== undefined && (typeof value.changedFileTexts !== 'object' || Array.isArray(value.changedFileTexts) || value.changedFileTexts === null)) {
    throw new Error(`${scenarioId}: fixture.changedFileTexts must be an object when provided.`);
  }
  if (value.expectedMarkdownIncludes !== undefined && (!Array.isArray(value.expectedMarkdownIncludes) || value.expectedMarkdownIncludes.some((item) => typeof item !== 'string'))) {
    throw new Error(`${scenarioId}: fixture.expectedMarkdownIncludes must be an array of strings when provided.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const arcRoot = resolveArcRoot();
  const { createArcPrCheck } = await import(pathToFileURL(resolve(arcRoot, 'lib/review/pr-check.ts')).href);
  const scenarioIds = await listFixtureScenarioIds(options.scenarioIds);
  if (scenarioIds.length === 0) throw new Error('No fixture scenarios found.');

  const outDir = resolve(repoRoot, '.arc/tmp/gauntlet');
  await mkdir(outDir, { recursive: true });

  const failures = [];
  for (const scenarioId of scenarioIds) {
    const scenarioDir = resolve(repoRoot, '.arc/scenarios', scenarioId);
    const [planText, expected, fixture] = await Promise.all([
      readFile(resolve(scenarioDir, 'plan.aiplan'), 'utf8'),
      readJson(resolve(scenarioDir, 'expected.json')),
      readJson(resolve(scenarioDir, 'fixture.json')),
    ]);
    assertFixture(fixture, scenarioId);

    const result = createArcPrCheck({
      planText,
      changedFiles: fixture.changedFiles,
      changedFileTexts: fixture.changedFileTexts,
      receipts: fixture.receipts,
      diffSource: fixture.diffSource ?? { range: `${scenarioId}-fixture`, trust: 'provider_verified', description: 'gauntlet fixture changed files' },
    });

    const outPath = resolve(outDir, `${scenarioId}.md`);
    await writeFile(outPath, result.markdown, 'utf8');

    const expectedVerdict = expected.expectedVerdict;
    const missingMarkdown = (fixture.expectedMarkdownIncludes ?? []).filter((text) => !result.markdown.includes(text));
    const ok = result.status === expectedVerdict && missingMarkdown.length === 0;
    const icon = ok ? 'PASS' : 'FAIL';
    console.log(`${icon} ${scenarioId}: expected ${expectedVerdict}, got ${result.status}`);

    if (!ok) {
      failures.push({ scenarioId, expectedVerdict, actualVerdict: result.status, missingMarkdown, outPath });
    }
  }

  if (failures.length > 0) {
    console.error('\nARC gauntlet failures:');
    for (const failure of failures) {
      console.error(`- ${failure.scenarioId}: expected ${failure.expectedVerdict}, got ${failure.actualVerdict}; brief ${failure.outPath}`);
      for (const missing of failure.missingMarkdown) console.error(`  missing: ${missing}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nARC gauntlet fixtures passed: ${scenarioIds.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
