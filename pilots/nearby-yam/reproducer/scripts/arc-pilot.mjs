#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMinimalAiplanText } from '../lib/aiplan/minimal-parser.ts';
import { computeMinimalAiplanContractHash } from '../lib/aiplan/contract-hash.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultPilotDir = 'tmp/manual-pilot';

function usage() {
  return `ARC manual pilot helper

Usage:
  npm run arc:pilot -- init [--dir <path>] [--force]
  npm run arc:pilot -- freeze [--plan <path>]
  npm run arc:pilot -- check --repo <path> --base <sha> --head <sha>
  npm run arc:pilot -- check --repo <path> --range <range>

Commands:
  init      Create the contract, Trust Brief, and logs workspace
  freeze    Validate the contract and update freeze.contract_hash
  check     Run the existing ARC verifier with manual-pilot defaults

Defaults:
  Pilot directory  ${defaultPilotDir}
  Contract         ${defaultPilotDir}/contract.aiplan
  Receipts         ${defaultPilotDir}/receipts.json
  ARC brief        ${defaultPilotDir}/generated-arc-brief.md
`;
}

function fail(message, details, code = 1) {
  console.error(`ARC pilot failed: ${message}`);
  if (details) console.error(details);
  process.exit(code);
}

function parseOptions(args, allowed) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!allowed.has(arg)) fail(`Unknown option: ${arg}`, usage());

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    index += 1;
    if (index >= args.length || args[index].startsWith('--')) fail(`${arg} requires a value.`, usage());
    options[arg.slice(2)] = args[index];
  }
  return options;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function initPilot(args) {
  const options = parseOptions(args, new Set(['--dir', '--force']));
  const pilotDir = path.resolve(options.dir ?? defaultPilotDir);
  const templates = [
    {
      source: path.join(appRoot, 'docs/manual-pilot/pilot-contract.aiplan'),
      destination: path.join(pilotDir, 'contract.aiplan'),
    },
    {
      source: path.join(appRoot, 'docs/manual-pilot/manual-trust-brief-template.md'),
      destination: path.join(pilotDir, 'trust-brief.md'),
    },
  ];

  if (options.force !== true) {
    const existing = [];
    for (const template of templates) {
      if (await exists(template.destination)) existing.push(template.destination);
    }
    if (existing.length > 0) {
      fail(`Refusing to overwrite ${existing.join(', ')}. Pass --force to replace existing pilot files.`);
    }
  }

  await mkdir(path.join(pilotDir, 'logs'), { recursive: true });
  for (const template of templates) await copyFile(template.source, template.destination);
  console.log(`ARC pilot workspace created at ${pilotDir}`);
  console.log(`Edit ${path.join(pilotDir, 'contract.aiplan')} before reviewing the implementation diff.`);
}

async function freezePilot(args) {
  const options = parseOptions(args, new Set(['--plan']));
  const planPath = path.resolve(options.plan ?? path.join(defaultPilotDir, 'contract.aiplan'));
  const raw = await readFile(planPath, 'utf8');
  const parsed = parseMinimalAiplanText(raw);

  if (!parsed.ok) {
    fail('Invalid .aiplan.', parsed.errors.map((error) => `${error.field}: ${error.reason}`).join('\n'));
  }

  const hash = computeMinimalAiplanContractHash(parsed.plan);
  const hashPattern = /(\bcontract_hash:\s*)(["'])?[^"'\r\n]+(?:\2)?/;
  if (!hashPattern.test(raw)) fail('Could not find a replaceable freeze.contract_hash field.');

  const updated = raw.replace(hashPattern, (_match, prefix, quote = '"') => `${prefix}${quote}${hash}${quote}`);
  await writeFile(planPath, updated, 'utf8');
  console.log(`ARC contract frozen: ${hash}`);
  console.log(`Updated ${planPath}`);
}

function checkPilot(args) {
  const options = parseOptions(args, new Set([
    '--repo',
    '--plan',
    '--receipts',
    '--out',
    '--base',
    '--head',
    '--range',
  ]));

  if (!options.repo) fail('Missing --repo.', usage());
  if ((options.base && !options.head) || (!options.base && options.head)) {
    fail('Both --base and --head are required when either is provided.', usage());
  }
  if (!options.range && !(options.base && options.head)) {
    fail('Missing diff boundary. Provide --base and --head, or --range.', usage());
  }
  if (options.range && (options.base || options.head)) {
    fail('Choose either --base/--head or --range, not both.', usage());
  }

  const verifierArgs = [
    path.join(appRoot, 'scripts/arc-pr-check.mjs'),
    '--repo-root', path.resolve(options.repo),
    '--plan', path.resolve(options.plan ?? path.join(defaultPilotDir, 'contract.aiplan')),
    '--receipts', path.resolve(options.receipts ?? path.join(defaultPilotDir, 'receipts.json')),
    '--out', path.resolve(options.out ?? path.join(defaultPilotDir, 'generated-arc-brief.md')),
    '--allow-needs-review-exit-0',
  ];

  if (options.range) {
    verifierArgs.push('--range', options.range, '--allow-manual-range');
  } else {
    verifierArgs.push('--base', options.base, '--head', options.head);
  }

  const result = spawnSync(process.execPath, verifierArgs, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) fail('Could not start ARC verifier.', result.error.message, 2);
  process.exit(result.status ?? 2);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  if (command === 'init') await initPilot(args);
  else if (command === 'freeze') await freezePilot(args);
  else if (command === 'check') checkPilot(args);
  else fail(`Unknown command: ${command}`, usage());
}

main().catch((error) => {
  fail('Unexpected error.', error instanceof Error ? error.stack ?? error.message : String(error), 2);
});
